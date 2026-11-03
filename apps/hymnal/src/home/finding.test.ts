import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';

import { Bar, FindAt, findAt, findRoom } from '~/player/bar';
import { Player } from '~/player/player';
import type { SearchMode } from '~/reader/place';

import {
  type Control,
  drawn,
  inReach,
  type PinchAct,
  pinchAct,
  type Row,
  rowOf,
  showTiles,
  type Stood,
  Tiles,
  tilesAt,
} from './finding';

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
  Tiles.Shown({ stood: { offset: 120, cover: 0 } }),
];

describe('the find bar row', () => {
  test('folded, it holds Search then the #, and no All at once', () => {
    expect(drawn(rowOf('off', Tiles.Hidden()))).toEqual(['search', 'hash']);
  });

  test('search open, from Search or from About this hymn, draws the box, the # and Cancel', () => {
    for (const mode of ['field', 'about'] as const)
      for (const state of allTiles)
        expect(drawn(rowOf(mode, state))).toEqual(['box', 'hash', 'cancel']);
  });

  test('the tiles belong to the home list: a hymn page reads them hidden, and its bar stays Search then #', () => {
    for (const state of allTiles) {
      expect(tilesAt(state, '/')).toEqual(state);
      expect(drawn(rowOf('off', tilesAt(state, '/hymns/8')))).toEqual(['search', 'hash']);
    }
  });

  test('while the tiles show, the # alone stands', () => {
    expect(drawn(rowOf('off', allTiles[1]!))).toEqual(['hash']);
  });

  test('every row draws exactly one # and a search box exactly while search is open', () => {
    for (const mode of modes)
      for (const state of allTiles) {
        const row: Row = rowOf(mode, state);
        const controls = drawn(row);
        expect({
          hashes: controls.filter((c) => c === 'hash').length,
          box: controls.includes('box'),
        }).toEqual({ hashes: 1, box: mode !== 'off' });
      }
  });

  test('while the drums are open, inReach names the # alone', () => {
    const controls: ReadonlyArray<Control> = ['search', 'box', 'cancel', 'hash'];
    expect(controls.filter((c) => inReach(c, true))).toEqual(['hash']);
    expect(controls.filter((c) => inReach(c, false))).toEqual([...controls]);
  });
});

describe('All at once, shown by the home screen', () => {
  test('over generated zooms, each zoom reads the list place once, at its first show', () => {
    const next = seeded(0x7a11e5);
    for (let run = 0; run < 40; run++) {
      let state: Tiles = Tiles.Hidden();
      let took = Option.none<Stood>();
      for (let step = 0; step < 12; step++) {
        const pick = next(2);
        if (pick === 0) {
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

describe('the pinch on the home list', () => {
  test('zooms out at 0.8, in at 1.25, and between them only a quick pinch the same way acts', () => {
    const cases: ReadonlyArray<readonly [number, number, PinchAct]> = [
      [1, 0, 'none'],
      [0.8, 0, 'zoomOut'],
      [0.81, 0, 'none'],
      [0.3, 6, 'zoomOut'],
      [1.25, 0, 'zoomIn'],
      [1.24, 0, 'none'],
      [3, -6, 'zoomIn'],
      [0.94, -0.5, 'zoomOut'],
      [0.94, -0.49, 'none'],
      [0.95, -6, 'none'],
      [0.9, 6, 'none'],
      [1.06, 0.5, 'zoomIn'],
      [1.06, 0.49, 'none'],
      [1.05, 6, 'none'],
      [1.1, -6, 'none'],
    ];
    expect(cases.map(([scale, velocity]) => [scale, velocity, pinchAct(scale, velocity)])).toEqual(
      cases.map(([scale, velocity, act]) => [scale, velocity, act]),
    );
  });

  test('never zooms out from 0.95 up nor in from 1.05 down, and at rest acts on the scale alone', () => {
    const next = seeded(7);
    for (let n = 0; n < 2000; n += 1) {
      const scale = (next(4000) + 1) / 1000;
      const velocity = next(12001) / 1000 - 6;
      const act = pinchAct(scale, velocity);
      if (scale >= 0.95) expect(act).not.toBe('zoomOut');
      if (scale <= 1.05) expect(act).not.toBe('zoomIn');
      expect(pinchAct(scale, 0)).toBe(
        (scale <= 0.8 && 'zoomOut') || (scale >= 1.25 && 'zoomIn') || 'none',
      );
    }
  });
});
