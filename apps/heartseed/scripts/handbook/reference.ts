/**
 * How one Scripture link of Haskell's *Bible Handbook* (1919) reads as
 * ranges of verses (R4), and which of them the lists keep (R5). A link is
 * the EGW corpus's `ScriptureRef`: its `title` names the book, the chapter
 * and the first verse (`Philippians 2:9`), its shown text is what Haskell
 * wrote (`Philippians 2:9, 10`). A reading never borrows a number from the
 * title that the shown text does not say: a link whose shown chapter is not
 * the title's, or whose text is anything but a chapter, a chapter and its
 * verses, or a one-chapter book's verses, is `unread`.
 */

import { Option } from 'effect';

/** A range of verses: the book by its canon number, the chapter, the first and the last verse. */
export type Range = readonly [book: number, chapter: number, first: number, last: number];

/** Why a reference was left out of the lists. */
export type Reason = 'unread' | 'past-chapter' | 'long' | 'unlinked';

/** A link's reading: its ranges in the order written, or `Unread`. */
export type Reading =
  | { readonly _tag: 'Read'; readonly ranges: readonly Range[] }
  | { readonly _tag: 'Unread' };

/** A range's fate in a list: kept, or dropped for a reason. */
export type Placed =
  | { readonly _tag: 'Kept'; readonly range: Range }
  | { readonly _tag: 'Dropped'; readonly reason: 'past-chapter' | 'long' };

/** The books of one chapter (Obadiah, Philemon, 2 John, 3 John, Jude), whose numbers are verses. */
export const ONE_CHAPTER_BOOKS: ReadonlySet<number> = new Set([31, 57, 63, 64, 65]);

/** The most verses a kept range holds: Heartseed's passage cap. */
export const MOST_VERSES = 20;

const TITLE = /^(.+?) (\d+)(?::\d+)?$/;
const BOOK_NAME = /^(?:[1-3] )?[A-Za-z][A-Za-z ]*? (?=\d)/;
const VERSES = /^\d+:\d+(?:-\d+)?(?:, ?\d+(?:-\d+)?)*$/;
const PARTS = /^\d+(?:-\d+)?(?:, ?\d+(?:-\d+)?)*$/;
const CHAPTER = /^\d+$/;

/** The ranges of a list of parts (`8`, `8-10`, `8, 10-12`) in `chapter`, or `Unread` when a part runs backward. */
const partsIn = (book: number, chapter: number, parts: string): Reading => {
  const ranges = parts.split(/, ?/).map((part): Range => {
    const [first = 0, last = first] = part.split('-').map(Number);
    return [book, chapter, first, last];
  });
  if (ranges.some(([, , first, last]) => last < first)) return { _tag: 'Unread' };
  return { _tag: 'Read', ranges };
};

/** What the shown text says in `book` under the title's `chapter`. */
const readShown = (
  book: number,
  chapter: number,
  shown: string,
  count: (book: number, chapter: number) => number,
): Reading => {
  const text = shown.trim().replace(BOOK_NAME, '').trim();
  if (VERSES.test(text)) {
    const [shownChapter = '', parts = ''] = text.split(':');
    if (Number(shownChapter) !== chapter) return { _tag: 'Unread' };
    return partsIn(book, chapter, parts);
  }
  const single = ONE_CHAPTER_BOOKS.has(book);
  if (single && chapter === 1 && PARTS.test(text)) return partsIn(book, 1, text);
  if (!single && CHAPTER.test(text) && Number(text) === chapter)
    return { _tag: 'Read', ranges: [[book, chapter, 1, count(book, chapter)]] };
  return { _tag: 'Unread' };
};

/** R4: a link's ranges, from its title and its shown text; `Unread` for an unknown book or any other form. */
export const readLink = (
  title: string,
  shown: string,
  bookOf: (name: string) => Option.Option<number>,
  count: (book: number, chapter: number) => number,
): Reading => {
  const named = title.trim();
  if (!TITLE.test(named)) return { _tag: 'Unread' };
  return Option.match(bookOf(named.replace(TITLE, '$1')), {
    onNone: (): Reading => ({ _tag: 'Unread' }),
    onSome: (book) => readShown(book, Number(named.replace(TITLE, '$2')), shown, count),
  });
};

/** R5: a range is dropped `past-chapter` when it starts below verse 1 or runs past its chapter's last verse, else `long` past 20 verses, else kept. */
export const placeRange = (
  range: Range,
  count: (book: number, chapter: number) => number,
): Placed => {
  const [book, chapter, first, last] = range;
  const size = count(book, chapter);
  if (first < 1 || first > size || last > size) return { _tag: 'Dropped', reason: 'past-chapter' };
  if (last - first + 1 > MOST_VERSES) return { _tag: 'Dropped', reason: 'long' };
  return { _tag: 'Kept', range };
};
