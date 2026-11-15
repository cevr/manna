/* oxlint-disable effect/noGlobals -- the sizes it holds are the JSON bytes an answer ships. */

/**
 * Finding's sources as the data module runs them: every call of
 * `findStep`, of any kind and any arguments, answers inside the data host;
 * the tiles' answer is every hymn's number and nothing else, under 4 KB,
 * and nothing asks it until the tiles show (the view asks it on a state
 * the tiles' first show sets, `findTilesAsked` in `features/find.contract`).
 */

import { describe, expect, test } from 'bun:test';

import { withDataHost } from '@manna/exact-kit/data-host/testing';

import { book } from '../hymns/book.ts';
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

  test('the tiles’ answer is every hymn’s number alone, under 4 KB, asked by no other call', () => {
    const counts = { tiles: 0 };
    const sources = findSources(book, counts);
    sources.findStep(['screen', '/', 0, 0]);
    sources.findStep(['tilesShow', '', 0, 0]);
    sources.findStep(['tilesDone', '', 0, 0]);
    expect(counts.tiles).toBe(0);
    const tiles = withDataHost(() => sources.findTiles());
    expect(counts.tiles).toBe(1);
    expect(tiles).toEqual(book.hymns.map((hymn) => hymn.number));
    expect(JSON.stringify(tiles)).toMatch(/^\[\d+(,\d+)*\]$/u);
    expect(new TextEncoder().encode(JSON.stringify(tiles)).length).toBeLessThan(4096);
  });

  test('a screen is named by its path, without the query or fragment a launch adds', () => {
    const sources = findSources(book);
    const home = sources.findStep(['screen', '/?authFixture=x', 0, 0]);
    expect(home.top).toBe('/');
    expect(home.tilesControl).toBe(true);
    expect(sources.findStep(['screen', '/?a=b /hymns/100#top', 0, 0]).top).toBe('/hymns/100');
  });
});
