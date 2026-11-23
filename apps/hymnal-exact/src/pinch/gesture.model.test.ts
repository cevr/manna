/* oxlint-disable effect/noTernary, effect/noNullish, effect/noUnsafeDictionaryType, effect/noAsyncFunction, eslint/no-await-in-loop, effect/maxCognitiveComplexity -- a Bun test in an Exact app's folder imports no effect (docs/exact.md): the app's module answers a Promise of untyped JSON as the host awaits it, a source is handed no store as the host hands it none, a history is run one take after another in order, and the reference is the current app's gesture as one plain loop. */

/**
 * The pinch, model-based. Generated two-finger histories (a begin, a run of
 * moves with their times, then a lift with the speed of its last two
 * samples or a cancel; a second gesture after, a third finger now and then,
 * search and the drums opened or closed between gestures) are fed to the
 * page module's tracker as touches, taken from its log at generated moments
 * as the screen's source takes them (`findPinchTake`), and run through the
 * find step (`findStep("pinchRun", …)`). Beside them the current app's
 * gesture runs as `home/pinch.ts` runs it: off while search or the drums
 * are open, `pinchAct(scale, 0)` at each move and `pinchAct(scale,
 * velocity)` at the lift, committing the first time it asks for its
 * screen's act (the list's `zoomOut`, the tiles' `zoomIn`), once a gesture,
 * never on a cancel. After every take the tiles show exactly where the
 * current app's do.
 */

import { describe, expect, test } from 'bun:test';

import { pinchAct } from '@manna/hymnal-app/home/find-rules';

import { connect, later, pinchTracker } from '../../modules/web/index.js';
import { findSources } from '../find/sources.ts';
import { book } from '../hymns/book.testing.ts';
import { below, pick, type Random, seeded } from '../test/random.ts';
import { pinchSources } from './sources.ts';

const native = {
  available: true,
  later: (request: Record<string, unknown>) =>
    later(request as Record<string, string | number | boolean>),
  watch: () => {},
};

/** A touch's phase, the fingers down after it, its time. */
type Touch = readonly ['start' | 'move' | 'end' | 'cancel', ReadonlyArray<number>, number];

/** Two fingers about x = 200, their spread `d` apart. */
const fingers = (d: number) => [
  { x: 200 - d / 2, y: 300 },
  { x: 200 + d / 2, y: 300 },
];

/** One generated gesture: its touches, the scales and times it moves through, and how it ends. */
interface Gesture {
  readonly moves: ReadonlyArray<readonly [number, number]>;
  readonly end: 'lift' | 'cancel' | 'third';
}

const gestureOf = (random: Random, from: number): Gesture => {
  let scale = 1;
  let time = from;
  const moves: Array<readonly [number, number]> = [];
  const lean = random() < 0.5 ? -1 : 1;
  for (let n = below(random, 7); n > 0; n -= 1) {
    scale = Math.max(0.3, scale + lean * random() * 0.12 - random() * 0.03 * lean);
    time += 4 + below(random, 40);
    moves.push([Math.round(scale * 10000) / 10000, time]);
  }
  const end = pick(random, ['lift', 'lift', 'lift', 'lift', 'cancel', 'third'] as const);
  return { moves, end };
};

const BASE = 120;

/** The touches a gesture makes: two fingers down, their moves, then a lift, a cancel or a third finger. */
const touchesOf = (gesture: Gesture, from: number): ReadonlyArray<Touch> => {
  const last = gesture.moves.at(-1)?.[1] ?? from;
  const tail: ReadonlyArray<Touch> =
    gesture.end === 'lift'
      ? [['end', [], last + 8]]
      : gesture.end === 'cancel'
        ? [['cancel', [], last + 8]]
        : [
            ['start', [0, 0, 0], last + 8],
            ['end', [], last + 16],
          ];
  return [
    ['start', [BASE, BASE], from],
    ...gesture.moves.map(([scale, time]): Touch => ['move', [BASE * scale, BASE * scale], time]),
    ...tail,
  ];
};

/** The speed at the lift, as UIKit's pinch reports it and the tracker reads it: the last two samples, the begin one at scale 1. */
const speedOf = (gesture: Gesture, from: number): number => {
  const samples = [[1, from] as const, ...gesture.moves];
  const [a, b] = samples.slice(-2);
  if (a === undefined || b === undefined || b[1] <= a[1]) return 0;
  return (b[0] - a[0]) / ((b[1] - a[1]) / 1000);
};

const round = (n: number) => Math.round(n * 10000) / 10000 || 0;

/**
 * The current app's gesture on its screen, as home/pinch.ts runs it: the
 * index of the touch it commits at (each move asks with no speed, the lift
 * with its speed), or -1 when it never does.
 */
const oneCommitsAt = (gesture: Gesture, from: number, tiles: boolean, enabled: boolean) => {
  if (!enabled) return -1;
  const act = tiles ? 'zoomIn' : 'zoomOut';
  const moved = gesture.moves.findIndex(([scale]) => pinchAct(scale, 0) === act);
  if (moved >= 0) return moved + 1;
  if (gesture.end !== 'lift') return -1;
  const scale = gesture.moves.at(-1)?.[0] ?? 1;
  return pinchAct(scale, round(speedOf(gesture, from))) === act ? gesture.moves.length + 1 : -1;
};

/** The screen's inputs between gestures: search, the drums, the tiles' own controls, or none. */
const ASIDE = [
  ['searchOn', '', 0, 0],
  ['searchOff', '', 0, 0],
  ['drumsOpen', '', 0, 0],
  ['drumsClose', '', 0, 0],
  ['tilesShow', '', 0, 0],
  ['tilesDone', '', 0, 0],
] as const;

