/**
 * A dial's physics over its whole domain: the twelve keys (wrapping), the
 * capo's frets 0 to 11 (stopping) and the text sizes (stopping), each let
 * go from a grid of places along its row, past both ends, at a grid of
 * speeds both ways, from rest to past the fling cap.
 */

import { describe, expect, it } from 'bun:test';

import { SIZES } from '~/reader/reading';

import {
  DETENT,
  type Detents,
  dragTo,
  FLING_CAP,
  glide,
  MOST_FRAMES,
  ownDetent,
  passed,
  ringOf,
  slotOf,
  along,
} from './dial';

const dials: ReadonlyArray<readonly [string, Detents]> = [
  ['the key dial', { name: 'key', count: 12, wrap: true }],
  ['the capo dial', { name: 'capo', count: 12, wrap: false }],
  ['the text-size dial', { name: 'size', count: SIZES.length, wrap: false }],
];

const tagged = (rest: { readonly cues: ReadonlyArray<{ readonly _tag: string }> }, tag: string) =>
  rest.cues.filter((cue) => cue._tag === tag);

/** Places from two detents before the first to two past the last, a quarter detent apart. */
const placesOf = (dial: Detents) =>
  Array.from({ length: (dial.count + 4) * 4 + 1 }, (_, k) => (k / 4 - 2) * DETENT);

const speeds = [
  -FLING_CAP * 1.5,
  -FLING_CAP,
  -1500,
  -500,
  -100,
  -19,
  0,
  19,
  100,
  500,
  1500,
  FLING_CAP,
  FLING_CAP * 1.5,
];

const grid = (dial: Detents) =>
  placesOf(dial).flatMap((place) => speeds.map((speed) => [place, speed] as const));

describe.each(dials)('%s', (_, dial) => {
  it('tries every place of its grid at every speed', () => {
    expect(grid(dial).length).toBe((dial.count + 4) * 4 * speeds.length + speeds.length);
  });

  it('comes to rest on a whole detent in range', () => {
    for (const [place, speed] of grid(dial)) {
      const rest = glide(dial, place, speed);
      expect(Number.isInteger(rest.index)).toBe(true);
      expect(rest.index).toBeGreaterThanOrEqual(0);
      expect(rest.index).toBeLessThan(dial.count);
      expect(Math.abs(rest.at % DETENT)).toBe(0);
      expect(ownDetent(dial, rest.at / DETENT)).toBe(rest.index);
      if (!dial.wrap) expect(rest.at).toBe(rest.index * DETENT);
    }
  });

  it('comes to rest within a fixed number of frames', () => {
    for (const [place, speed] of grid(dial)) {
      expect(glide(dial, place, speed).frames).toBeLessThanOrEqual(MOST_FRAMES);
    }
    expect(MOST_FRAMES).toBeLessThan(120);
  });

  it('cues each detent passed once, in order, from where it was let go to where it rests', () => {
    for (const [place, speed] of grid(dial)) {
      const rest = glide(dial, place, speed);
      const from = ownDetent(dial, Math.round(dragTo(dial, place).place / DETENT));
      const path = [from, ...rest.crossed];
      for (let k = 1; k < path.length; k += 1) {
        const step = (path[k] ?? 0) - (path[k - 1] ?? 0);
        if (dial.wrap) expect([1, dial.count - 1]).toContain(ownDetent(dial, step));
        else expect([1, -1]).toContain(step);
      }
      expect(path.at(-1)).toBe(rest.index);
      expect(tagged(rest, 'detent')).toEqual(
        rest.crossed.map((at) => ({ _tag: 'detent', dial: dial.name, at })),
      );
      // A glide keeps its way: it never comes back over a detent it passed.
      if (!dial.wrap) expect(new Set(path).size).toBe(path.length);
    }
  });

  it('moves the way it was flung, and not at all from rest on a detent', () => {
    for (const [place, speed] of grid(dial)) {
      const rest = glide(dial, place, speed);
      const held = dragTo(dial, place).place;
      if (speed > 0) expect(rest.at).toBeGreaterThanOrEqual(Math.round(held / DETENT) * DETENT);
      if (speed < 0) expect(rest.at).toBeLessThanOrEqual(Math.round(held / DETENT) * DETENT);
      if (speed === 0 && held % DETENT === 0) expect(rest.crossed).toEqual([]);
    }
  });

  it('cues a wall once, and rests at that end, when driven past an end', () => {
    for (const [place, speed] of grid(dial)) {
      const rest = glide(dial, place, speed);
      const walls = tagged(rest, 'wall');
      expect(walls.length).toBeLessThanOrEqual(1);
      if (dial.wrap) expect(walls).toEqual([]);
      if (walls.length === 1) {
        expect([0, dial.count - 1]).toContain(rest.index);
        expect(rest.cues.at(-1)).toEqual({ _tag: 'wall' });
      }
      if (speed === 0) expect(walls).toEqual([]);
    }
    if (!dial.wrap) {
      const middle = Math.floor(dial.count / 2) * DETENT;
      // At the fling cap a glide runs about 24 detents: past either end of a stopping dial.
      expect(glide(dial, middle, FLING_CAP)).toMatchObject({ index: dial.count - 1 });
      expect(glide(dial, middle, FLING_CAP).cues.at(-1)).toEqual({ _tag: 'wall' });
      expect(glide(dial, middle, -FLING_CAP)).toMatchObject({ index: 0 });
      expect(glide(dial, middle, -FLING_CAP).cues.at(-1)).toEqual({ _tag: 'wall' });
    }
  });
});

