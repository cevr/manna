/* oxlint-disable effect/noGlobals -- a build-time host script, as passage.ts: the bundler plugin runs it under Bun and reads its standard output, and the test preload calls it synchronously. */

/**
 * The whole KJV as Heartseed carries it, derived when the app is bundled:
 * the canon's 1,189 chapters in canon order, each one string of its verses
 * in order, joined by a newline, each verse as `displayText` shows it. Read
 * by the `virtual:heartseed-kjv` plugin (`plugin.ts`) and by the app's
 * tests; the app reads it through `src/kjv.ts` alone. The derivation fails
 * the build when the corpus does not hold the canon's chapters in order,
 * when a chapter's verses skip or repeat a number, or when a verse's shown
 * text holds a newline, so a verse is never shown under another chapter.
 */

import { BIBLE_BOOKS } from '@manna/core/bible';
import { Option, Schema } from 'effect';

import { displayText } from '../src/display';
import { readVerses } from './passage';

/** A corpus the bundle cannot carry: it names the first faults found, never a verse's text. */
export class CorpusMismatch extends Schema.TaggedError<CorpusMismatch>()('CorpusMismatch', {
  message: Schema.String,
}) {}

/** One verse of the corpus, as the derivation reads it. */
interface Row {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly text: string;
}

/** The canon's chapters in order, each named `book:chapter`. */
const CANON: ReadonlyArray<string> = BIBLE_BOOKS.flatMap((book) =>
  Array.from({ length: book.chapters }, (_, index) => `${book.number}:${index + 1}`),
);

/** A chapter as the derivation gathers it. */
interface Gathered {
  readonly key: string;
  readonly texts: Array<string>;
}

/** The first place `keys` leaves the canon's chapters, when it does. */
const canonFault = (keys: ReadonlyArray<string>): Option.Option<string> => {
  const at = CANON.findIndex((key, index) => keys[index] !== key);
  if (at >= 0)
    return Option.some(
      `chapter ${at + 1} is ${Option.getOrElse(Option.fromUndefinedOr(keys[at]), () => 'missing')} where the canon has ${CANON[at]}`,
    );
  if (keys.length > CANON.length)
    return Option.some(`holds ${keys.length} chapters where the canon has ${CANON.length}`);
  return Option.none();
};

/** Every chapter of `rows` in canon order, each its verses' shown text joined by a newline; throws `CorpusMismatch` at K2's faults. */
export const chaptersOf = (rows: ReadonlyArray<Row>): ReadonlyArray<string> => {
  const chapters: Array<Gathered> = [];
  const faults: Array<string> = [];
  for (const row of rows) {
    const key = `${row.book}:${row.chapter}`;
    const chapter = Option.getOrElse(
      Option.filter(Option.fromUndefinedOr(chapters.at(-1)), (open) => open.key === key),
      () => {
        const opened: Gathered = { key, texts: [] };
        chapters.push(opened);
        return opened;
      },
    );
    const text = displayText(row.text);
    if (row.verse !== chapter.texts.length + 1)
      faults.push(`${key}:${row.verse} follows verse ${chapter.texts.length}`);
    if (text.includes('\n')) faults.push(`${key}:${row.verse} holds a newline`);
    chapter.texts.push(text);
  }
  faults.push(...Option.toArray(canonFault(chapters.map((chapter) => chapter.key))));
  return Option.getOrThrowWith(
    Option.liftPredicate(
      chapters.map((chapter) => chapter.texts.join('\n')),
      () => faults.length === 0,
    ),
    () => CorpusMismatch.make({ message: `heartseed: the KJV's ${faults.slice(0, 3).join('; ')}` }),
  );
};

/** The corpus's chapters, derived from `@manna/core`'s KJV. */
export const readChapters = (): ReadonlyArray<string> => chaptersOf(readVerses());

if (import.meta.main) process.stdout.write(JSON.stringify(readChapters()));
