import { describe, expect, test } from 'effect-bun-test';
import { PARITY, grained, grainOf, parity } from './parity.ts';

/** A small frame: flat paper and one figure, a block of robe. */
const WIDTH = 64;
const HEIGHT = 48;
const PAPER = [236, 224, 200];
const ROBE = [96, 72, 132];

/** The fixture frame with its figure's left edge at `left`, as the verify renders it: no grain. */
const frameWith = (left: number): Uint8ClampedArray => {
  const rgb = new Uint8ClampedArray(WIDTH * HEIGHT * 3);
  for (let y = 0; y < HEIGHT; y++)
    for (let x = 0; x < WIDTH; x++) {
      rgb.set(PAPER, 3 * (y * WIDTH + x));
      if (x >= left && x < left + 10 && y >= 14 && y < 34) rgb.set(ROBE, 3 * (y * WIDTH + x));
    }
  return rgb;
};

/** The film's grain as `in-its-order/film.ts` declares it: its paper's seed 1844 and the finish's defaults. */
const GRAIN = grainOf({
  paper: { seed: 1844 },
  finish: { grain: 0.03, grainSize: 256, grainTiles: 6 },
});

/** A frame time whose boil tick reads a tile other than the first, with a shift on both axes. */
const T = 10.45;

describe('the parity of a film frame against its verify frame', () => {
  test('reads the grain from the film’s look, seeded as the page seeds it', () => {
    expect(GRAIN).toEqual({ strength: 0.03, size: 256, tiles: 6, seed: 1943 });
  });

  test('the film’s frame, its grain laid over, matches the verify frame with the same grain laid: 1.0', () => {
    const verify = frameWith(20);
    const film = grained(verify, WIDTH, HEIGHT, GRAIN, T);
    expect(film).not.toEqual(verify);
    expect(parity(film, grained(verify, WIDTH, HEIGHT, GRAIN, T), WIDTH, HEIGHT, [])).toBe(1);
  });

  test('a figure 2 px off in the film drops the parity below the bar, grain and all', () => {
    const film = grained(frameWith(22), WIDTH, HEIGHT, GRAIN, T);
    const verify = grained(frameWith(20), WIDTH, HEIGHT, GRAIN, T);
    expect(parity(film, verify, WIDTH, HEIGHT, [])).toBeLessThan(PARITY);
  });

  test('a box the film draws over is left out of the share', () => {
    const film = grained(frameWith(22), WIDTH, HEIGHT, GRAIN, T);
    const verify = grained(frameWith(20), WIDTH, HEIGHT, GRAIN, T);
    expect(parity(film, verify, WIDTH, HEIGHT, [{ x: 18, y: 12, width: 16, height: 24 }])).toBe(1);
  });
});
