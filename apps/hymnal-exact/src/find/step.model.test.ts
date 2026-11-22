/* oxlint-disable effect/noTernary, effect/noNullish, eslint/complexity, effect/maxCognitiveComplexity -- a Bun test in an Exact app's folder imports no effect (docs/exact.md), so the reference model is one plain switch over every input, as a reader checks it against the spec, and no open search is `null`. */

/**
 * Finding, model-based. Generated sequences of every input, on generated
 * stacks of screens and on the stacks the step's own moves make (a push or
 * a replace applied as the view applies it), run against the port's `step`
 * and against a reference model written here. On every step:
 *
 * - the bar's row and each control's chosen mark and reach equal the
 *   current app's `rowOf`, `drawn`, `inReach` and `chosenOf` for the same
 *   state and path, and the model's;
 * - while the drums are open nothing but the `#` and the drums act, and
 *   closing them moves no route;
 * - the number shown is a hymn's, 1…695, and is `turn` and `held` applied
 *   to the same turns;
 * - `open` goes where `openingAt(path, n)` says;
 * - Done returns the list as it stood, and the tiles never show off home;
 * - a pinch acts at most once a gesture, as `pinchAct` asks.
 */

import { describe, expect, test } from 'bun:test';

import {
  chosenOf,
  drawn,
  inReach,
  pinchAct,
  rowOf,
  Tiles,
  tilesAt,
} from '@manna/hymnal-app/home/find-rules';
import { openingAt } from '@manna/hymnal-app/home/opening';
import { type Drum, held, turn } from '@manna/hymnal-app/player/drums';
import { modeAt, searchAt } from '@manna/hymnal-app/reader/search-mode';

import { below, pick, type Random, seeded } from '../test/random.ts';
import { HOME, initial, type Input, type State, step, view } from './step.ts';

const PATHS = [
  '/recent',
  '/hymns/2',
  '/hymns/100',
  '/hymns/695',
  '/hymns/7',
  '/player',
  '/settings',
  '/settings/about',
];
const DRUMS: ReadonlyArray<Drum> = ['hundreds', 'tens', 'ones'];
const CONTROLS = ['search', 'box', 'cancel', 'hash'] as const;

const stackOf = (random: Random): Array<string> => [
  HOME,
  ...Array.from({ length: below(random, 4) }, () => pick(random, PATHS)),
];

const inputOf = (random: Random, stack: ReadonlyArray<string>): Input => {
  const roll = below(random, 17);
  if (roll === 0) return { kind: 'screen', stack: stackOf(random) };
  if (roll === 1) return { kind: 'screen', stack: stack.length > 1 ? stack.slice(0, -1) : stack };
  if (roll === 2) return { kind: 'searchOn' };
  if (roll === 3) return { kind: 'searchOff' };
  if (roll === 4) return { kind: 'query', text: pick(random, ['', '2', 'praise', '  ', 'zzqx']) };
  if (roll === 5) return { kind: 'drumsOpen', bar: pick(random, [0, 0, 13, 695, 700, -1]) };
  if (roll === 6) return { kind: 'drumsClose' };
  if (roll < 9) return { kind: 'turn', drum: pick(random, DRUMS), n: below(random, 41) - 20 };
  if (roll === 9) return { kind: 'open' };
  if (roll === 10) return { kind: 'tilesShow' };
  if (roll === 11) return { kind: 'tilesDone' };
  if (roll === 12 || roll === 13) return { kind: 'pinchBegin' };
  if (roll === 14)
    return {
      kind: 'pinch',
      scale: pick(random, [1, 0.9, 0.8, 0.5, 1.1, 1.25, 1.6, 0.97, 1.03]),
      velocity: pick(random, [0, 0, -0.6, 0.6, -2, 2]),
    };
  return { kind: 'wheel', deltaY: pick(random, [8, -8, 25, -25, 0]) };
};

/** The reference model, written plainly from the rules' words. */
interface Model {
  stack: Array<string>;
  searchPath: string | null;
  query: string;
  drums: boolean;
  number: number;
  tiles: boolean;
  spent: boolean;
  wheel: number;
  goes: number;
}

const top = (m: Model) => m.stack.at(-1) ?? HOME;
const modelRow = (m: Model) =>
  m.searchPath === top(m) ? 'open' : top(m) === HOME && m.tiles ? 'tiles' : 'folded';
const rowControls = {
  folded: ['search', 'hash'],
  open: ['box', 'hash', 'cancel'],
  tiles: ['hash'],
} as const;
const modelActs = (m: Model, c: string) =>
  (rowControls[modelRow(m)] as ReadonlyArray<string>).includes(c) && (!m.drums || c === 'hash');
const modelPinchable = (m: Model) => top(m) === HOME && m.searchPath !== HOME && !m.drums;
const isHymnPage = (path: string) => /^\/hymns\/[^/]+$/u.test(path);

