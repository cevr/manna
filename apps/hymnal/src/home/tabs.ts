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

/** The tab named `name`, or `Sections` (always there) when the tabs have none by that name. */
export const tabNamed = (tabs: ReadonlyArray<Tab>, name: TabName): Tab =>
  tabs.find((tab) => tab.name === name) ??
  tabs.find((tab) => tab.name === 'Sections') ?? { name: 'Sections', groups: [] };
