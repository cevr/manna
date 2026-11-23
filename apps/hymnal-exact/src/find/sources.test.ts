/* oxlint-disable effect/noGlobals -- the sizes it holds are the JSON bytes an answer ships. */

/**
 * Finding's sources as the data module runs them: every call of
 * `findStep`, of any kind and any arguments, answers inside the data host;
 * the tiles' answer is a tile a group of the tab asked, small for every
 * tab, and nothing asks it until the tiles show (the view asks it on a
 * state the tiles' first show sets, `findTilesAsked` in
 * `features/find.contract`); the drums' row answers for every tab.
 */

import { describe, expect, test } from 'bun:test';

import { withDataHost } from '@manna/exact-kit/data-host/testing';

import { book } from '../hymns/book.testing.ts';
import { appFile, contractFiles, oneFile } from '../look/design.testing.ts';
import { below, pick, seeded } from '../test/random.ts';
import { findSources } from './sources.ts';

const KINDS = [
  'screen',
  'searchOn',
  'searchOff',
  'query',
  'drumsOpen',
  'drumsClose',
  'turn',
  'open',
  'tilesShow',
  'tilesDone',
  'tile',
  'pinchBegin',
  'pinch',
  'wheel',
  'nonsense',
] as const;

const TEXTS = [
  '',
  '/',
  '/ /hymns/2',
  '/ /recent /hymns/100',
  'hundreds',
  'tens',
  'ones',
  'x',
  'praise',
];
const NUMBERS = [0, 1, -1, 9, 10, 100, 695, 696, 1.5, 0.7, 1.3, Number.NaN, Infinity, -Infinity];

describe('finding’s sources', () => {
  test('inside the data host, every call answers a view, the serial rising', () => {
    const random = seeded(1915);
    const sources = findSources(book);
    let serial = 0;
    withDataHost(() => {
      for (let run = 0; run < 2000; run++) {
        const shown = sources.findStep([
          pick(random, KINDS),
          pick(random, TEXTS),
          pick(random, NUMBERS),
          below(random, 3) - 1,
        ]);
        expect(shown.serial).toBe(serial + 1);
        serial = shown.serial;
        expect(shown.number >= 1 && shown.number <= 695).toBe(true);
      }
    });
  });

  test('the tiles’ answer is one tile a group, under 64 KB for every tab (Metres, 223 groups, the most), asked by no other call', () => {
    const counts = { tiles: 0 };
    const sources = findSources(book, counts);
    sources.findStep(['screen', '/', 0, 0]);
    sources.findStep(['tilesShow', '', 0, 0]);
    sources.findStep(['tilesDone', '', 0, 0]);
    sources.findFollowRow(['Sections', 100, [], []]);
    expect(counts.tiles).toBe(0);
    for (const tab of ['Sections', 'Lists', 'Topics', 'Metres', 'Scripture']) {
      const tiles = withDataHost(() => sources.findGroupTiles([tab, [3, 100], [5, 100, 2], 100]));
      expect(tiles.length).toBeGreaterThan(0);
      expect(new TextEncoder().encode(JSON.stringify(tiles)).length).toBeLessThan(65536);
    }
    expect(counts.tiles).toBe(5);
    expect(withDataHost(() => sources.findGroupTiles(['Nonsense', [], [], 0]))).toEqual([]);
  });

  test('inside the data host, the drums’ row answers for every tab and number', () => {
    const sources = findSources(book);
    withDataHost(() => {
      expect(sources.findFollowRow(['Sections', 100, [], []])).toEqual({ row: 'hymn-100' });
      expect(sources.findFollowRow(['Lists', 100, [], []])).toEqual({ row: '' });
      expect(sources.findFollowRow(['Lists', 100, [100], [100]])).toEqual({ row: 'hymn-100' });
    });
  });

  test('the bar’s and the drums’ places are the current app’s measures', () => {
    const constant = (path: string, name: string): number => {
      const found = new RegExp(`^export const ${name} = (\\d+);$`, 'mu').exec(oneFile(path));
      expect(found).not.toBeNull();
      return Number(found?.[1]);
    };
    const bar = 'src/player/bar.ts';
    expect(oneFile(bar)).toContain('export const DOCKED_LIFT = (REST - HASH) / 2;');
    const [rest, hash] = [constant(bar, 'REST'), constant(bar, 'HASH')];
    const places = withDataHost(() => findSources(book).findPlaces());
    expect(places).toEqual({
      hash,
      gap: constant(bar, 'HASH_GAP'),
      lift: (rest - hash) / 2,
      rest,
      detent: constant('src/player/dial.ts', 'DETENT'),
      pad: constant('src/player/DialPanel.tsx', 'PANEL_PAD'),
      rowGap: constant('src/player/DialPanel.tsx', 'ROW_GAP'),
      end: constant('src/reader/end.ts', 'END_ROOM'),
    });
  });

  test('a list’s end is the current app’s ListEnd: the `#`’s top over the list’s foot, then END_ROOM', () => {
    expect(oneFile('src/reader/end.ts')).toContain(
      'export const endSpace = (bottom: number) => Math.max(0, bottom) + END_ROOM;',
    );
    expect(oneFile('src/reader/end.ts')).toContain('endSpace(Math.max(stackBottom, findRoom));');
    const bar = oneFile('src/player/bar.ts');
    expect(bar).toContain('OverBar: () => HASH_GAP + HASH,');
    expect(bar).toContain('Docked: () => Math.max(0, inset) + DOCKED_LIFT + HASH,');
    expect(bar).toContain('Hidden: () => Math.max(0, inset),');
    expect(bar).toContain('Shown: () => 0,');
    expect(appFile('features/list.contract')).toContain(
      'fn listEnd(port: FindPort, at: FindPlaces, overBar: bool): number = port.safeAreaBottom + (overBar ? at.gap : at.lift) + at.hash + at.end',
    );
  });

  test('every `hymn-list` scroller ends in its ListEnd, so no tab’s last row sits under the controls', () => {
    const ends = contractFiles().flatMap((path) => {
      const lines = appFile(path).split('\n');
      const indent = (line: string) => line.length - line.trimStart().length;
      return lines.flatMap((line, at) => {
        if (!/^\s*scroll .*testId="hymn-list"/.test(line)) return [];
        const depth = indent(line);
        const rest = lines.slice(at + 1);
        const stop = rest.findIndex((next) => next.trim() !== '' && indent(next) <= depth);
        const children = rest.filter(
          (next, i) =>
            (stop === -1 || i < stop) &&
            next.trim() !== '' &&
            !next.trim().startsWith('//') &&
            indent(next) === depth + 2,
        );
        return [`${path}:${at + 1} ${children.at(-1)?.trim() ?? ''}`];
      });
    });
    expect(ends.length).toBeGreaterThanOrEqual(2);
    for (const end of ends) expect(end).toEndWith(' ListEnd()');
  });

  test('a screen is named by its path, without the query or fragment a launch adds', () => {
    const sources = findSources(book);
    const home = sources.findStep(['screen', '/?authFixture=x', 0, 0]);
    expect(home.top).toBe('/');
    expect(home.tilesControl).toBe(true);
    expect(sources.findStep(['screen', '/?a=b /hymns/100#top', 0, 0]).top).toBe('/hymns/100');
  });
});