/** The model's pinch: `pinchAct`'s bands, written out. */
const asks = (scale: number, velocity: number) => {
  if (scale <= 0.8 || (scale < 0.95 && velocity <= -0.5)) return 'zoomOut';
  if (scale >= 1.25 || (scale > 1.05 && velocity >= 0.5)) return 'zoomIn';
  return 'none';
};

const modelPinch = (m: Model, scale: number, velocity: number): boolean => {
  if (m.spent || !modelPinchable(m)) return false;
  const wants = top(m) === HOME && m.tiles ? 'zoomIn' : 'zoomOut';
  if (asks(scale, velocity) !== wants) return false;
  m.tiles = wants === 'zoomOut';
  m.spent = true;
  return true;
};

const modelChose = (m: Model, n: number) => {
  m.drums = false;
  const here = top(m);
  const onPage = isHymnPage(here);
  if (onPage && m.searchPath === here) {
    m.searchPath = null;
    m.query = '';
  }
  if (onPage && here === `/hymns/${n}`) return;
  m.goes += 1;
};

const modelStep = (m: Model, input: Input): void => {
  switch (input.kind) {
    case 'screen': {
      const stack = input.stack.length === 0 ? [HOME] : [...input.stack];
      if (stack.at(-1) !== top(m)) m.drums = false;
      m.stack = stack;
      if (m.searchPath !== null && !stack.includes(m.searchPath)) {
        m.searchPath = null;
        m.query = '';
      }
      return;
    }
    case 'searchOn':
      if (modelActs(m, 'search')) {
        m.searchPath = top(m);
        m.query = '';
      }
      return;
    case 'searchOff':
      if (modelActs(m, 'cancel')) {
        m.searchPath = null;
        m.query = '';
      }
      return;
    case 'query':
      if (modelActs(m, 'box')) m.query = input.text;
      return;
    case 'drumsOpen':
      if (!modelActs(m, 'hash')) return;
      if (m.drums) m.drums = false;
      else {
        m.drums = true;
        m.number = input.bar > 0 ? held(input.bar) : 1;
      }
      return;
    case 'drumsClose':
      m.drums = false;
      return;
    case 'turn':
      if (m.drums) m.number = turn(m.number, input.drum, input.n);
      return;
    case 'open':
      if (m.drums) modelChose(m, m.number);
      return;
    case 'tilesShow':
      if (top(m) === HOME && modelRow(m) === 'folded' && !m.drums) m.tiles = true;
      return;
    case 'tilesDone':
      if (top(m) === HOME && m.tiles && !m.drums) m.tiles = false;
      return;
    case 'pinchBegin':
      m.spent = false;
      return;
    case 'pinch':
      modelPinch(m, input.scale, input.velocity);
      return;
    case 'wheel': {
      const scale = m.wheel * (1 - input.deltaY / 100);
      if (!modelPinchable(m) || !(scale > 0)) {
        m.wheel = 1;
        return;
      }
      const spent = m.spent;
      m.spent = false;
      if (modelPinch(m, scale, 0)) {
        m.wheel = 1;
        m.spent = spent;
      } else {
        m.spent = spent;
        m.wheel = scale;
      }
      return;
    }
  }
};

/** The open search the current app would hold for the model's. */
const openOf = (m: Model) => (m.searchPath === null ? null : searchAt(m.searchPath, 'field'));

