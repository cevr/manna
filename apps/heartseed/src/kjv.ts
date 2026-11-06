/**
 * The whole KJV as the app reads it: the one product module that imports
 * `virtual:heartseed-kjv`, the corpus the bundler derives (`vite/kjv.ts`)
 * as one string per chapter. Importing this reads no chapter; `versesOf`
 * splits the one chapter it is asked for, so Today's first frame never
 * waits on the corpus.
 */

import { BIBLE_BOOKS } from '@manna/core/bible';
import { Option } from 'effect';
import chapters from 'virtual:heartseed-kjv';

/** A book's place in the corpus: the index of its first chapter, and its chapter count. */
interface Span {
  readonly start: number;
  readonly chapters: number;
}

/** Each book's span, by book number. */
const SPANS: ReadonlyMap<number, Span> = new Map(
  BIBLE_BOOKS.map((book, index) => [
    book.number,
    {
      start: BIBLE_BOOKS.slice(0, index).reduce((sum, before) => sum + before.chapters, 0),
      chapters: book.chapters,
    },
  ]),
);

/** The verses of `chapter` of `book`, their shown text in verse order; none for a chapter the canon does not have. */
export const versesOf = (book: number, chapter: number): ReadonlyArray<string> =>
  Option.fromUndefinedOr(SPANS.get(book)).pipe(
    Option.filter((span) => Number.isInteger(chapter) && chapter >= 1 && chapter <= span.chapters),
    Option.flatMap((span) => Option.fromUndefinedOr(chapters[span.start + chapter - 1])),
    Option.match({ onNone: () => [], onSome: (text) => text.split('\n') }),
  );
