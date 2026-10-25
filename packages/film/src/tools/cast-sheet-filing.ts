// A cast keep filed under the member's record lock: whether the owner's
// choice may be kept (a kind kept already is refused unless he replaces it
// on his answer to an ask), the try cut by the caller into its sheet and
// views, then the files and the record. The cut is the caller's
// (`cast-sheet-keep.ts` measures the try), so the order of the files and the
// record is held here apart from any image.
//
// A replace copies the old kept sheet and its views into the member's history
// (`kept/replaced/<date>-<kind>-<try>/`, `-2`, `-3` … when the record's
// history names it already), then writes the new try's files in place, and
// the record last. A replace stopped at any write leaves the record naming
// the old keep with every file it names in place, and its copies whole in a
// history folder the record does not name yet: a retry finds that folder and
// finishes. On a member that keeps some views of a sheet it shares, the new
// keep keeps the same views.

import {
  Array as Arr,
  Boolean as Bool,
  DateTime,
  Effect,
  FileSystem,
  Option,
  Path,
  Result,
  Schema,
} from 'effect';
import {
  castKindPlan,
  type CastKindPlan,
  type CastKept,
  CastSheetJson,
  type CastSheetRecord,
  type CastTry,
  withCastKept,
  withCastReplaced,
} from '../core/cast-record.ts';
import { SheetKind } from '../core/cast-sheet.ts';
import type { PixelBox } from '../core/figure.ts';
import { Segment } from '../core/segment.ts';
import { ContentStore } from './content-store.ts';

/** A kind kept already, or a try the record does not hold, or one whose image no longer reads as its sheet. */
class SheetKept extends Schema.TaggedError<SheetKept>()('SheetKept', {
  member: Schema.String,
  kind: SheetKind,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.member}'s ${this.kind} sheet is not kept: ${this.reason}`;
  }
}

/** What the owner chose: the kind, the try, his why, the ask he answered it on, and whether it replaces the kind's keep. */
export interface CastKeep {
  readonly kind: SheetKind;
  readonly n: number;
  readonly why: string;
  readonly ask: Option.Option<string>;
  readonly replace: boolean;
}

/** A try as the caller cut it: its bytes as drawn, and each view's number, name, box and crop. */
interface CastCut {
  readonly bytes: Uint8Array;
  readonly views: ReadonlyArray<{
    readonly view: number;
    readonly name: string;
    readonly box: PixelBox;
    readonly png: Uint8Array;
  }>;
}

/** What the cut is given: the try, the kind's plan, and the refusal its own failures read as. */
interface CutOf {
  readonly tried: CastTry;
  readonly plan: CastKindPlan;
  readonly refused: (reason: string) => SheetKept;
}

/** The keep a replace moves aside, and the ask it is replaced on: none on a first keep; a refusal's reason when the keep may not go ahead. */
const replacing = (
  was: Option.Option<CastKept>,
  keep: CastKeep,
): Result.Result<Option.Option<{ readonly was: CastKept; readonly ask: string }>, string> =>
  Option.match(was, {
    onNone: () =>
      Bool.match(keep.replace, {
        onTrue: () => Result.fail('there is nothing kept to replace: keep it without --replace'),
        onFalse: () => Result.succeed(Option.none()),
      }),
    onSome: (kept) =>
      Bool.match(keep.replace, {
        onFalse: () =>
          Result.fail(
            "it is kept already: a kept sheet is never drawn again; draw a missing view as an addition, or replace it on the owner's answer (--replace --ask <id>)",
          ),
        onTrue: () =>
          Option.match(keep.ask, {
            onNone: () =>
              Result.fail(
                "a kept sheet is replaced only on the owner's answer: name the ask he answered (--ask <id>)",
              ),
            onSome: (ask) => Result.succeed(Option.some({ was: kept, ask })),
          }),
      }),
  });

/** The views a keep keeps: every view the try cut, or on a replace the views the old keep kept (a member that keeps some views of a sheet it shares keeps the same ones); a view the old keep kept that the try lacks is a refusal's reason. */
const viewsKept = <V extends { readonly view: number }>(
  cut: ReadonlyArray<V>,
  was: Option.Option<CastKept>,
): Result.Result<ReadonlyArray<V>, string> =>
  Option.match(was, {
    onNone: () => Result.succeed(cut),
    onSome: (old) => {
      const numbers = old.views.map((v) => v.view);
      const lacking = numbers.filter((n) => !cut.some((v) => v.view === n));
      if (lacking.length > 0)
        return Result.fail(
          `the try has no view ${lacking.join(', ')}, which the keep it replaces kept`,
        );
      return Result.succeed(cut.filter((v) => numbers.includes(v.view)));
    },
  });

