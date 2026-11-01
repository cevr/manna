// Film grain is copied out of a pre-drawn sheet at an offset per tick. The
// offset must show each frame pixel the same tile pixel the shifted repeat
// pattern showed (translated by (137, 71) px a tick), stay inside the sheet's
// extra tile, and depend on the tick alone, so a boiled grain still changes
// every tick and any frame draws alone.

import type { Vec2 } from 'math';
import { describe, expect, test } from 'bun:test';
import { Predicate } from 'effect';
import { withDom } from './fixtures/stand-in.ts';
import { grainShift, makeGrain, makePaper } from './paper.ts';

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** The pixels each `putImageData` under `make` put, in call order. */
const putPixels = (make: () => unknown): ReadonlyArray<Uint8ClampedArray> => {
  const put: Array<Uint8ClampedArray> = [];
  withDom(make, {
    onCall: (key, args) => {
      const img = args[0];
      if (key !== 'putImageData' || !Predicate.hasProperty(img, 'data')) return;
      if (img.data instanceof Uint8ClampedArray) put.push(img.data);
    },
  });
  return put;
};

// The noise a paper's mottling and a grain's tiles are made of is kept by
// seed and size, so a second film with the same paper copies it. Each film
// gets its own pixels: a write into one film's put pixels never reaches the
// next film's, and a different seed or size never reads another's noise.
describe('noise kept by seed and size', () => {
  const makers = {
    'grain tiles': (seed: number, size: number) => () => makeGrain(size, 2, seed, 8, 8),
    'paper mottling': (seed: number, size: number) => () =>
      makePaper(size * 8, size * 8, { base: '#f4ecd8', tone: '#8a6a40', seed }),
  };

  test.each(Object.entries(makers))(
    'two films of one seed and size put equal %s that neither shares',
    (_name, maker) => {
      const first = putPixels(maker(48_211, 24));
      const kept = first.map((data) => Uint8ClampedArray.from(data));
      for (const data of first) data.fill(7);
      const second = putPixels(maker(48_211, 24));
      expect(second).toEqual(kept);
      expect(second.length).toBeGreaterThan(0);
      for (const data of second) expect(data.some((v) => v !== 7)).toBe(true);
      expect(putPixels(maker(48_212, 24))[0]).not.toEqual(kept[0]);
      // A smaller film handed the bigger film's noise could not copy it in.
      expect(putPixels(maker(48_211, 23)).map((data) => data.length)).toEqual(
        kept.map(() => 23 * 23 * 4),
      );
    },
  );
});

describe('grainShift', () => {
  test.each([256, 128, 97, 1])(
    'reads the tile pixel the shifted pattern showed, for a %i px tile',
    (size) => {
      const out: Vec2 = [0, 0];
      for (let boil = 0; boil < 300; boil++) {
        grainShift(out, boil, size);
        expect(out[0]).toBeGreaterThanOrEqual(0);
        expect(out[0]).toBeLessThan(size);
        expect(out[1]).toBeGreaterThanOrEqual(0);
        expect(out[1]).toBeLessThan(size);
        for (let x = 0; x < size * 2 + 3; x += 7) {
          // Pattern translated by (tx, ty): frame pixel x shows tile pixel x - tx.
          expect(mod(x + out[0], size)).toBe(mod(x - boil * 137, size));
          expect(mod(x + out[1], size)).toBe(mod(x - boil * 71, size));
        }
      }
    },
  );

  test('moves the grain on every tick of a boiled cycle, from the tick alone', () => {
    const a: Vec2 = [0, 0];
    const b: Vec2 = [0, 0];
    for (let boil = 0; boil < 64; boil++) {
      grainShift(a, boil, 256);
      grainShift(b, boil + 1, 256);
      expect(a).not.toEqual(b);
      expect(grainShift([9, 9], boil, 256)).toEqual(a);
    }
  });
});
