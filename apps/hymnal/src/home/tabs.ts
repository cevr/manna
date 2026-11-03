/**
 * The home list's tabs. A tab is a name and its groups, each group a name
 * and its hymns' numbers, in the order the list shows them:
 *
 * - `Sections`: each run of hymns in one section of the hymnal, in number
 *   order (today's grouping).
 * - `Lists`: the reader's Favourites in number order, then Recent, newest
 *   first; a list with no hymn has no group.
 * - `Topics`: the Topical index's topics in printed order.
 * - `Metres`: the Metrical index's headings, each heading's hymns ascending.
 * - `Scripture`: the Scriptural index's books in the canon's order, each
 *   book's hymns ascending.
 *
 * A tab read from the indexes is there only when its index has an entry, and
 * a group lists each hymn once; a hymn may be in several groups of a tab.
 * `All at once` shows each group of a tab as a tile (`tilesOf`).
 */

import { getBibleBook } from '@manna/core/bible';
import { Option } from 'effect';

import type { HymnIndexes } from '~/hymns/indexes';

export const TAB_NAMES = ['Sections', 'Lists', 'Topics', 'Metres', 'Scripture'] as const;

export type TabName = (typeof TAB_NAMES)[number];

export interface Group {
  readonly name: string;
  readonly hymns: ReadonlyArray<number>;
}

export interface Tab {
  readonly name: TabName;
  readonly groups: ReadonlyArray<Group>;
}

export interface TabsInput {
  /** Every hymn in number order, with its section. */
  readonly hymns: ReadonlyArray<{ readonly number: number; readonly topic: string }>;
  /** The reader's favourites, any order. */
  readonly favourites: ReadonlyArray<number>;
  /** The reader's recent hymns, newest first. */
  readonly recent: ReadonlyArray<number>;
  readonly indexes: HymnIndexes;
}

const FIRST = 1;
const LAST = 695;
const isHymn = (n: number) => Number.isInteger(n) && n >= FIRST && n <= LAST;

/** Each number once, ascending. */
const ascending = (numbers: Iterable<number>): ReadonlyArray<number> =>
  [...new Set(numbers)].filter(isHymn).toSorted((a, b) => a - b);

const sectionsOf = (hymns: TabsInput['hymns']): ReadonlyArray<Group> => {
  const groups: Array<{ name: string; hymns: Array<number> }> = [];
  for (const hymn of hymns) {
    const last = groups.at(-1);
    if (last?.name === hymn.topic) last.hymns.push(hymn.number);
    else groups.push({ name: hymn.topic, hymns: [hymn.number] });
  }
  return groups;
};

const listsOf = (input: TabsInput): ReadonlyArray<Group> =>
  [
    { name: 'Favourites', hymns: ascending(input.favourites) },
    { name: 'Recent', hymns: [...new Set(input.recent)].filter(isHymn) },
  ].filter((group) => group.hymns.length > 0);

const topicsOf = (indexes: HymnIndexes): ReadonlyArray<Group> =>
  indexes.topics
    .map((topic) => ({ name: topic.name, hymns: [...new Set(topic.hymns)].filter(isHymn) }))
    .filter((group) => group.hymns.length > 0);

const metresOf = (indexes: HymnIndexes): ReadonlyArray<Group> =>
  indexes.metres
    .map((metre) => ({
      name: metre.metre,
      hymns: ascending(metre.tunes.flatMap((tune) => tune.hymns)),
    }))
    .filter((group) => group.hymns.length > 0);

const bookName = (book: number) =>
  Option.match(getBibleBook(book), { onNone: () => `Book ${book}`, onSome: (b) => b.name });

const scriptureOf = (indexes: HymnIndexes): ReadonlyArray<Group> => {
  const books = new Map<number, Array<number>>();
  for (const { hymn, passage } of indexes.references) {
    const list = books.get(passage.book) ?? [];
    list.push(hymn);
    books.set(passage.book, list);
  }
  return [...books]
    .toSorted(([a], [b]) => a - b)
    .map(([book, hymns]) => ({ name: bookName(book), hymns: ascending(hymns) }))
    .filter((group) => group.hymns.length > 0);
};

