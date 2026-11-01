import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';

import { Bar, FindAt, findAt, findRoom } from '~/player/bar';
import { Player } from '~/player/player';
import type { SearchMode } from '~/reader/place';

import {
  askTiles,
  type Control,
  drawn,
  inReach,
  type Row,
  rowOf,
  showTiles,
  type Stood,
  Tiles,
} from './finding';

/** A seeded run of numbers, so a failing sequence comes back the same. */
const seeded = (start: number) => {
  let seed = start;
  return (below: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % below;
  };
};

const modes: ReadonlyArray<SearchMode> = ['off', 'field', 'about'];
const allTiles: ReadonlyArray<Tiles> = [
  Tiles.Hidden(),
  Tiles.Asked(),
  Tiles.Shown({ stood: { offset: 120, cover: 0 } }),
];

describe('the find bar row', () => {
  test('folded, it holds Search, All at once and the # in that order', () => {
    expect(drawn(rowOf('off', Tiles.Hidden()))).toEqual(['search', 'grid', 'hash']);
  });

  test('search open, from Search or from About this hymn, draws the box, the # and Cancel, and no All at once', () => {
    for (const mode of ['field', 'about'] as const)
      for (const state of allTiles)
        expect(drawn(rowOf(mode, state))).toEqual(['box', 'hash', 'cancel']);
  });

  test('while the tiles are asked for or show, the # alone stands', () => {
    expect(drawn(rowOf('off', Tiles.Asked()))).toEqual(['hash']);
    expect(drawn(rowOf('off', allTiles[2]!))).toEqual(['hash']);
  });

  test('every row draws exactly one #, at most one All at once and a search box exactly while search is open', () => {
    for (const mode of modes)
      for (const state of allTiles) {
        const row: Row = rowOf(mode, state);
        const controls = drawn(row);
        expect({
          hashes: controls.filter((c) => c === 'hash').length,
          grids: controls.filter((c) => c === 'grid').length <= 1,
          box: controls.includes('box'),
        }).toEqual({ hashes: 1, grids: true, box: mode !== 'off' });
      }
  });

  test('while the drums are open only the # takes a touch: the rest lies under their backdrop', () => {
    const controls: ReadonlyArray<Control> = ['search', 'grid', 'box', 'cancel', 'hash'];
    expect(controls.filter((c) => inReach(c, true))).toEqual(['hash']);
    expect(controls.filter((c) => inReach(c, false))).toEqual([...controls]);
  });
});

describe('All at once, asked by the bar and shown by the home screen', () => {
  test('over generated presses, each zoom reads the list place once, at its first show', () => {
    const next = seeded(0x7a11e5);
    for (let run = 0; run < 40; run++) {
      let state: Tiles = Tiles.Hidden();
      // The place the current zoom took, once it shows.
      let took = Option.none<Stood>();
      for (let step = 0; step < 12; step++) {
        const pick = next(3);
        if (pick === 0) state = askTiles(state);
        else if (pick === 1) {
          const stood = { offset: next(5000), cover: next(60) };
          state = showTiles(state, stood);
          if (Option.isNone(took)) took = Option.some(stood);
        } else {
          state = Tiles.Hidden();
          took = Option.none();
        }
        const stood = Option.liftPredicate(state, Tiles.$is('Shown')).pipe(
          Option.map((s) => s.stood),
        );
        expect(stood).toEqual(took);
      }
    }
  });

  test('a second press on All at once leaves asked or shown tiles as they are', () => {
    expect(askTiles(Tiles.Asked())).toEqual(Tiles.Asked());
    expect(askTiles(allTiles[2]!)).toEqual(allTiles[2]!);
  });
});

describe('the find bar place on the home list', () => {
  const track = { number: 4, title: 'Four' };
  const bars = [
    Bar.Hidden(),
    Bar.Shown({ track, state: Player.Idle(), page: Option.none() }),
    Bar.Shown({ track, state: Player.Loading({ track }), page: Option.none() }),
  ];

  test('stands wherever the # does, over the bar or docked, and every list ends clear of it', () => {
    for (const bar of bars)
      for (const inset of [0, 34]) {
        const at = findAt(bar, { home: true, raised: false });
        expect(FindAt.$is('OverBar')(at) || FindAt.$is('Docked')(at)).toBe(true);
        expect(findRoom(at, inset)).toBeGreaterThanOrEqual(44);
      }
  });
});
