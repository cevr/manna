/* oxlint-disable effect/noTernary -- the port's data module imports no effect (docs/exact.md), so a tab's share of the input is a plain branch. */

/**
 * The home list's tabs as the port draws them: the current app's `tabsOf`,
 * asked one tab at a time. A tab is asked with only the part of the input
 * it reads (the hymns for Sections, the reader's lists for Lists, its own
 * index for Topics, Metres and Scripture), so answering one computes that
 * tab alone, and a tab nobody chose is never computed. A group is named,
 * keyed by its slug (`slugOf`, numbered past its first use), and holds its
 * hymns' numbers in the tab's order; the titles are answered once for the
 * whole book (`titlesOf`), so a tab's answer is numbers and names only. A
 * hymn may be in several groups of a tab: each group names those already
 * listed in a group above it (`repeats`), so the view can give every row a
 * `testId` of its own.
 */

import {
  TAB_NAMES,
  type TabIndexes,
  type TabName,
  type TabsInput,
  tabsOf,
} from '@manna/hymnal-app/home/tabs';

import type { Book } from '../hymns/book.ts';
import { slugOf } from '../list/rows.ts';

export { TAB_NAMES, type TabName } from '@manna/hymnal-app/home/tabs';

/** A tab's group as the list draws it: a header over its hymns. */
export interface TabGroup {
  readonly slug: string;
  readonly name: string;
  readonly numbers: Array<number>;
  /** Those of `numbers` a group above this one in the tab lists too. */
  readonly repeats: Array<number>;
}

/** What a tab is made of besides the reader's lists. */
export interface TabSource {
  readonly book: Book;
  readonly indexes: TabIndexes;
}

/** Whether `name` is one of the tabs. */
export const isTab = (name: string): name is TabName => TAB_NAMES.some((tab) => tab === name);

/** Whether tab `name` is made of the back-matter indexes (`inputFor`), so its answer waits for them (`src/indexes/first-use.ts`). */
export const readsIndexes = (name: string): boolean =>
  name === 'Topics' || name === 'Scripture' || name === 'Metres';

/** The input `tabsOf` needs to make tab `name`, and nothing another tab reads. */
export const inputFor = (
  name: TabName,
  source: TabSource,
  favourites: ReadonlyArray<number>,
  recent: ReadonlyArray<number>,
): TabsInput => ({
  hymns: name === 'Sections' ? source.book.hymns : [],
  favourites: name === 'Lists' ? favourites : [],
  recent: name === 'Lists' ? recent : [],
  indexes: {
    topics: name === 'Topics' ? source.indexes.topics : [],
    references: name === 'Scripture' ? source.indexes.references : [],
    metres: name === 'Metres' ? source.indexes.metres : [],
  },
});

/** `slug`, or `slug-<k>` for its k-th use among `taken` (which it joins). */
const unique = (taken: Map<string, number>, slug: string): string => {
  const uses = (taken.get(slug) ?? 0) + 1;
  taken.set(slug, uses);
  return uses === 1 ? slug : `${slug}-${uses}`;
};

/**
 * The groups of tab `name` over the reader's `favourites` and `recent`;
 * none when it is not a tab, or `tabsOf` leaves it out. `tabs` is
 * `tabsOf`, given so a test can count what is computed.
 */
export const tabGroups = (
  source: TabSource,
  name: string,
  favourites: ReadonlyArray<number>,
  recent: ReadonlyArray<number>,
  tabs: typeof tabsOf = tabsOf,
): Array<TabGroup> => {
  if (!isTab(name)) return [];
  const tab = tabs(inputFor(name, source, favourites, recent)).find((each) => each.name === name);
  const slugs = new Map<string, number>();
  const listed = new Set<number>();
  return (tab?.groups ?? []).map((group) => {
    const repeats = group.hymns.filter((number) => listed.has(number));
    for (const number of group.hymns) listed.add(number);
    return {
      slug: unique(slugs, slugOf(group.name) || 'group'),
      name: group.name,
      numbers: [...group.hymns],
      repeats,
    };
  });
};

/** Every hymn's title at its number less one, so the view reads hymn n's as `titles.at(n - 1)`; "" where the book has no hymn. */
export const titlesOf = (book: Book): Array<string> => {
  const last = Math.max(0, ...book.hymns.map((hymn) => hymn.number));
  const titles = Array.from({ length: last }, () => '');
  for (const hymn of book.hymns) titles[hymn.number - 1] = hymn.title;
  return titles;
};
