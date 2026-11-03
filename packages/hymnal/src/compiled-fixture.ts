import { Effect, FileSystem, Schema } from 'effect';

import { type Hymn, Hymn as HymnSchema } from './hymn.js';

export const FOLDER = new URL('../data/sdah-1985/', import.meta.url).pathname;

const decodeHymn = Schema.decodeUnknownEffect(Schema.fromJsonString(HymnSchema));

const read = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const names = (yield* fs.readDirectory(FOLDER)).filter((name) => /^\d{3}\.json$/.test(name));
  const hymns = yield* Effect.forEach(
    names.toSorted(),
    (name) => fs.readFileString(`${FOLDER}${name}`).pipe(Effect.flatMap(decodeHymn)),
    { concurrency: 16 },
  );
  return hymns;
});

interface Kept {
  hymns: ReadonlyArray<Hymn> | undefined;
}

const kept: Kept = { hymns: undefined };

export const compiled = Effect.suspend(() =>
  kept.hymns === undefined
    ? read.pipe(Effect.tap((hymns) => Effect.sync(() => (kept.hymns = hymns))))
    : Effect.succeed(kept.hymns),
);
