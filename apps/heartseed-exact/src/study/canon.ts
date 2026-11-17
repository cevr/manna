/* oxlint-disable effect/noNullish -- Exact's app folder cannot import effect (docs/exact.md): a chapter's place in the canon, from plain numbers. */

/**
 * Where a chapter stands in a chapter pack: its index among the canon's
 * 1,189 chapters, in order, as `@manna/core/bible`'s books count them.
 */

import { BIBLE_BOOKS } from '@manna/core/bible';

/** How many chapters the canon has. */
export const CANON_CHAPTERS = 1189;

/** A book's first chapter's index and its chapter count. */
type Place = readonly [number, number];

/** Each book's place, by book number; built on first use. */
let places: ReadonlyMap<number, Place> | undefined;

const placesOf = (): ReadonlyMap<number, Place> => {
  if (places !== undefined) return places;
  const made = new Map<number, Place>();
  let at = 0;
  for (const book of BIBLE_BOOKS) {
    made.set(book.number, [at, book.chapters]);
    at += book.chapters;
  }
  places = made;
  return made;
};

/** The index of `chapter` of `book` in a chapter pack; -1 for a chapter the canon lacks. */
export const chapterIndex = (book: number, chapter: number): number => {
  const place = placesOf().get(book);
  if (place === undefined || !Number.isInteger(chapter) || chapter < 1 || chapter > place[1])
    return -1;
  return place[0] + chapter - 1;
};

/** Every chapter of the canon, in order, as `[book, chapter]`. */
export const canonChapters = (): ReadonlyArray<readonly [number, number]> =>
  BIBLE_BOOKS.flatMap((book) =>
    Array.from({ length: book.chapters }, (_, index) => [book.number, index + 1] as const),
  );
