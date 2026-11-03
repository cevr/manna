/* oxlint-disable effect/noNodeBuiltinImport, effect/noTryCatch, effect/noThrowStatement, effect/noNewError, effect/noGlobals -- a build-time host script: the bundler plugin and the test preload call it synchronously, so it reads the printed indexes from disk, fails the build naming the file that does not decode, and writes its JSON to standard output. */

/**
 * The back-matter indexes the app reads (`HymnIndexes`), as numbers and
 * names only: the topics and their hymns, each Scripture reference and the
 * hymn that alludes to it, the metres with their tunes' hymns, and the tunes'
 * names. Read from `packages/hymnal/data/indexes/` by the
 * `virtual:hymnal-indexes` plugin (`hymnal.ts`, which runs this file under
 * Bun and reads its standard output) and by the app's tests. Pages, stanza
 * letters, legends and the other indexes stay out of the bundle.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { IndexFile } from '@manna/hymnal/indexes';
import { Schema } from 'effect';

import type { HymnIndexes } from '../src/hymns/indexes';

/** The indexes' folder, found through the package so no path climbs the repo. */
const folder = join(
  dirname(Bun.resolveSync('@manna/hymnal/indexes', import.meta.dir)),
  '../data/indexes',
);

/** The decoded file `name`; the build fails naming a file that does not decode. */
const read = <A>(name: string, decode: (text: string) => A): A => {
  const file = join(folder, `${name}.json`);
  try {
    return decode(readFileSync(file, 'utf8'));
  } catch (cause) {
    throw new Error(`hymnal: ${file} does not decode`, { cause });
  }
};

const decodeTopical = Schema.decodeSync(Schema.fromJsonString(IndexFile.topical));
const decodeScriptural = Schema.decodeSync(Schema.fromJsonString(IndexFile.scriptural));
const decodeMetrical = Schema.decodeSync(Schema.fromJsonString(IndexFile.metrical));
const decodeTunes = Schema.decodeSync(Schema.fromJsonString(IndexFile.tunes));

export const readIndexes = (): HymnIndexes => ({
  topics: read('topical', decodeTopical).topics.map(
    ({ see: _see, readings: _readings, hymns, ...topic }) => ({
      ...topic,
      hymns: hymns.map((ref) => ref.number),
    }),
  ),
  references: read('scriptural', decodeScriptural).entries.map((entry) => ({
    hymn: entry.hymn,
    passage: entry.passage,
  })),
  metres: read('metrical', decodeMetrical).metres.map((metre) => ({
    metre: metre.metre,
    tunes: metre.tunes.map((tune) => ({
      name: tune.name,
      hymns: tune.hymns.map((ref) => ref.number),
    })),
  })),
  tunes: read('tunes', decodeTunes)
    .tunes.filter((tune) => tune.alias !== true)
    .map((tune) => ({ name: tune.name, hymns: tune.hymns.map((ref) => ref.number) })),
});

if (import.meta.main) process.stdout.write(JSON.stringify(readIndexes()));
