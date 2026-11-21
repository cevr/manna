/* oxlint-disable effect/noTernary, effect/noNullish -- Exact's data module imports no effect (docs/exact.md): a hymn the list has no row for is a plain `undefined`, answered as "". */

/**
 * The home list follows the drums, as the current app's does
 * (`reader/HymnList.native.tsx`, `player/drums.ts` `foundOffset`): while
 * they are open on a number, the list scrolls to that hymn's first row
 * under its group, and stays where it is when it has no such row. The port
 * scrolls by a row's id, so this answers the id of the first row of hymn
 * `n` in the list of tab `name` as `features/list.contract` draws it, or ""
 * with none: the Sections list's rows in the book's order, `hymn-<n>`;
 * another tab's group by group (`tabGroups`), `hymn-<n>` where the hymn
 * first shows and `hymn-<slug>-<n>` in a group below that lists it again
 * (`listRowId`).
 */

import { isTab, type TabSource, tabGroups } from '../home/tabs.ts';

/** A row of the home list: its hymn and its id. */
export interface ListedRow {
  readonly number: number;
  readonly id: string;
}

/** The home list's hymn rows for tab `name`, in its order; none for a name that is no tab. */
export const listedRows = (
  source: TabSource,
  name: string,
  favourites: ReadonlyArray<number>,
  recent: ReadonlyArray<number>,
): Array<ListedRow> => {
  if (!isTab(name)) return [];
  if (name === 'Sections')
    return source.book.hymns.map((hymn) => ({ number: hymn.number, id: `hymn-${hymn.number}` }));
  return tabGroups(source, name, favourites, recent).flatMap((group) =>
    group.numbers.map((n) => ({
      number: n,
      id: group.repeats.includes(n) ? `hymn-${group.slug}-${n}` : `hymn-${n}`,
    })),
  );
};

/** The id of the row the list scrolls to for the drums' number `n`; "" when it has none, and it stays. */
export const followRow = (rows: ReadonlyArray<ListedRow>, n: number): string =>
  rows.find((row) => row.number === n)?.id ?? '';
