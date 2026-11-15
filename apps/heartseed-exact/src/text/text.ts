/**
 * Any verse's words, for the screens that need words and nothing else: a
 * chapter's verses, or a range's verses with their numbers. Both read the
 * current Heartseed's `versesOf` (`@manna/heartseed/kjv`) over the whole KJV
 * the port ships (`virtual:heartseed-kjv`, written by `tools/kjv.ts`), so a
 * read splits only the chapter it asks for and the module reads none at
 * import.
 */

import { versesOf } from '@manna/heartseed/kjv';
import { passageReference, type Range } from '@manna/heartseed/passages';

/** A verse of a range: its number in its chapter and its shown text. */
export interface TextVerse {
  verse: number;
  text: string;
}

/** A range's words: its reference as the canon writes it, and each verse it holds; none, under an empty reference, for a range that holds no verse. */
export interface TextPassage {
  reference: string;
  verses: Array<TextVerse>;
}

/** The verses of `chapter` of `book`, each its shown text in verse order; none for a chapter the canon lacks. */
export const textVerses = (book: number, chapter: number): Array<string> => [
  ...versesOf(book, chapter),
];

/** Whether `range` names whole verses from its first to its last: whole numbers, 1 ≤ first ≤ last. */
const wellFormed = (range: Range) =>
  [range.book, range.chapter, range.first, range.last].every(Number.isInteger) &&
  range.first >= 1 &&
  range.first <= range.last;

/** The verses of `range` its chapter holds, each with its number: a range past the chapter's end stops at its last verse, and a malformed range or one outside the canon holds none. */
export const textOf = (range: Range): TextPassage => {
  if (!wellFormed(range)) return { reference: '', verses: [] };
  const verses = versesOf(range.book, range.chapter)
    .slice(range.first - 1, range.last)
    .map((text, index) => ({ verse: range.first + index, text }));
  if (verses.length === 0) return { reference: '', verses: [] };
  return {
    reference: passageReference({ ...range, last: range.first + verses.length - 1 }),
    verses,
  };
};
