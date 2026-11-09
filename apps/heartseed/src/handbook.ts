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

import { Option, Schema } from 'effect';

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

/** Each list's title as the reader sees it, by id: Haskell's own on its first use, and with ` (n)` on its n-th use after, in the book's order, so no two lists share a name. */
const titlesOf = (lists: readonly Collection[]): ReadonlyMap<string, string> => {
  const seen = new Map<string, number>();
  return new Map(
    lists.map((list) => {
      const nth = Option.getOrElse(Option.fromUndefinedOr(seen.get(list.title)), () => 0) + 1;
      seen.set(list.title, nth);
      if (nth === 1) return [list.id, list.title];
      return [list.id, `${list.title} (${nth})`];
    }),
  );
};

const TITLES = titlesOf(HANDBOOK_LISTS);

/** The title the reader sees for the Handbook list `list` (`titlesOf`); Haskell's own for a list the Handbook does not hold. */
export const handbookTitle = (list: Collection): string =>
  Option.getOrElse(Option.fromUndefinedOr(TITLES.get(list.id)), () => list.title);

const BY_ID = new Map(HANDBOOK_LISTS.map((list) => [list.id, list]));

/** The Handbook list with id `id`, if the Handbook holds one. */
export const handbookListOf = (id: string): Option.Option<Collection> =>
  Option.fromUndefinedOr(BY_ID.get(id));
