/* oxlint-disable effect/noGlobals, effect/noTernary -- a Bun test in an Exact app's folder imports no effect (docs/exact.md), so it branches plainly; the sizes it holds are the JSON bytes an answer ships. */

/**
 * The tabs are the current app's, in full: for the real book and generated
 * reader's lists (any subsets and orders of the hymns, with numbers no
 * hymn has), every tab's groups, names and numbers the port answers equal
 * `tabsOf`'s over the whole input. The port asks one tab at a time, so a
 * tab's answer is small and a tab not chosen is never computed.
 */

import { describe, expect, test } from 'bun:test';

import { TAB_NAMES, tabsOf } from '@manna/hymnal-app/home/tabs';
import indexes from 'virtual:hymnal-indexes';

import { book } from '../hymns/book.ts';
import { listSources } from '../list/sources.ts';
import { below, pick, type Random, seeded } from '../test/random.ts';
import { homeSources } from './sources.ts';
import { type TabGroup, tabGroups, titlesOf } from './tabs.ts';

const sources = { ...listSources(book), ...homeSources(book) };

const STALE = [0, -1, 696, 1000, 9999, 1.5];

/** A reader's list: some of the hymns in any order, now and then a number no hymn has, a repeat, or none at all. */
const listOf = (random: Random): Array<number> => {
  const size = pick(random, [0, 1, 2, 5, 50, 120, 695]);
  return Array.from({ length: size }, () => {
    const roll = below(random, 20);
    if (roll === 0) return pick(random, STALE);
    return 1 + below(random, 695);
  });
};

/** Every hymn once, in a random order. */
const everyHymn = (random: Random): Array<number> => {
  const all = book.hymns.map((hymn) => hymn.number);
  for (let i = all.length - 1; i > 0; i--) {
    const j = below(random, i + 1);
    [all[i], all[j]] = [all[j] ?? 0, all[i] ?? 0];
  }
  return all;
};

const plain = (groups: ReadonlyArray<TabGroup>) =>
  groups.map((group) => ({ name: group.name, hymns: group.numbers }));

const expected = (name: string, favourites: Array<number>, recent: Array<number>) => {
  const tab = tabsOf({ hymns: book.hymns, favourites, recent, indexes }).find(
    (each) => each.name === name,
  );
  return (tab?.groups ?? []).map((group) => ({ name: group.name, hymns: [...group.hymns] }));
};

describe('the tabs are the current app’s', () => {
  test('the tab row names `tabsOf`’s tabs, in order', () => {
    const names = tabsOf({ hymns: book.hymns, favourites: [], recent: [], indexes }).map(
      (tab) => tab.name,
    );
    expect(sources.listTabs()).toEqual(names);
    expect(sources.listTabs()).toEqual([...TAB_NAMES]);
  });

  test('every tab, every group, for generated favourites and recents', () => {
    const random = seeded(1863);
    for (let run = 0; run < 40; run++) {
      const favourites = run === 0 ? everyHymn(random) : listOf(random);
      const recent = run === 1 ? everyHymn(random) : listOf(random);
      for (const name of TAB_NAMES) {
        const got = plain(sources.listTabRows([name, favourites, recent]));
        expect({ run, name, got }).toEqual({
          run,
          name,
          got: expected(name, favourites, recent),
        });
      }
    }
  });

  test('Sections is the home list’s own sections, the same hymns under the same names', () => {
    const sections = sources
      .hymnRows([''])
      .map((section) => ({ name: section.name, hymns: section.rows.map((row) => row.number) }));
    expect(sections).toEqual(expected('Sections', [], []));
  });

  test('a name that is no tab has no groups', () => {
    for (const name of ['', 'sections', 'All at once', 'Favourites'])
      expect(sources.listTabRows([name, [1, 2], [3]])).toEqual([]);
  });

  test('each title is at its hymn’s number less one', () => {
    const titles = titlesOf(book);
    expect(titles.length).toBe(695);
    for (const hymn of book.hymns) expect(titles[hymn.number - 1]).toBe(hymn.title);
  });
});

describe('every row of a tab is named once', () => {
  test('slugs are unique, and `repeats` are exactly the hymns a group above lists', () => {
    const random = seeded(77);
    for (let run = 0; run < 20; run++) {
      const favourites = listOf(random);
      const recent = listOf(random);
      for (const name of TAB_NAMES) {
        const groups = sources.listTabRows([name, favourites, recent]);
        expect(new Set(groups.map((group) => group.slug)).size).toBe(groups.length);
        const above = new Set<number>();
        const ids = new Set<string>();
        for (const group of groups) {
          expect(group.repeats).toEqual(group.numbers.filter((n) => above.has(n)));
          for (const n of group.numbers) {
            const id = group.repeats.includes(n) ? `${group.slug}-${n}` : `${n}`;
            expect(ids.has(id)).toBe(false);
            ids.add(id);
            above.add(n);
          }
        }
      }
    }
  });
});

describe('weight', () => {
  test('a tab’s answer is numbers and names, under 60 KB at the fullest lists', () => {
    const random = seeded(3);
    const favourites = everyHymn(random);
    const recent = everyHymn(random).slice(0, 50);
    for (const name of TAB_NAMES) {
      const answer = sources.listTabRows([name, favourites, recent]);
      for (const group of answer)
        expect(Object.keys(group).toSorted()).toEqual(['name', 'numbers', 'repeats', 'slug']);
      expect(new TextEncoder().encode(JSON.stringify(answer)).length).toBeLessThan(60_000);
    }
    expect(new TextEncoder().encode(JSON.stringify(sources.listTitles())).length).toBeLessThan(
      60_000,
    );
  });

  test('launch computes no tab; a tab chosen computes that tab alone', () => {
    const asked: Array<string> = [];
    const counted: typeof tabsOf = (input) => {
      const tabs = tabsOf(input);
      asked.push(
        tabs
          .filter((tab) => tab.groups.length > 0)
          .map((tab) => tab.name)
          .join(','),
      );
      return tabs;
    };
    const home = homeSources(book, indexes, counted);
    home.listTabs();
    home.recentRows([[1, 2]]);
    sources.hymnRows(['']);
    expect(asked).toEqual([]);
    for (const name of ['Topics', 'Metres', 'Scripture', 'Lists'] as const) {
      asked.length = 0;
      home.listTabRows([name, [1], [2]]);
      expect(asked).toEqual([name]);
    }
  });

  test('`tabGroups` asks `tabsOf` once per tab asked, and never for a name that is no tab', () => {
    let calls = 0;
    const counted: typeof tabsOf = (input) => {
      calls += 1;
      return tabsOf(input);
    };
    tabGroups({ book, indexes }, 'Nothing', [], [], counted);
    expect(calls).toBe(0);
    tabGroups({ book, indexes }, 'Topics', [], [], counted);
    expect(calls).toBe(1);
  });
});
