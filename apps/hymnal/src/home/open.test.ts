/**
 * A press on a hymn row of the home list, from each tab (`tabsOf`), the
 * Topics tab's rows among them: the row opens that hymn's page
 * (`hymnHref`), and the pager it opens pages through every hymn in number
 * order (`pageSource` over the row's `source`), whichever group the row
 * sits in. Numbers only.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import bundled from 'virtual:hymnal-indexes';

import { hymns } from '~/hymns/hymns';
import { shelvesOf } from '~/reader/lists';
import { pageSource } from '~/reader/pager';
import { groupRowsOf, type Row, rowsOf } from '~/reader/rows';

import { hymnHref, hymnOf } from './Browse';
import { tabsOf } from './tabs';

const all = hymns.map((hymn) => hymn.number);
const ascending = all.toSorted((a, b) => a - b);
const favourites = ascending.slice(4, 7);
const recent = ascending.slice(9, 12);
const tabs = tabsOf({ hymns, favourites, recent, indexes: bundled });

type HymnRow = Extract<Row<(typeof hymns)[number]>, { kind: 'hymn' }>;

const listOf = (tab: (typeof tabs)[number]) => {
  if (tab.name === 'Sections') return rowsOf(hymns, shelvesOf(recent, hymnOf));
  return groupRowsOf(tab.name, tab.groups, hymns);
};

const hymnRowsOf = (tab: (typeof tabs)[number]): ReadonlyArray<HymnRow> =>
  listOf(tab).rows.filter((row): row is HymnRow => row.kind === 'hymn');

describe('a hymn row pressed in the home list', () => {
  it('has a tab for each index the bundle holds, Topics among them', () => {
    expect(tabs.map((tab) => tab.name)).toEqual([
      'Sections',
      'Lists',
      'Topics',
      'Metres',
      'Scripture',
    ]);
  });

  for (const tab of tabs) {
    it(`opens its hymn and pages by number order from the ${tab.name} tab`, () => {
      const rows = hymnRowsOf(tab);
      expect(rows.length).toBeGreaterThan(0);
      // The first row, one in the middle and the last: each in its own place in the tab's groups.
      const pressed = [0, Math.floor(rows.length / 2), rows.length - 1].flatMap((i) =>
        rows.slice(i, i + 1),
      );
      for (const row of pressed) {
        const number = row.hymn.number;
        const pages = pageSource(Option.some(row.source), number, all);
        expect({
          href: hymnHref(number),
          list: pages.list,
          shown: pages.list[pages.index],
          next: pages.list[pages.index + 1],
        }).toEqual({
          href: `/hymns/${number}`,
          list: ascending,
          shown: number,
          next: ascending[ascending.indexOf(number) + 1],
        });
      }
    });
  }
});
