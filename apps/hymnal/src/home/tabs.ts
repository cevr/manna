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
  readonly hymns: ReadonlyArray<{ readonly number: number; readonly topic: string }>;
  readonly favourites: ReadonlyArray<number>;
  readonly recent: ReadonlyArray<number>;
  readonly indexes: HymnIndexes;
}

const FIRST = 1;
const LAST = 695;
const isHymn = (n: number) => Number.isInteger(n) && n >= FIRST && n <= LAST;

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

export const openingOffset = (
  kept: ReadonlyMap<TabName, number>,
  name: TabName,
  now: number,
): number => kept.get(name) ?? now;

export const STRIP_STEPS = 48;

export interface Span {
  readonly start: number;
  readonly end: number;
}

export interface Tile {
  readonly index: number;
  readonly name: string;
  readonly count: number;
  readonly spans: ReadonlyArray<Span>;
  readonly playing: boolean;
}

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

export const tilesOf = (tab: Tab, playing: Option.Option<number>): ReadonlyArray<Tile> =>
  tab.groups.map((group, index) => ({
    index,
    name: group.name,
    count: group.hymns.length,
    spans: spansOf(group.hymns),
    playing: Option.match(playing, { onNone: () => false, onSome: (n) => group.hymns.includes(n) }),
  }));

export const groupAt = (starts: ReadonlyArray<number>, offset: number, cover = 0): number =>
  Math.max(
    0,
    starts.findLastIndex((start) => start <= offset + cover + 1),
  );

export const tabNamed = (tabs: ReadonlyArray<Tab>, name: TabName): Tab =>
  tabs.find((tab) => tab.name === name) ??
  tabs.find((tab) => tab.name === 'Sections') ?? { name: 'Sections', groups: [] };
