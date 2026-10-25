/**
 * A dial's physics over its whole domain: the twelve keys (wrapping), the
 * capo's frets 0 to 11 (stopping) and the text sizes (stopping), each let
 * go from a grid of places along its row, past both ends, at a grid of
 * speeds both ways, from rest to past the fling cap.
 */

import { describe, expect, it } from 'bun:test';

import { SIZES } from '~/reader/reading';

import { DETENT, type Detents, dragTo, FLING_CAP, glide, MOST_FRAMES, ownDetent } from './dial';

const dials: ReadonlyArray<readonly [string, Detents]> = [
  ['the key dial', { count: 12, wrap: true }],
  ['the capo dial', { count: 12, wrap: false }],
  ['the text-size dial', { count: SIZES.length, wrap: false }],
];

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
      expect(rest.cues.filter((cue) => cue === 'detent')).toHaveLength(rest.crossed.length);
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
      const walls = rest.cues.filter((cue) => cue === 'wall');
      expect(walls.length).toBeLessThanOrEqual(1);
      if (dial.wrap) expect(walls).toEqual([]);
      if (walls.length === 1) {
        expect([0, dial.count - 1]).toContain(rest.index);
        expect(rest.cues.at(-1)).toBe('wall');
      }
      if (speed === 0) expect(walls).toEqual([]);
    }
    if (!dial.wrap) {
      const middle = Math.floor(dial.count / 2) * DETENT;
      // At the fling cap a glide runs about 24 detents: past either end of a stopping dial.
      expect(glide(dial, middle, FLING_CAP)).toMatchObject({ index: dial.count - 1 });
      expect(glide(dial, middle, FLING_CAP).cues.at(-1)).toBe('wall');
      expect(glide(dial, middle, -FLING_CAP)).toMatchObject({ index: 0 });
      expect(glide(dial, middle, -FLING_CAP).cues.at(-1)).toBe('wall');
    }
  });
});

it('wraps the key dial past its last key to its first', () => {
  const keys: Detents = { count: 12, wrap: true };
  expect(glide(keys, 11 * DETENT, 0).index).toBe(11);
  expect(glide(keys, 12 * DETENT, 0).index).toBe(0);
  expect(glide(keys, -DETENT, 0).index).toBe(11);
  expect(glide(keys, 11 * DETENT, 500).crossed).toEqual(
    [0, 1, 2, 3, 4, 5].slice(0, glide(keys, 11 * DETENT, 500).crossed.length),
  );
  expect(glide(keys, 11 * DETENT, 500).crossed[0]).toBe(0);
});