describe('finding, against the model and the current app’s rules', () => {
  test('generated sequences of every input', () => {
    const random = seeded(1888);
    let pushes = 0;
    let replaces = 0;
    let pinches = 0;
    let wraps = 0;
    for (let run = 0; run < 300; run++) {
      let state: State = initial;
      const m: Model = {
        stack: [HOME],
        searchPath: null,
        query: '',
        drums: false,
        number: 1,
        tiles: false,
        spent: false,
        wheel: 1,
        goes: 0,
      };
      for (let at = 0; at < 60; at++) {
        const input = inputOf(random, state.stack);
        const before = state;
        const beforeView = view(before);
        state = step(state, input);
        modelStep(m, input);
        const shown = view(state);
        const where = { run, at, input };

        const path = shown.top;
        const open = openOf(m);
        const tiles = m.tiles ? Tiles.Shown({ stood: { offset: 0, cover: 0 } }) : Tiles.Hidden();
        const row = rowOf(open === null ? 'off' : modeAt(open, path), tilesAt(tiles, path));
        expect({ ...where, top: path }).toEqual({ ...where, top: top(m) });
        expect({ ...where, row: shown.row }).toEqual({ ...where, row });
        expect({ ...where, row: shown.row }).toEqual({ ...where, row: modelRow(m) });
        expect(shown.chosen).toBe(chosenOf(row, m.drums));
        const reach = {
          search: shown.searchReach,
          box: shown.boxReach,
          cancel: shown.cancelReach,
          hash: shown.hashReach,
        };
        const draws = {
          search: shown.searchDrawn,
          box: shown.boxDrawn,
          cancel: shown.cancelDrawn,
          hash: true,
        };
        for (const control of CONTROLS) {
          const has = drawn(row).includes(control);
          expect({ ...where, control, drawn: draws[control] }).toEqual({
            ...where,
            control,
            drawn: has,
          });
          expect({ ...where, control, reach: reach[control] }).toEqual({
            ...where,
            control,
            reach: has && inReach(control, m.drums),
          });
          expect(reach[control]).toBe(modelActs(m, control));
        }

        if (shown.drums) {
          expect(
            shown.searchReach ||
              shown.boxReach ||
              shown.cancelReach ||
              shown.tilesControl ||
              shown.pinchable,
          ).toBe(false);
          expect(shown.hashReach).toBe(true);
        }
        if (input.kind === 'drumsClose') {
          expect(shown.go).toEqual(before.go);
          expect(shown.top).toBe(beforeView.top);
          expect(state.stack).toEqual(before.stack);
        }

        expect(shown.number).toBe(m.number);
        expect(shown.number).toBe(held(shown.number));
        expect(shown.number >= 1 && shown.number <= 695).toBe(true);
        expect(shown.hundreds * 100 + shown.tens * 10 + shown.ones).toBe(shown.number);
        if (input.kind === 'turn' && before.drums) {
          expect(shown.number).toBe(turn(before.number, input.drum, input.n));
          if (input.drum !== 'hundreds' && (input.n < 0 || input.n > 9)) wraps += 1;
        }

        const chosen = (input.kind === 'open' && before.drums && before.number) || 0;
        if (chosen > 0) {
          const how = openingAt(beforeView.top, chosen);
          if (how === 'stay') expect(shown.go).toEqual(before.go);
          else {
            expect(shown.go).toEqual({
              serial: before.go.serial + 1,
              how,
              path: `/hymns/${chosen}`,
            });
            if (how === 'push') pushes += 1;
            else replaces += 1;
          }
          expect(shown.drums).toBe(false);
        } else expect(shown.go).toEqual(before.go);
        expect(shown.go.serial).toBe(m.goes);

        if (shown.searchAt === '')
          expect({ ...where, query: shown.query }).toEqual({ ...where, query: '' });

        if (shown.tiles) expect(shown.top).toBe(HOME);
        expect(shown.tiles).toBe(shown.top === HOME && m.tiles);
        if (input.kind === 'tilesDone' && beforeView.tiles && !before.drums) {
          expect(shown.tiles).toBe(false);
          expect(state.stack).toEqual(before.stack);
          expect(shown.row).toBe('folded');
        }

        if (input.kind === 'pinch') {
          const acted = before.tiles._tag !== state.tiles._tag;
          if (acted) {
            pinches += 1;
            expect(before.spent).toBe(false);
            expect(pinchAct(input.scale, input.velocity)).toBe(
              beforeView.tiles ? 'zoomIn' : 'zoomOut',
            );
            expect(state.spent).toBe(true);
          }
          if (before.spent) expect(state.tiles).toBe(before.tiles);
        }

        if (shown.go.serial > before.go.serial) {
          const stack = [...state.stack];
          if (shown.go.how === 'push') stack.push(shown.go.path);
          else stack.splice(-1, 1, shown.go.path);
          state = step(state, { kind: 'screen', stack });
          modelStep(m, { kind: 'screen', stack });
        }
      }
    }
    expect(pushes).toBeGreaterThan(20);
    expect(replaces).toBeGreaterThan(5);
    expect(pinches).toBeGreaterThan(5);
    expect(wraps).toBeGreaterThan(20);
  });

  test('one gesture commits once: in, then out within it, then a new one', () => {
    let state = step(initial, { kind: 'pinchBegin' });
    state = step(state, { kind: 'pinch', scale: 0.7, velocity: 0 });
    expect(view(state).tiles).toBe(true);
    state = step(state, { kind: 'pinch', scale: 1.6, velocity: 0 });
    expect(view(state).tiles).toBe(true);
    state = step(state, { kind: 'pinchBegin' });
    state = step(state, { kind: 'pinch', scale: 1.6, velocity: 0 });
    expect(view(state).tiles).toBe(false);
  });

  test('a trackpad’s pinch: wheel deltas commit once their scale reaches a band', () => {
    let state = initial;
    for (let k = 0; k < 4; k++) state = step(state, { kind: 'wheel', deltaY: 5 });
    expect(view(state).tiles).toBe(false);
    state = step(state, { kind: 'wheel', deltaY: 5 });
    expect(view(state).tiles).toBe(true);
    expect(state.wheel).toBe(1);
  });

  test('a search on a hymn page closes when a found hymn takes the page’s place', () => {
    let state = step(initial, { kind: 'screen', stack: ['/', '/hymns/2'] });
    state = step(state, { kind: 'searchOn' });
    expect(view(state).searchAt).toBe('/hymns/2');
    state = step(state, { kind: 'drumsOpen', bar: 0 });
    state = step(state, { kind: 'turn', drum: 'hundreds', n: 1 });
    state = step(state, { kind: 'open' });
    expect(view(state).go).toEqual({ serial: 1, how: 'replace', path: '/hymns/100' });
    expect(view(state).searchAt).toBe('');
  });
});