/** The tabs the home list offers, in their order; an index tab with no group is left out. */
export const tabsOf = (input: TabsInput): ReadonlyArray<Tab> => {
  const tabs: ReadonlyArray<Tab> = [
    { name: 'Sections', groups: sectionsOf(input.hymns) },
    { name: 'Lists', groups: listsOf(input) },
    { name: 'Topics', groups: topicsOf(input.indexes) },
    { name: 'Metres', groups: metresOf(input.indexes) },
    { name: 'Scripture', groups: scriptureOf(input.indexes) },
  ];
  return tabs.filter(
    (tab) => tab.name === 'Sections' || tab.name === 'Lists' || tab.groups.length > 0,
  );
};

/**
 * The offset a tab's list opens at when the reader chooses it, the list now
 * at `now`: where the reader left that tab (`kept`), else `now`, so the
 * tabs stay where the tap found them.
 */
export const openingOffset = (
  kept: ReadonlyMap<TabName, number>,
  name: TabName,
  now: number,
): number => kept.get(name) ?? now;

/** How many equal stretches a tile's strip cuts the hymnal (1 to 695) into. */
export const STRIP_STEPS = 48;

/** A stretch of a tile's strip, as fractions of its width from its start (hymn 1). */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/**
 * A group's tile in `All at once`: its place among the tab's groups, its
 * name, how many hymns it holds, where they lie in the hymnal, and whether
 * it holds the hymn the player has (`playing`).
 */
export interface Tile {
  readonly index: number;
  readonly name: string;
  readonly count: number;
  readonly spans: ReadonlyArray<Span>;
  readonly playing: boolean;
}

/**
 * Where `hymns` lie in the hymnal: the strip cut into `STRIP_STEPS` equal
 * stretches, each run of stretches that holds a hymn one span.
 */
export const spansOf = (hymns: ReadonlyArray<number>): ReadonlyArray<Span> => {
  const filled = new Set(
    hymns.filter(isHymn).map((n) => Math.floor(((n - FIRST) * STRIP_STEPS) / (LAST - FIRST + 1))),
  );
  const spans: Array<Span> = [];
  let from = -1;
  for (let step = 0; step <= STRIP_STEPS; step++) {
    if (filled.has(step) && from < 0) from = step;
    if (!filled.has(step) && from >= 0) {
      spans.push({ start: from / STRIP_STEPS, end: step / STRIP_STEPS });
      from = -1;
    }
  }
  return spans;
};

/** A tile for each of `tab`'s groups, in its order; `playing` is the number of the hymn the player has. */
export const tilesOf = (tab: Tab, playing: Option.Option<number>): ReadonlyArray<Tile> =>
  tab.groups.map((group, index) => ({
    index,
    name: group.name,
    count: group.hymns.length,
    spans: spansOf(group.hymns),
    playing: Option.match(playing, { onNone: () => false, onSome: (n) => group.hymns.includes(n) }),
  }));

/**
 * The group whose row is at or above the list's top at `offset`, given the
 * offset that puts each group's row at the top (`starts`, in order), to
 * within a point; the first group above them all. Under a layer `cover`
 * points tall over the list's top, the line is the layer's bottom, as the
 * pinned row's (`pinnedAt`), so it is the group pinned under the field.
 */
export const groupAt = (starts: ReadonlyArray<number>, offset: number, cover = 0): number =>
  Math.max(
    0,
    starts.findLastIndex((start) => start <= offset + cover + 1),
  );

/** The tab named `name`, or `Sections` (always there) when the tabs have none by that name. */
export const tabNamed = (tabs: ReadonlyArray<Tab>, name: TabName): Tab =>
  tabs.find((tab) => tab.name === name) ??
  tabs.find((tab) => tab.name === 'Sections') ?? { name: 'Sections', groups: [] };