/**
 * The detents a reaction passes between two detents it sees (m7): over
 * every dial of 1 to 12 detents, wrapping and stopping, and every `before`
 * and `now` from three turns below the row to three turns above it.
 */
describe('the detents passed between two detents', () => {
  const every: ReadonlyArray<Detents> = Array.from({ length: 12 }, (_, k) => k + 1).flatMap(
    (count) => [
      { name: 'key', count, wrap: true },
      { name: 'capo', count, wrap: false },
    ],
  );
  const span = (dial: Detents) =>
    Array.from({ length: 6 * dial.count + 1 }, (_, k) => k - 3 * dial.count);

  it('steps one detent at a time toward `now`, each the dial’s own, ending on `now`’s', () => {
    const wrong: Array<string> = [];
    let pairs = 0;
    for (const dial of every)
      for (const before of span(dial))
        for (const now of span(dial)) {
          pairs += 1;
          const way = passed(dial, before, now);
          const step = Math.sign(now - before);
          const holds =
            way.length === Math.abs(now - before) &&
            way.every(
              (at, k) =>
                at === ownDetent(dial, before + step * (k + 1)) &&
                Number.isInteger(at) &&
                at >= 0 &&
                at < dial.count,
            ) &&
            (way.length === 0 || way.at(-1) === ownDetent(dial, now));
          if (!holds) wrong.push(`${dial.count}/${dial.wrap} ${before}→${now}: ${way.join(',')}`);
        }
    expect(wrong).toEqual([]);
    // Every dial's every pair was tried: Σ (6·count + 1)² over 1 to 12, both kinds.
    expect(pairs).toBe(
      2 * Array.from({ length: 12 }, (_, k) => (6 * (k + 1) + 1) ** 2).reduce((a, b) => a + b),
    );
  });
});

it('spaces its detents 52 points apart, card J’s 44 a little bigger (owner, 2026-10-25)', () => {
  expect(DETENT).toBe(52);
  // A fling at the cap still carries the capo from its first fret past its last, to the wall.
  const capo: Detents = { name: 'capo', count: 12, wrap: false };
  expect(glide(capo, 0, FLING_CAP).index).toBe(11);
  expect(tagged(glide(capo, 0, FLING_CAP), 'wall')).toHaveLength(1);
});

it('wraps the key dial past its last key to its first', () => {
  const keys: Detents = { name: 'key', count: 12, wrap: true };
  expect(glide(keys, 11 * DETENT, 0).index).toBe(11);
  expect(glide(keys, 12 * DETENT, 0).index).toBe(0);
  expect(glide(keys, -DETENT, 0).index).toBe(11);
  expect(glide(keys, 11 * DETENT, 500).crossed).toEqual(
    [0, 1, 2, 3, 4, 5].slice(0, glide(keys, 11 * DETENT, 500).crossed.length),
  );
  expect(glide(keys, 11 * DETENT, 500).crossed[0]).toBe(0);
});

