/* oxlint-disable effect/noNodeBuiltinImport, effect/noTryCatch, effect/noThrowStatement, effect/noNewError, effect/noGlobals -- a build-time host script: the bundler plugin and the test preload call it synchronously, so it reads the compiled set from disk, fails the build naming the file that does not decode, and writes its JSON to standard output. */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { Hymn, Topics, topicOf } from '@manna/hymnal/hymn';
import { Option, Schema } from 'effect';

import { type HymnText, textOf } from '../src/hymns/text';

const folder = join(
  dirname(Bun.resolveSync('@manna/hymnal/hymn', import.meta.dir)),
  '../data/sdah-1985',
);

const decode = Schema.decodeUnknownSync(Schema.fromJsonString(Hymn));
const decodeTopics = Schema.decodeUnknownSync(Schema.fromJsonString(Topics));

const decodeHymn = (file: string): Hymn => {
  try {
    return decode(readFileSync(file, 'utf8'));
  } catch (cause) {
    throw new Error(`hymnal: ${file} does not decode`, { cause });
  }
};

const topicName = (topics: Topics, hymn: Hymn): string =>
  Option.getOrThrowWith(
    Option.map(topicOf(topics, hymn.number), (topic) => topic.name),
    () => new Error(`hymnal: hymn ${hymn.number} is in no topic of topics.json`),
  );

export const readTopics = (): Topics =>
  decodeTopics(readFileSync(join(folder, 'topics.json'), 'utf8'));

let hymns: ReadonlyArray<Hymn> = [];

export const readHymns = (): ReadonlyArray<Hymn> => {
  if (hymns.length === 0)
    hymns = readdirSync(folder)
      .filter((name) => /^\d{3}\.json$/.test(name))
      .toSorted()
      .map((name) => decodeHymn(join(folder, name)));
  return hymns;
};

export const readWords = (): ReadonlyArray<HymnText> => {
  const topics = readTopics();
  return readHymns().map((hymn) => textOf(hymn, topicName(topics, hymn)));
};

if (import.meta.main) process.stdout.write(JSON.stringify(readWords()));
