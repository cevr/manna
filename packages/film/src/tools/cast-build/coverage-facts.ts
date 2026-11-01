// The facts a member's coverage is read from, each read off his folder:
// drawn, its file is on disk; kept, his `cast-sheet.json` names the view
// kept, or his family's record (`cutout/<family>/record.json`) names the
// key; cut, its part sheet's record (`cutout/sheets/<sheet>/record.json`)
// is on disk and its kept answer was drawn from the current input; bars, that
// answer misses no bar, or each bar it misses is named; fit, its fit rows
// pass. Whether a record is current and whether the fit rows pass are stage
// results, the build cache's at the current inputs (`built.ts`
// `measuredOf`): one the caller does not pass is `unmeasured`.

import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import { SheetKind } from '../../core/cast-sheet.ts';
import type { Coverage, Entry, EntryFacts, Requirement } from './coverage.ts';

/** A stage's result for an entry: its part sheet current (`cut`), its fit rows passed (`fit`). */
export interface Measured {
  readonly cut: Option.Option<boolean>;
  readonly fit: Option.Option<boolean>;
}

const KeptViews = Schema.Struct({ views: Schema.Array(Schema.Struct({ name: Schema.String })) });
const CastSheetKept = Schema.Struct({
  kept: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Union([KeptViews, Schema.Array(KeptViews)])),
  ),
});
const FamilyRecord = Schema.Struct({ keys: Schema.Array(Schema.Struct({ id: Schema.String })) });
const SheetRecord = Schema.Struct({
  missed: Schema.Array(Schema.String),
  named: Schema.optionalKey(Schema.Array(Schema.Struct({ bar: Schema.String }))),
});
const SheetRecordJson = Schema.fromJsonString(SheetRecord);

/** Whether a part sheet's record passes its bars: it misses no bar, or names each one it misses. No record passes none. */
const barsPass = (record: Option.Option<typeof SheetRecord.Type>) =>
  Option.exists(record, (r) => r.missed.every((bar) => (r.named ?? []).some((n) => n.bar === bar)));

/** `barsPass` over a record's text; text that is no record passes none. */
export const barsOfRecord = (text: Option.Option<string>) =>
  Effect.map(
    Effect.option(Effect.flatMap(Effect.fromOption(text), Schema.decodeEffect(SheetRecordJson))),
    barsPass,
  );

/** A puppet view's id, `<kind>-<view>`, read as its kind and view; a key's `<family>/<key>` reads as neither. */
export const viewOfId = (id: string): Option.Option<{ kind: SheetKind; view: string }> =>
  Option.flatMap(Option.fromNullishOr(/^([a-z]+)-(.+)$/.exec(id)), ([, kind, view]) =>
    Option.map(Schema.decodeUnknownOption(SheetKind)(kind), (k) => ({ kind: k, view: view ?? '' })),
  );

/** A key's id, `<family>/<key>`, read as its family and key. */
export const keyOfId = (id: string): Option.Option<{ family: string; key: string }> =>
  Option.map(Option.fromNullishOr(/^([^/]+)\/([^/]+)$/.exec(id)), ([, family, key]) => ({
    family: family ?? '',
    key: key ?? '',
  }));

/** The part sheet folder an entry is cut into: its view's, `<family>-<key>` for a key, its fitted entry's for a fitted pose. */
export const sheetOf = (entry: Entry): string => {
  const id = entry.fitted ?? entry.id;
  return Option.match(viewOfId(id), {
    onSome: ({ view }) => view,
    onNone: () => id.replace('/', '-'),
  });
};

const readJson = <S extends Schema.Top>(schema: S, file: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    if (!(yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false)))) return Option.none();
    return yield* fs
      .readFileString(file)
      .pipe(Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(schema))), Effect.option);
  });

/**
 * Each entry's facts, read off the member's folder (`memberDir`, the one
 * holding `cast-sheet/` and `cutout/`), with the stage results `measured`
 * holds; a stage result it lacks is false and `unmeasured`.
 */
export const coverageFacts = Effect.fn('film.cast.coverageFacts')(function* (
  memberDir: string,
  coverage: Coverage,
  measured: Readonly<Record<string, Measured>>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const sheet = yield* readJson(
    CastSheetKept,
    path.join(memberDir, 'cast-sheet', 'cast-sheet.json'),
  );
  const keptViews = new Set(
    Option.match(sheet, {
      onNone: () => [],
      onSome: (s) =>
        Object.values(s.kept ?? {}).flatMap((k) =>
          [k].flat().flatMap((one: KeptViewsType) => one.views.map((v) => v.name)),
        ),
    }),
  );
  const facts: Record<string, EntryFacts> = {};
  for (const entry of coverage.entries) {
    const drawn = yield* fs
      .exists(path.join(memberDir, entry.file))
      .pipe(Effect.orElseSucceed(() => false));
    const kept = yield* Option.match(keyOfId(entry.id), {
      onNone: () =>
        Effect.succeed(Option.exists(viewOfId(entry.id), ({ view }) => keptViews.has(view))),
      onSome: ({ family, key }) =>
        readJson(FamilyRecord, path.join(memberDir, 'cutout', family, 'record.json')).pipe(
          Effect.map(Option.exists((r) => r.keys.some((k) => k.id === key))),
        ),
    });
    if (entry.cut === 'key') {
      facts[entry.id] = { drawn, kept, cut: false, bars: false, fit: false };
      continue;
    }
    const record = yield* readJson(
      SheetRecord,
      path.join(memberDir, 'cutout', 'sheets', sheetOf(entry), 'record.json'),
    );
    const bars = barsPass(record);
    const result = Option.fromNullishOr(measured[entry.id]);
    const cut = Option.flatMap(result, (r) => r.cut);
    const fit = Option.flatMap(result, (r) => r.fit);
    const unmeasured: Array<Requirement> = [];
    if (Option.isSome(record) && Option.isNone(cut)) unmeasured.push('cut');
    if (Option.isNone(fit)) unmeasured.push('fit');
    facts[entry.id] = {
      drawn,
      kept,
      cut: Option.isSome(record) && Option.getOrElse(cut, () => false),
      bars,
      fit: Option.getOrElse(fit, () => false),
      unmeasured,
    };
  }
  return facts;
});

type KeptViewsType = typeof KeptViews.Type;