/**
 * The part of a move that runs along a dial: over a grid of moves both ways
 * on both axes, a row reads the sideways part and a drum the downward part.
 */
describe('the part of a move along a dial', () => {
  const moves = Array.from({ length: 41 }, (_, k) => (k - 20) * 13.7).concat([0, -0, 1e6, -1e6]);

  it('reads x on a row and y on a drum, whatever the other part is', () => {
    const wrong: Array<string> = [];
    for (const x of moves)
      for (const y of moves) {
        if (along('row', x, y) !== x) wrong.push(`row ${x},${y}`);
        if (along('column', x, y) !== y) wrong.push(`column ${x},${y}`);
      }
    expect(wrong.slice(0, 5)).toEqual([]);
    expect(along('row', 3, -40)).toBe(3);
    expect(along('column', 3, -40)).toBe(-40);
  });
});

/**
 * The ring a wrapping dial draws its stops on: over windows 10 to 1,200
 * points wide and places from a million points below the row to a million
 * above it (whole detents, halves and odd fractions), the slots of the
 * ring's stops, laid from the notch at the window's middle, cover the window
 * side by side, each key the one before it plus one.
 */
describe('the ring of a wrapping dial', () => {
  const keys: Detents = { name: 'key', count: 12, wrap: true };
  const widths = Array.from({ length: 120 }, (_, k) => (k + 1) * 10);
  const places = [-1e6, -123_456.7, -1_248, -1_000, -52, -26, -0.4, 0, 0.4, 25.9, 26, 51.99]
    .flatMap((p) => [p, -p, p + 12 * DETENT * 20])
    .concat(Array.from({ length: 80 }, (_, k) => (k - 40) * 37.3));

  it('covers every window at every place with its keys in order, a detent apart', () => {
    const wrong: Array<string> = [];
    for (const width of widths)
      for (const place of places) {
        const ring = ringOf(keys, width);
        const slots = Array.from({ length: ring / DETENT }, (_, n) => ({
          key: ownDetent(keys, n),
          x: width / 2 - DETENT / 2 + slotOf(n, place, ring),
        }))
          .filter((s) => s.x + DETENT > 0 && s.x < width)
          .sort((a, b) => a.x - b.x);
        const holds =
          (slots[0]?.x ?? 1) <= 1e-6 &&
          (slots.at(-1)?.x ?? -DETENT) + DETENT >= width - 1e-6 &&
          slots.every(
            (s, k) =>
              k === 0 ||
              (Math.abs(s.x - (slots[k - 1]?.x ?? 0) - DETENT) < 1e-6 &&
                s.key === ((slots[k - 1]?.key ?? 0) + 1) % 12),
          );
        if (!holds) wrong.push(`width ${width} place ${place}`);
      }
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it('draws whole turns, the fewest that reach a detent past each side of the window', () => {
    for (const width of widths) {
      const ring = ringOf(keys, width);
      expect(ring % (12 * DETENT)).toBe(0);
      expect(ring).toBeGreaterThanOrEqual(width + 2 * DETENT);
      expect(ring - 12 * DETENT).toBeLessThan(width + 2 * DETENT);
    }
    expect(ringOf(keys, 390)).toBe(12 * DETENT);
    expect(ringOf(keys, 1000)).toBe(24 * DETENT);
  });

  it('puts the stop at the place on the notch, and draws a stopping dial where its row puts it', () => {
    for (const place of places) {
      const ring = ringOf(keys, 390);
      const n = ownDetent(keys, Math.round(place / DETENT));
      expect(Math.abs(slotOf(n, place, ring))).toBeLessThanOrEqual(DETENT / 2 + 1e-6);
    }
    expect(ringOf({ name: 'capo', count: 12, wrap: false }, 390)).toBe(0);
    expect(slotOf(5, 2 * DETENT, 0)).toBe(3 * DETENT);
  });
});
