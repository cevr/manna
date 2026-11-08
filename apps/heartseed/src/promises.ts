/**
 * The promise collections: Selah's fourteen (its `Promises.swift`), as
 * references only, in its order. Each is an id, a title and its promises in
 * order, each promise one to three verses of one chapter, 158 in all over
 * 188 verses. No verse text is held here: the app reads each verse from the
 * corpus (`versesOf`, `src/kjv.ts`), so the display rule holds everywhere.
 * The session teaches the collections of `TAUGHT`; the others show only
 * where the reader already knows one of their promises.
 */

import { BIBLE_BOOKS } from '@manna/core/bible';

import type { Range } from './passages';

/** A promise collection: its id, its title as Selah writes it, and its promises in order. */
export interface Collection {
  readonly id: string;
  readonly title: string;
  readonly promises: readonly Range[];
}

/** One promise as the list writes it: the book by its canon name, the chapter, the first verse and, for a promise of more than one verse, the last. */
type Row = readonly [book: string, chapter: number, first: number, last?: number];

/** Selah's list, references only, each book by its canon name. */
const LIST: readonly (readonly [id: string, title: string, rows: readonly Row[]])[] = [
  [
    'forgiveness',
    'Forgiveness',
    [
      ['1 John', 1, 9],
      ['Isaiah', 1, 18],
      ['Psalms', 103, 12],
      ['Micah', 7, 18, 19],
      ['Isaiah', 43, 25],
      ['Isaiah', 44, 22],
      ['Ephesians', 1, 7],
      ['Acts', 3, 19],
      ['Psalms', 86, 5],
      ['Isaiah', 55, 7],
      ['Hebrews', 8, 12],
    ],
  ],
  [
    'peace',
    'Peace in Anxiety',
    [
      ['Philippians', 4, 6, 7],
      ['John', 14, 27],
      ['Isaiah', 26, 3],
      ['1 Peter', 5, 7],
      ['Psalms', 55, 22],
      ['John', 16, 33],
      ['Psalms', 4, 8],
      ['Psalms', 94, 19],
      ['2 Thessalonians', 3, 16],
      ['Psalms', 29, 11],
    ],
  ],
  [
    'strength',
    'Strength',
    [
      ['Isaiah', 40, 29, 31],
      ['Isaiah', 41, 10],
      ['Philippians', 4, 13],
      ['2 Corinthians', 12, 9],
      ['Psalms', 73, 26],
      ['Psalms', 28, 7],
      ['Deuteronomy', 33, 25],
      ['Psalms', 18, 32],
      ['Isaiah', 12, 2],
      ['Psalms', 138, 3],
    ],
  ],
  [
    'provision',
    'Provision',
    [
      ['Philippians', 4, 19],
      ['Matthew', 6, 33],
      ['Psalms', 37, 25],
      ['Psalms', 84, 11],
      ['Matthew', 7, 11],
      ['2 Corinthians', 9, 8],
      ['Psalms', 34, 10],
      ['Hebrews', 13, 5],
      ['Malachi', 3, 10],
      ['Luke', 12, 32],
      ['Psalms', 37, 4],
    ],
  ],
  [
    'guidance',
    'Guidance & Wisdom',
    [
      ['Proverbs', 3, 5, 6],
      ['James', 1, 5],
      ['Psalms', 32, 8],
      ['Isaiah', 30, 21],
      ['Isaiah', 58, 11],
      ['Psalms', 37, 23],
      ['Isaiah', 48, 17],
      ['Psalms', 25, 9],
      ['Proverbs', 16, 3],
      ['Psalms', 48, 14],
      ['Psalms', 73, 24],
      ['Isaiah', 42, 16],
    ],
  ],
  [
    'protection',
    'Protection & Fear',
    [
      ['Psalms', 91, 1, 2],
      ['Psalms', 91, 4],
      ['Psalms', 91, 11],
      ['Isaiah', 43, 2],
      ['2 Timothy', 1, 7],
      ['Psalms', 34, 7],
      ['Isaiah', 54, 17],
      ['Psalms', 121, 7, 8],
      ['Deuteronomy', 31, 6],
      ['Proverbs', 18, 10],
      ['Psalms', 56, 3],
      ['Isaiah', 41, 13],
    ],
  ],
  [
    'victory',
    'Temptation & Victory',
    [
      ['1 Corinthians', 10, 13],
      ['James', 4, 7],
      ['Romans', 8, 37],
      ['1 John', 5, 4],
      ['1 Corinthians', 15, 57],
      ['Jude', 1, 24],
      ['Hebrews', 2, 18],
      ['Hebrews', 4, 15, 16],
      ['2 Peter', 2, 9],
      ['Romans', 6, 14],
      ['1 John', 4, 4],
      ['James', 1, 12],
    ],
  ],
  [
    'spirit',
    'The Holy Spirit',
    [
      ['Luke', 11, 13],
      ['John', 14, 16, 17],
      ['John', 14, 26],
      ['John', 16, 13],
      ['Acts', 1, 8],
      ['Acts', 2, 38, 39],
      ['Ezekiel', 36, 26, 27],
      ['Joel', 2, 28],
      ['Romans', 8, 26],
      ['Isaiah', 44, 3],
      ['Romans', 5, 5],
    ],
  ],
  [
    'healing',
    'Healing',
    [
      ['Exodus', 15, 26],
      ['Psalms', 103, 2, 3],
      ['Jeremiah', 17, 14],
      ['Jeremiah', 30, 17],
      ['James', 5, 15],
      ['Isaiah', 53, 5],
      ['Psalms', 147, 3],
      ['Malachi', 4, 2],
      ['Psalms', 41, 3],
      ['Jeremiah', 33, 6],
      ['Isaiah', 58, 8],
      ['Psalms', 30, 2],
    ],
  ],
  [
    'comfort',
    'Comfort in Grief',
    [
      ['Matthew', 5, 4],
      ['Psalms', 34, 18],
      ['Revelation', 21, 4],
      ['2 Corinthians', 1, 3, 4],
      ['1 Thessalonians', 4, 13, 14],
      ['Psalms', 30, 5],
      ['Isaiah', 66, 13],
      ['Psalms', 23, 4],
      ['Isaiah', 25, 8],
      ['Lamentations', 3, 22, 23],
      ['John', 16, 22],
    ],
  ],
  [
    'salvation',
    'Salvation & Assurance',
    [
      ['John', 3, 16],
      ['Romans', 10, 9],
      ['John', 10, 27, 28],
      ['Romans', 8, 38, 39],
      ['1 John', 5, 11, 12],
      ['Ephesians', 2, 8, 9],
      ['John', 5, 24],
      ['Romans', 8, 1],
      ['Acts', 16, 31],
      ['John', 6, 37],
      ['Philippians', 1, 6],
      ['Titus', 3, 5],
    ],
  ],
  [
    'return',
    'Christ’s Return',
    [
      ['John', 14, 2, 3],
      ['Acts', 1, 11],
      ['1 Thessalonians', 4, 16, 17],
      ['Titus', 2, 13],
      ['Revelation', 22, 12],
      ['Hebrews', 9, 28],
      ['Matthew', 24, 30],
      ['Revelation', 1, 7],
      ['1 John', 3, 2],
      ['Philippians', 3, 20, 21],
      ['1 Corinthians', 15, 51, 52],
      ['Revelation', 22, 20],
    ],
  ],
  [
    'prayer',
    'Prayer Answered',
    [
      ['Matthew', 7, 7, 8],
      ['Jeremiah', 33, 3],
      ['John', 14, 13, 14],
      ['1 John', 5, 14, 15],
      ['Mark', 11, 24],
      ['Matthew', 21, 22],
      ['Psalms', 145, 18],
      ['Isaiah', 65, 24],
      ['John', 15, 7],
      ['Psalms', 50, 15],
      ['Jeremiah', 29, 12, 13],
      ['Psalms', 91, 15],
    ],
  ],
  [
    'rest',
    'Rest',
    [
      ['Matthew', 11, 28, 30],
      ['Psalms', 23, 2, 3],
      ['Exodus', 33, 14],
      ['Hebrews', 4, 9],
      ['Psalms', 127, 2],
      ['Psalms', 116, 7],
      ['Isaiah', 32, 18],
      ['Jeremiah', 31, 25],
      ['Psalms', 3, 5],
      ['Proverbs', 3, 24],
    ],
  ],
];

/** Each canon book's number by its name. */
const NUMBERS: ReadonlyMap<string, number> = new Map(
  BIBLE_BOOKS.map((book) => [book.name, book.number]),
);

/** A row as a range; a book name the canon lacks gives book 0, which no chapter holds, so the content test names it. */
const rangeOf = ([book, chapter, first, last]: Row): Range => ({
  book: NUMBERS.get(book) ?? 0,
  chapter,
  first,
  last: last ?? first,
});

/** Selah's fourteen collections in its order, each its promises as ranges in order. */
export const COLLECTIONS: readonly Collection[] = LIST.map(([id, title, rows]) => ({
  id,
  title,
  promises: rows.map(rangeOf),
}));

/** The ids of the collections the session teaches: the Fear collection, free. */
export const TAUGHT: readonly string[] = ['protection'];
