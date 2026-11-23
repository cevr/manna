/**
 * A Scripture passage's text and its search query, read from the passage
 * alone: no index is loaded, so the Exact port's head line imports it.
 */

import { getBibleBook } from '@manna/core/bible';
import type { Passage } from '@manna/hymnal/indexes';
import { Array as Arr, Option } from 'effect';

/** A book's name by its canonical number, or its number when the canon has none. */
const bookName = (book: number) =>
  Option.match(getBibleBook(book), { onNone: () => `Book ${book}`, onSome: (b) => b.name });

/** A verse piece as printed: one verse, or the first and last with a dash between. */
const piece = ({ from, to }: { readonly from: number; readonly to: number }, dash: string) => {
  if (from === to) return `${from}`;
  return `${from}${dash}${to}`;
};

/**
 * A passage as the reader sees it: the book's name, the chapter and its
 * verse pieces (`Psalms 98:4, 6`; the whole chapter is `Psalms 23`), or a
 * span from a place to a place (`Genesis 1:1–2:3`).
 */
export const passageText = (passage: Passage): string => {
  const book = bookName(passage.book);
  if (passage._tag === 'Span')
    return `${book} ${passage.from.chapter}:${passage.from.verse}–${passage.to.chapter}:${passage.to.verse}`;
  if (passage.verses.length === 0) return `${book} ${passage.chapter}`;
  return `${book} ${passage.chapter}:${passage.verses.map((v) => piece(v, '–')).join(', ')}`;
};

/**
 * The search query that finds a passage's hymns, as the search parses one
 * (`search.ts`): the chapter, its first verse piece, or a span's first verse.
 * The search reads one verse, one range or one chapter, never a list of
 * pieces or a span across chapters, so the query names where the passage
 * begins.
 */
export const passageQuery = (passage: Passage): string => {
  const book = bookName(passage.book);
  if (passage._tag === 'Span') return `${book} ${passage.from.chapter}:${passage.from.verse}`;
  return Option.match(Arr.head(passage.verses), {
    onNone: () => `${book} ${passage.chapter}`,
    onSome: (first) => `${book} ${passage.chapter}:${piece(first, '-')}`,
  });
};
