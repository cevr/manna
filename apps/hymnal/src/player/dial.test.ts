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
