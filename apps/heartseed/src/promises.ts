/**
 * The promise collections: Selah's fourteen (its `Promises.swift`), as
 * references only, in its order. Each is an id, a title and its promises in
 * order, each promise one to three verses of one chapter, 158 in all over
 * 188 verses. No verse text and no book name is held here: each book is its
 * canon number, so the app's own sources name no verse (`src/today.test.tsx`),
 * and the app reads each verse from the corpus (`versesOf`, `src/kjv.ts`),
 * so the display rule holds everywhere. The session teaches the
 * collections of `TAUGHT`; the others show only where the reader already
 * knows one of their promises.
 */

import type { Range } from './passages';

/** A promise collection: its id, its title as Selah writes it, and its promises in order. */
export interface Collection {
  readonly id: string;
  readonly title: string;
  readonly promises: readonly Range[];
}

/** One promise as the list writes it: the book by its canon number, the chapter, the first verse and, for a promise of more than one verse, the last. */
type Row = readonly [book: number, chapter: number, first: number, last?: number];

/** Selah's list, references only, each book by its canon number. */
const LIST: readonly (readonly [id: string, title: string, rows: readonly Row[]])[] = [
  [
    'forgiveness',
    'Forgiveness',
    [
      [62, 1, 9],
      [23, 1, 18],
      [19, 103, 12],
      [33, 7, 18, 19],
      [23, 43, 25],
      [23, 44, 22],
      [49, 1, 7],
      [44, 3, 19],
      [19, 86, 5],
      [23, 55, 7],
      [58, 8, 12],
    ],
  ],
  [
    'peace',
    'Peace in Anxiety',
    [
      [50, 4, 6, 7],
      [43, 14, 27],
      [23, 26, 3],
      [60, 5, 7],
      [19, 55, 22],
      [43, 16, 33],
      [19, 4, 8],
      [19, 94, 19],
      [53, 3, 16],
      [19, 29, 11],
    ],
  ],
  [
    'strength',
    'Strength',
    [
      [23, 40, 29, 31],
      [23, 41, 10],
      [50, 4, 13],
      [47, 12, 9],
      [19, 73, 26],
      [19, 28, 7],
      [5, 33, 25],
      [19, 18, 32],
      [23, 12, 2],
      [19, 138, 3],
    ],
  ],
  [
    'provision',
    'Provision',
    [
      [50, 4, 19],
      [40, 6, 33],
      [19, 37, 25],
      [19, 84, 11],
      [40, 7, 11],
      [47, 9, 8],
      [19, 34, 10],
      [58, 13, 5],
      [39, 3, 10],
      [42, 12, 32],
      [19, 37, 4],
    ],
  ],
  [
    'guidance',
    'Guidance & Wisdom',
    [
      [20, 3, 5, 6],
      [59, 1, 5],
      [19, 32, 8],
      [23, 30, 21],
      [23, 58, 11],
      [19, 37, 23],
      [23, 48, 17],
      [19, 25, 9],
      [20, 16, 3],
      [19, 48, 14],
      [19, 73, 24],
      [23, 42, 16],
    ],
  ],
  [
    'protection',
    'Protection & Fear',
    [
      [19, 91, 1, 2],
      [19, 91, 4],
      [19, 91, 11],
      [23, 43, 2],
      [55, 1, 7],
      [19, 34, 7],
      [23, 54, 17],
      [19, 121, 7, 8],
      [5, 31, 6],
      [20, 18, 10],
      [19, 56, 3],
      [23, 41, 13],
    ],
  ],
  [
    'victory',
    'Temptation & Victory',
    [
      [46, 10, 13],
      [59, 4, 7],
      [45, 8, 37],
      [62, 5, 4],
      [46, 15, 57],
      [65, 1, 24],
      [58, 2, 18],
      [58, 4, 15, 16],
      [61, 2, 9],
      [45, 6, 14],
      [62, 4, 4],
      [59, 1, 12],
    ],
  ],
  [
    'spirit',
    'The Holy Spirit',
    [
      [42, 11, 13],
      [43, 14, 16, 17],
      [43, 14, 26],
      [43, 16, 13],
      [44, 1, 8],
      [44, 2, 38, 39],
      [26, 36, 26, 27],
      [29, 2, 28],
      [45, 8, 26],
      [23, 44, 3],
      [45, 5, 5],
    ],
  ],
  [
    'healing',
    'Healing',
    [
      [2, 15, 26],
      [19, 103, 2, 3],
      [24, 17, 14],
      [24, 30, 17],
      [59, 5, 15],
      [23, 53, 5],
      [19, 147, 3],
      [39, 4, 2],
      [19, 41, 3],
      [24, 33, 6],
      [23, 58, 8],
      [19, 30, 2],
    ],
  ],
  [
    'comfort',
    'Comfort in Grief',
    [
      [40, 5, 4],
      [19, 34, 18],
      [66, 21, 4],
      [47, 1, 3, 4],
      [52, 4, 13, 14],
      [19, 30, 5],
      [23, 66, 13],
      [19, 23, 4],
      [23, 25, 8],
      [25, 3, 22, 23],
      [43, 16, 22],
    ],
  ],
  [
    'salvation',
    'Salvation & Assurance',
    [
      [43, 3, 16],
      [45, 10, 9],
      [43, 10, 27, 28],
      [45, 8, 38, 39],
      [62, 5, 11, 12],
      [49, 2, 8, 9],
      [43, 5, 24],
      [45, 8, 1],
      [44, 16, 31],
      [43, 6, 37],
      [50, 1, 6],
      [56, 3, 5],
    ],
  ],
  [
    'return',
    'Christ’s Return',
    [
      [43, 14, 2, 3],
      [44, 1, 11],
      [52, 4, 16, 17],
      [56, 2, 13],
      [66, 22, 12],
      [58, 9, 28],
      [40, 24, 30],
      [66, 1, 7],
      [62, 3, 2],
      [50, 3, 20, 21],
      [46, 15, 51, 52],
      [66, 22, 20],
    ],
  ],
  [
    'prayer',
    'Prayer Answered',
    [
      [40, 7, 7, 8],
      [24, 33, 3],
      [43, 14, 13, 14],
      [62, 5, 14, 15],
      [41, 11, 24],
      [40, 21, 22],
      [19, 145, 18],
      [23, 65, 24],
      [43, 15, 7],
      [19, 50, 15],
      [24, 29, 12, 13],
      [19, 91, 15],
    ],
  ],
  [
    'rest',
    'Rest',
    [
      [40, 11, 28, 30],
      [19, 23, 2, 3],
      [2, 33, 14],
      [58, 4, 9],
      [19, 127, 2],
      [19, 116, 7],
      [23, 32, 18],
      [24, 31, 25],
      [19, 3, 5],
      [20, 3, 24],
    ],
  ],
];

/** A row as a range. */
const rangeOf = ([book, chapter, first, last]: Row): Range => ({
  book,
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
