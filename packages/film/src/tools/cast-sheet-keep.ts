// A cast sheet kept (`film concept keep`), on the owner's answer: the try
// he chose copied into the member's folder as `kept/<kind>.png`, each view
// cut from it at 1:1 as `views/<name>.png` (the source a rig view is traced
// from and its match held to), cut on white as the measure reads the sheet
// (the trace and the match read colour, and a sheet painted with no paper is
// transparent round the figures; `kept/<kind>.png` keeps the try's bytes as
// drawn), and the keep recorded in `cast-sheet.json`
// with his why and the ask he answered. Both folders are committed beside the
// record: a lock's source survives a clean checkout. A kind already kept is
// refused (`SheetKept`): a kept sheet sets the member's look for every film
// that draws him, so it is never drawn again; a missing view is an addition.
// The owner's answer on an ask is the one authority that replaces it
// (`--replace --ask <id>`): the kept sheet and its views move into the
// member's history (`kept/replaced/<date>-<kind>-<try>/`, the same names
// beneath), the new try is kept in their place, and the record's `replaced`
// names the keep replaced, the try kept for it, the ask, his why and when.

import {
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
  type CastKept,
  CastSheetJson,
  type CastSheetRecord,
  viewName,
  withCastKept,
  withCastReplaced,
} from '../core/cast-record.ts';
import { measureSheet, SheetKind } from '../core/cast-sheet.ts';
import { opaqueOf } from '../core/cast-sheet-pixels.ts';
import { cropRaster } from '../core/raster.ts';
import { Segment } from '../core/segment.ts';
import { ContentStore } from './content-store.ts';
import { decodePng, encodePng } from './png.ts';

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
interface CastKeep {
  readonly kind: SheetKind;
  readonly n: number;
  readonly why: string;
  readonly ask: Option.Option<string>;
  readonly replace: boolean;
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

/** Keep try `keep.n` of the member's `keep.kind` sheet: its image and views into the folder, the keep into the record; a replace first moves the kind's kept sheet and views into its history. */
export const keepCastSheet = Effect.fn('Cast.keep')(function* (
  place: { readonly folder: string; readonly out: string },
  keep: CastKeep,
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
      const bytes = yield* fs.readFile(path.join(place.out, tried.file));
      const sheet = yield* Effect.fromResult(decodePng(bytes));
      const opaque = opaqueOf(sheet);
      const m = yield* Effect.fromResult(
        Result.mapError(measureSheet(sheet, plan.options), (e) => refused(e.message)),
      );
      const views = m.views.map((v) => ({
        view: v.view,
        name: viewName(keep.kind, v.view),
        box: v.box,
      }));
      const kept: CastKept = {
        try: keep.n,
        why: keep.why,
        ...Option.match(keep.ask, { onNone: () => ({}), onSome: (ask) => ({ ask }) }),
        views,
      };
      const now = yield* DateTime.now;
      const after = yield* Option.match(replace, {
        onNone: () => Effect.succeed(withCastKept(record, keep.kind, kept)),
        onSome: ({ was, ask }) =>
          Effect.gen(function* () {
            const folder = path.join(
              'kept',
              'replaced',
              `${DateTime.formatIsoDate(now)}-${keep.kind}-${was.try}`,
            );
            const into = path.join(place.folder, folder);
            if (yield* fs.exists(into))
              return yield* refused(`its history folder ${folder} is there already`);
            yield* fs.makeDirectory(path.join(into, 'views'), { recursive: true });
            yield* fs.rename(
              path.join(place.folder, 'kept', `${keep.kind}.png`),
              path.join(into, `${keep.kind}.png`),
            );
            yield* Effect.forEach(was.views, (v) =>
              fs.rename(
                path.join(place.folder, 'views', `${v.name}.png`),
                path.join(into, 'views', `${v.name}.png`),
              ),
            );
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
      yield* fs.writeFile(path.join(place.folder, 'kept', `${keep.kind}.png`), bytes);
      yield* Effect.forEach(views, (v) =>
        fs.writeFile(
          path.join(place.folder, 'views', `${v.name}.png`),
          encodePng(cropRaster(opaque, v.box)),
        ),
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
