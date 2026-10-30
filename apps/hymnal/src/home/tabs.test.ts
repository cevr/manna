/**
 * The home list's tabs (`tabsOf`), as numbers and names only: each tab's
 * groups from a small hymnal and small indexes, and the index tabs left out
 * when their index is empty.
 */

import { describe, expect, it } from 'bun:test';

import { Option } from 'effect';

import type { HymnIndexes } from '~/hymns/indexes';

import {
  groupAt,
  openingOffset,
  spansOf,
  STRIP_STEPS,
  type TabName,
  tabNamed,
  tabsOf,
  tilesOf,
} from './tabs';

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

describe('a chosen tab', () => {
  it('opens where the reader left it, else where the list is now', () => {
    const kept = new Map<TabName, number>([['Topics', 240]]);
    expect([openingOffset(kept, 'Topics', 80), openingOffset(kept, 'Metres', 80)]).toEqual([
      240, 80,
    ]);
  });
});

describe('All at once', () => {
  const at = (stretch: number) => stretch / STRIP_STEPS;

  it("draws a group's hymns on its strip, a run of neighbouring stretches as one span", () => {
    expect(spansOf([])).toEqual([]);
    expect(spansOf([1])).toEqual([{ start: 0, end: at(1) }]);
    expect(spansOf([695])).toEqual([{ start: at(47), end: 1 }]);
    expect(spansOf([1, 20])).toEqual([{ start: 0, end: at(2) }]);
    expect(spansOf([100, 1, 900])).toEqual([
      { start: 0, end: at(1) },
      { start: at(6), end: at(7) },
    ]);
  });

  it('gives each group a tile with its count, outlining the one with the playing hymn', () => {
    const topics = tabNamed(tabsOf({ hymns, favourites: [], recent: [], indexes }), 'Topics');
    const tiles = (playing: Option.Option<number>) =>
      tilesOf(topics, playing).map((tile) => [tile.index, tile.name, tile.count, tile.playing]);
    expect(tiles(Option.some(4))).toEqual([
      [0, 'Joy', 2, true],
      [1, 'Rest', 1, false],
    ]);
    expect(tiles(Option.some(3)).map((tile) => tile[3])).toEqual([false, false]);
    expect(tiles(Option.none()).map((tile) => tile[3])).toEqual([false, false]);
  });

  it('opens at the group whose row is at or above the list top', () => {
    const starts = [100, 300, 500];
    expect([0, 99, 100, 299.5, 301, 900].map((offset) => groupAt(starts, offset))).toEqual([
      0, 0, 0, 1, 1, 2,
    ]);
    expect(groupAt([], 40)).toBe(0);
  });

  it('opens at the group pinned under the field when the field covers the list top', () => {
    const starts = [100, 300, 500];
    expect([0, 99, 250, 450].map((offset) => groupAt(starts, offset, 60))).toEqual([0, 0, 1, 2]);
  });
});
