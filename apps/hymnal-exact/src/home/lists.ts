/* oxlint-disable effect/noNullish -- the port's data module imports no effect (docs/exact.md), so a hymn the book lacks is a plain `undefined` from its lookup. */

/**
 * The reader's own lists in the port: Recent, the hymns last opened, newest
 * first, and Favourites, the hymns starred, in number order. Each is a plain
 * list of hymn numbers the view keeps across launches (a `persist` state);
 * these rules make the next list from the last, by the current app's
 * `visited` and `toggleFavourite`, and say what the shelf and the Recent
 * screen show of it. A stored number no hymn has stays in the list, as the
 * current app keeps it, and is never shown.
 */

import { RECENT_SHOWN, toggleFavourite, visited } from '@manna/hymnal-app/reader/lists';

import type { Book } from '../hymns/book.ts';

/** A hymn's row: its number and its title. */
export interface Row {
  readonly number: number;
  readonly title: string;
}

/** What Recent shows: its first `RECENT_SHOWN` hymns on the home list's shelf, and all of them on its screen. */
export interface RecentView {
  readonly shelf: Array<Row>;
  readonly all: Array<Row>;
}

/** The hymn a route's segment names (`100`, written without leading zeros), if the book has it. */
const hymnAt = (book: Book, segment: string) =>
  book.hymns.find((hymn) => `${hymn.number}` === segment);

/** Recent once the hymn page at route segment `segment` is shown: that hymn first; unchanged for a segment that names no hymn. */
export const recentAfter = (
  book: Book,
  recent: ReadonlyArray<number>,
  segment: string,
): Array<number> => {
  const hymn = hymnAt(book, segment);
  if (hymn === undefined) return [...recent];
  return [...visited(recent, hymn.number)];
};

/** Favourites once the star of hymn `n`'s page is pressed: it joins them, or leaves them when it was there; unchanged for a number no hymn has. */
export const favouritesAfter = (
  book: Book,
  favourites: ReadonlyArray<number>,
  n: number,
): Array<number> => {
  if (hymnAt(book, `${n}`) === undefined) return [...favourites];
  return [...toggleFavourite(favourites, n)];
};

/** Recent's rows, newest first, a number no hymn has left out; the shelf is the first `RECENT_SHOWN` of them. */
export const recentView = (book: Book, recent: ReadonlyArray<number>): RecentView => {
  const titles = new Map(book.hymns.map((hymn) => [hymn.number, hymn.title]));
  const all = recent.flatMap((number) => {
    const title = titles.get(number);
    if (title === undefined) return [];
    return [{ number, title }];
  });
  return { shelf: all.slice(0, RECENT_SHOWN), all };
};