const run = async (seed: number) => {
  const random = seeded(seed);
  connect({ changed: () => {}, agent: false, now: () => 0 });
  const find = findSources(book);
  const { findPinchTake } = pinchSources();
  const track = pinchTracker();
  let seen = (await findPinchTake([0], 0, 0, native)).serial;
  let shown = find.findStep(['screen', '/', 0, 0]);
  let one = shown.tiles;
  let clock = 1000;
  const take = async () => {
    const heard = await findPinchTake([seen], 0, 0, native);
    if (heard.serial <= seen) return;
    seen = heard.serial;
    shown = find.findStep(['pinchRun', heard.run, 0, 0]);
  };
  for (let g = 0; g < 6; g += 1) {
    if (random() < 0.4) {
      shown = find.findStep([...pick(random, ASIDE)]);
      one = shown.tiles;
    }
    const gesture = gestureOf(random, clock);
    const oneOn = !shown.drums && shown.row !== 'open';
    const at = oneCommitsAt(gesture, clock, one, oneOn);
    const before = one;
    const touches = touchesOf(gesture, clock);
    for (const [index, [kind, spreads, time]] of touches.entries()) {
      const points =
        spreads.length === 3
          ? [...fingers(BASE), { x: 10, y: 10 }]
          : spreads.length === 2
            ? fingers(spreads[0] ?? BASE)
            : [];
      track(kind, points, time, shown.pinchable);
      if (random() < 0.5 || index === touches.length - 1) {
        await take();
        one = at >= 0 && index >= at ? !before : before;
        expect({ seed, g, index, tiles: shown.tiles }).toEqual({ seed, g, index, tiles: one });
      }
    }
    clock += 1000;
  }
};

describe('the pinch, against the current app’s gesture', () => {
  test('generated histories commit where home/pinch.ts commits, once a gesture', async () => {
    for (let seed = 1; seed <= 300; seed += 1) await run(seed);
  });
});

describe('inside the bands, the speed decides', () => {
  /** The tiles after one gesture to `scale` in `steps` even moves `ms` apart, from the list or the tiles. */
  const after = async (scale: number, steps: number, ms: number, tiles: boolean) => {
    connect({ changed: () => {}, agent: false, now: () => 0 });
    const find = findSources(book);
    const { findPinchTake } = pinchSources();
    const track = pinchTracker();
    const since = (await findPinchTake([0], 0, 0, native)).serial;
    find.findStep(['screen', '/', 0, 0]);
    if (tiles) find.findStep(['tilesShow', '', 0, 0]);
    track('start', fingers(BASE), 0, true);
    for (let i = 1; i <= steps; i += 1)
      track('move', fingers(BASE * (1 + ((scale - 1) * i) / steps)), i * ms, true);
    track('end', [], steps * ms + 8, true);
    const heard = await findPinchTake([since], 0, 0, native);
    return find.findStep(['pinchRun', heard.run, 0, 0]).tiles;
  };

  test('a slow pinch to 0.9 or 1.1 changes nothing; the driver’s quick one commits, as pinchAct says', async () => {
    expect(pinchAct(0.9, -0.05)).toBe('none');
    expect(pinchAct(1.1, 0.05)).toBe('none');
    expect(await after(0.9, 8, 250, false)).toBe(false);
    expect(await after(1.1, 8, 250, true)).toBe(true);
    expect(pinchAct(0.9, -0.78)).toBe('zoomOut');
    expect(pinchAct(1.1, 0.78)).toBe('zoomIn');
    expect(await after(0.9, 8, 16, false)).toBe(true);
    expect(await after(1.1, 8, 16, true)).toBe(false);
  });

  test('inside the dead band no speed commits', async () => {
    expect(await after(0.97, 8, 1, false)).toBe(false);
    expect(await after(1.03, 8, 1, true)).toBe(true);
  });
});

describe('the tracker', () => {
  test('one finger, and a start with the node off, report nothing', () => {
    const words: Array<string> = [];
    const track = pinchTracker((word) => words.push(word));
    track('start', [{ x: 1, y: 1 }], 0, true);
    track('move', [{ x: 9, y: 9 }], 10, true);
    track('end', [], 20, true);
    track('start', fingers(100), 30, false);
    track('move', fingers(50), 40, false);
    track('end', [], 50, false);
    expect(words).toEqual([]);
  });

  test('a lift reports its scale and the speed of its last two samples', () => {
    const words: Array<string> = [];
    const track = pinchTracker((word) => words.push(word));
    track('start', fingers(100), 0, true);
    track('move', fingers(90), 20, true);
    track('move', fingers(80), 40, true);
    track('end', [], 48, true);
    expect(words).toEqual(['b', 'm 0.9', 'm 0.8', 'e 0.8 -5']);
  });

  test('the node turned off, a cancel and a third finger each cancel', () => {
    const words: Array<string> = [];
    const track = pinchTracker((word) => words.push(word));
    track('start', fingers(100), 0, true);
    track('move', fingers(80), 10, false);
    track('start', fingers(100), 20, true);
    track('cancel', [], 30, true);
    track('start', fingers(100), 40, true);
    track('start', [...fingers(100), { x: 0, y: 0 }], 50, true);
    track('end', [], 60, true);
    expect(words).toEqual(['b', 'c', 'b', 'c', 'b', 'c']);
  });
});
