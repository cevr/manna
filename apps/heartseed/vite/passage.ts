/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals -- a build-time host script: the bundler plugin and the test preload call it synchronously, so it reads the KJV from disk and writes its JSON to standard output. */

/**
 * Today's passage, derived from the KJV when the app is bundled: its
 * reference is parsed with the corpus's own parser (`parseBibleQuery`) and
 * named by the canon, and its words are the corpus's verse as `displayText`
 * shows it. Read by the `virtual:heartseed-passage` plugin (`plugin.ts`,
 * which runs this file under Bun and reads its standard output) and by the
 * app's tests, so the 7.8 MB corpus stays out of the phone's bundle.
 */

import { readFileSync } from 'node:fs';

import { formatBibleReference, parseBibleQuery } from '@manna/core/bible';
import { Option, Schema } from 'effect';

import { displayText } from '../src/display';
import type { Passage } from '../src/passage';

/** The passage Today shows: the brief's first promise. */
const TODAY = 'Isaiah 41:10';

/** One verse of the corpus file, as this reads it. */
const KjvVerse = Schema.Struct({
  book: Schema.Finite,
  chapter: Schema.Finite,
  verse: Schema.Finite,
  text: Schema.String,
});
export interface KjvVerse extends Schema.Schema.Type<typeof KjvVerse> {}

const Kjv = Schema.Struct({ verses: Schema.Array(KjvVerse) });

const decodeKjv = Schema.decodeUnknownSync(Schema.fromJsonString(Kjv));

/** A query that names no single verse of the KJV: the build fails with it. */
export class NoSuchVerse extends Schema.TaggedError<NoSuchVerse>()('NoSuchVerse', {
  message: Schema.String,
}) {}

let verses: ReadonlyArray<KjvVerse> = [];

/** Every verse of `@manna/core`'s KJV, in canon order, read once per process. */
export const readVerses = (): ReadonlyArray<KjvVerse> => {
  if (verses.length === 0)
    verses = decodeKjv(
      readFileSync(Bun.resolveSync('@manna/core/assets/kjv.json', import.meta.dir), 'utf8'),
    ).verses;
  return verses;
};

/** The passage `query` names, one verse; the build fails for a query that names no single verse of the corpus. */
export const passageOf = (query: string): Passage => {
  const parsed = parseBibleQuery(query);
  const ref = Option.getOrThrowWith(
    Option.liftPredicate(parsed, (found) => found._tag === 'single').pipe(
      Option.map((single) => single.ref),
    ),
    () => NoSuchVerse.make({ message: `heartseed: ${query} names no single verse` }),
  );
  const verse = Option.getOrThrowWith(
    Option.fromUndefinedOr(
      readVerses().find(
        (row) => row.book === ref.book && row.chapter === ref.chapter && row.verse === ref.verse,
      ),
    ),
    () => NoSuchVerse.make({ message: `heartseed: ${query} is not in the KJV` }),
  );
  return { reference: formatBibleReference(ref), text: displayText(verse.text) };
};

/** Today's passage. */
export const readPassage = (): Passage => passageOf(TODAY);

if (import.meta.main) process.stdout.write(JSON.stringify(readPassage()));
