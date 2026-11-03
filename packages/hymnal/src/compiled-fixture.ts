/**
 * The committed compiled set as the tests read it: every hymn file in
 * `data/sdah-1985/`, decoded once per test run. Bun runs a workspace's test
 * files in one process, so each file that walks the whole set shares one
 * read.
 */

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

/** The set once read: a run's first walk fills it, every later one reads it. */
interface Kept {
  hymns: ReadonlyArray<Hymn> | undefined;
}

const kept: Kept = { hymns: undefined };

/** Every committed hymn in number order, read on the first call and kept for the run. */
export const compiled = Effect.suspend(() =>
  kept.hymns === undefined
    ? read.pipe(Effect.tap((hymns) => Effect.sync(() => (kept.hymns = hymns))))
    : Effect.succeed(kept.hymns),
);