/** The folder a replace sets the old keep aside in: `base`, else `base-2`, `base-3` …, the first the record's history does not name. */
const historyFolder = (record: CastSheetRecord, base: string): string => {
  const taken = new Set((record.replaced ?? []).map((r) => r.folder));
  return Option.getOrElse(
    Arr.findFirst(
      Arr.range(1, taken.size + 1).map((k) =>
        Bool.match(k === 1, { onTrue: () => base, onFalse: () => `${base}-${k}` }),
      ),
      (name) => !taken.has(name),
    ),
    () => base,
  );
};

/** File the keep of try `keep.n` of the member's `keep.kind` sheet, cut by `cut`: its image and views into the folder, the keep into the record. */
export const fileCastKeep = Effect.fn('Cast.file')(function* <E, R>(
  place: { readonly folder: string },
  keep: CastKeep,
  cut: (of: CutOf) => Effect.Effect<CastCut, E, R>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const store = yield* ContentStore;
  const file = path.join(place.folder, 'cast-sheet.json');
  return yield* store.transact({ file, codec: CastSheetJson, empty: emptyRecord }, (record) =>
    Effect.gen(function* () {
      const refused = (reason: string) =>
        SheetKept.make({ member: record.member, kind: keep.kind, reason });
      const replace = yield* Effect.fromResult(
        Result.mapError(replacing(Option.fromUndefinedOr(record.kept?.[keep.kind]), keep), refused),
      );
      const plan = yield* Effect.fromResult(castKindPlan(record, keep.kind));
      const tried = yield* Effect.fromOption(
        Option.fromUndefinedOr(record.sheets[keep.kind]?.tries.find((t) => t.n === keep.n)),
      ).pipe(Effect.mapError(() => refused(`the record holds no try ${keep.n}`)));
      const whole = yield* cut({ tried, plan, refused });
      const views = yield* Effect.fromResult(
        Result.mapError(
          viewsKept(
            whole.views,
            Option.map(replace, ({ was }) => was),
          ),
          refused,
        ),
      );
      const kept: CastKept = {
        try: keep.n,
        why: keep.why,
        ...Option.match(keep.ask, { onNone: () => ({}), onSome: (ask) => ({ ask }) }),
        views: views.map(({ view, name, box }) => ({ view, name, box })),
      };
      const now = yield* DateTime.now;
      const after = yield* Option.match(replace, {
        onNone: () => Effect.succeed(withCastKept(record, keep.kind, kept)),
        onSome: ({ was, ask }) =>
          Effect.gen(function* () {
            const folder = historyFolder(
              record,
              path.join(
                'kept',
                'replaced',
                `${DateTime.formatIsoDate(now)}-${keep.kind}-${was.try}`,
              ),
            );
            const into = path.join(place.folder, folder);
            const aside = [
              {
                from: path.join(place.folder, 'kept', `${keep.kind}.png`),
                to: path.join(into, `${keep.kind}.png`),
              },
              ...was.views.map((v) => ({
                from: path.join(place.folder, 'views', `${v.name}.png`),
                to: path.join(into, 'views', `${v.name}.png`),
              })),
            ];
            const copied = yield* Effect.forEach(aside, (f) => fs.exists(f.to));
            // Every copy there means a replace stopped after setting the old keep
            // aside: the files in place may be the new try's since, so they are not
            // copied again. A copy missing means nothing in place was written yet.
            if (!copied.every(Boolean)) {
              const present = yield* Effect.forEach(aside, (f) => fs.exists(f.from));
              const missing = aside.filter((_, k) => !present[k]).map((f) => f.from);
              if (missing.length > 0)
                return yield* refused(
                  `its kept files are not all on disk (${missing.join(', ')}): restore them from git before replacing it`,
                );
              yield* Effect.forEach(aside, (f) =>
                Effect.flatMap(fs.readFile(f.from), (bytes) => store.writeFile(f.to, bytes)),
              );
            }
            return withCastReplaced(record, kept, {
              kind: keep.kind,
              kept: was,
              by: keep.n,
              folder,
              ask,
              why: keep.why,
              at: DateTime.formatIso(now),
            });
          }),
      });
      yield* fs.makeDirectory(path.join(place.folder, 'kept'), { recursive: true });
      yield* fs.makeDirectory(path.join(place.folder, 'views'), { recursive: true });
      yield* fs.writeFile(path.join(place.folder, 'kept', `${keep.kind}.png`), whole.bytes);
      yield* Effect.forEach(views, (v) =>
        fs.writeFile(path.join(place.folder, 'views', `${v.name}.png`), v.png),
      );
      return [kept, after] as const;
    }),
  );
});

/** A missing record reads as one with no sheets, so its keep is refused before anything is written. */
const emptyRecord: CastSheetRecord = {
  member: Segment.make('unrecorded'),
  scope: 'film',
  who: '',
  refs: [],
  sheets: {},
};
