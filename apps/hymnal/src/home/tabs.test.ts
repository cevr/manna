/**
 * The home list's tabs (`tabsOf`), as numbers and names only: each tab's
 * groups from a small hymnal and small indexes, and the index tabs left out
 * when their index is empty.
 */

import { describe, expect, it } from 'bun:test';

import type { HymnIndexes } from '~/hymns/indexes';

import { type TabName, tabNamed, tabsOf } from './tabs';

const hymns = [
  { number: 1, topic: 'Worship' },
  { number: 2, topic: 'Worship' },
  { number: 3, topic: 'Advent' },
  { number: 4, topic: 'Worship' },
];

const indexes: HymnIndexes = {
  topics: [
    { name: 'Joy', hymns: [4, 2, 4] },
    { name: 'Rest', parent: 'Joy', hymns: [2] },
    { name: 'Empty', hymns: [900] },
  ],
  references: [
    { hymn: 4, passage: { _tag: 'Chapter', book: 19, chapter: 23, verses: [] } },
    { hymn: 1, passage: { _tag: 'Chapter', book: 1, chapter: 1, verses: [{ from: 1, to: 1 }] } },
    { hymn: 2, passage: { _tag: 'Chapter', book: 19, chapter: 100, verses: [] } },
    { hymn: 1, passage: { _tag: 'Chapter', book: 1, chapter: 2, verses: [] } },
  ],
  metres: [
    {
      metre: 'L.M.',
      tunes: [
        { name: 'Tune A', hymns: [3, 1] },
        { name: 'Tune B', hymns: [1, 2] },
      ],
    },
    { metre: 'Irregular', tunes: [{ name: 'Tune C', hymns: [4] }] },
  ],
  tunes: [],
};

const empty: HymnIndexes = { topics: [], references: [], metres: [], tunes: [] };

const groupsOf = (name: TabName, input = { hymns, favourites: [4, 1], recent: [3, 1], indexes }) =>
  tabNamed(tabsOf(input), name).groups.map((group) => [group.name, group.hymns]);

describe('the home tabs', () => {
  it('come in their order, every one when its index has entries', () => {
    expect(tabsOf({ hymns, favourites: [], recent: [], indexes }).map((tab) => tab.name)).toEqual([
      'Sections',
      'Lists',
      'Topics',
      'Metres',
      'Scripture',
    ]);
  });

  it('leave out an index tab whose index is empty, and fall back to Sections', () => {
    const tabs = tabsOf({ hymns, favourites: [], recent: [], indexes: empty });
    expect(tabs.map((tab) => tab.name)).toEqual(['Sections', 'Lists']);
    expect(tabNamed(tabs, 'Topics').name).toBe('Sections');
  });

  it('group Sections by each run of one section, in number order', () => {
    expect(groupsOf('Sections')).toEqual([
      ['Worship', [1, 2]],
      ['Advent', [3]],
      ['Worship', [4]],
    ]);
  });

  it('put Favourites in number order, then Recent as kept, and leave out an empty list', () => {
    expect(groupsOf('Lists')).toEqual([
      ['Favourites', [1, 4]],
      ['Recent', [3, 1]],
    ]);
    expect(groupsOf('Lists', { hymns, favourites: [], recent: [2], indexes })).toEqual([
      ['Recent', [2]],
    ]);
  });

  it('list Topics in printed order, each hymn once, and leave out a topic with no hymn', () => {
    expect(groupsOf('Topics')).toEqual([
      ['Joy', [4, 2]],
      ['Rest', [2]],
    ]);
  });

  it('list each metre heading’s hymns once, ascending', () => {
    expect(groupsOf('Metres')).toEqual([
      ['L.M.', [1, 2, 3]],
      ['Irregular', [4]],
    ]);
  });

  it('list Scripture by book in the canon’s order, each book’s hymns once, ascending', () => {
    expect(groupsOf('Scripture')).toEqual([
      ['Genesis', [1]],
      ['Psalms', [2, 4]],
    ]);
  });
});
