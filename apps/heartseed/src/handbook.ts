/**
 * Stephen N. Haskell's *Bible Handbook* (1919) as lists of references
 * (`data/handbook.json`, written by `bun run handbook` from a copy of the EGW
 * database and the book's contents page). Each section holds its lists in
 * Haskell's order, each list named by his own heading and holding its
 * ranges as the app's ordered-ranges type, `Collection`, so a list reads as
 * a promise collection does. References only: every verse's text comes from
 * the bundled KJV (`versesOf`). The file is decoded once per process and
 * fails loudly when it does not decode.
 */

import { Schema } from 'effect';

import data from '../data/handbook.json';
import type { Collection } from './promises';

/** One section of the Handbook: its id, Haskell's title and its lists in order. */
export interface HandbookSection {
  readonly id: string;
  readonly title: string;
  readonly lists: readonly Collection[];
}

const File = Schema.Struct({
  sections: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      lists: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          title: Schema.String,
          ranges: Schema.Array(
            Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite, Schema.Finite]),
          ),
        }),
      ),
    }),
  ),
});

/** The book the lists come from, as the app names it. */
export const HANDBOOK_SOURCE = {
  title: 'Bible Handbook',
  author: 'Stephen N. Haskell',
  year: 1919,
} as const;

/** Every section of the Handbook that holds a list, in the book's order. */
export const HANDBOOK: readonly HandbookSection[] = Schema.decodeUnknownSync(File)(
  data,
).sections.map((section) => ({
  id: section.id,
  title: section.title,
  lists: section.lists.map((list) => ({
    id: list.id,
    title: list.title,
    promises: list.ranges.map(([book, chapter, first, last]) => ({ book, chapter, first, last })),
  })),
}));

/** Every Handbook list, section by section, in the book's order. */
export const HANDBOOK_LISTS: readonly Collection[] = HANDBOOK.flatMap((section) => section.lists);
