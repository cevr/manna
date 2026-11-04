import { Effect } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import sharp from 'sharp';
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

/** The whole fixture frame as a region of itself. */
const WHOLE = { x: 0, y: 0, width: WIDTH, height: HEIGHT };

/** The film's grain as `in-its-order/film.ts` declares it: its paper's seed 1844 and the finish's defaults. */
const GRAIN = grainOf({
  paper: { seed: 1844 },
  finish: { grain: 0.03, grainSize: 256, grainTiles: 6 },
});

/** A frame time whose boil tick reads a tile other than the first, with a shift on both axes. */
const T = 10.45;

/**
 * Where the engine fixture lies in cold-ouch's frame 680 (film second
 * 22.6667, boil tick 272: tile 2 of 6, shifted 112, 144): the lead's dark
 * hair, his face and the yellow light behind him.
 */
const CROP = { x: 832, y: 576, width: 48, height: 32 };

/** The film second of the engine fixture: frame 680 at 30 fps. */
const CROP_T = 680 / 30;

/** A fixture's pixels, three bytes each. */
const rgbOf = (name: string) =>
  Effect.promise(() =>
    sharp(`${import.meta.dir}/fixtures/${name}`)
      .removeAlpha()
      .raw()
      .toBuffer(),
  );

// oxlint-disable-next-line effect/noAsyncFunction -- read once at module evaluation, so no case pays the read inside its time limit (film/no-lazy-test-fixture)
const [engine, verified] = await Effect.runPromise(
  Effect.all([rgbOf('grain-film.png'), rgbOf('grain-verify.png')]),
);

/** The largest difference between two pictures' channels, in levels. */
const furthest = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
  let most = 0;
  for (let i = 0; i < a.length; i++) most = Math.max(most, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
  return most;
};

describe('the parity of a film frame against its verify frame', () => {
  test('reads the grain from the film’s look, seeded as the page seeds it', () => {
    expect(GRAIN).toEqual({ strength: 0.03, size: 256, tiles: 6, seed: 1943 });
  });

  test('lays the grain the engine’s finish laid: the verify’s crop of cold-ouch with the grain laid at its place and second is the film’s rendered crop within one level, and the bare crop is not (round 1, M2)', () => {
    const laid = grained(verified, CROP, GRAIN, CROP_T);
    expect([engine.length, furthest(laid, engine), furthest(verified, engine) > 1]).toEqual([
      CROP.width * CROP.height * 3,
      1,
      true,
    ]);
    expect(parity(engine, laid, CROP.width, CROP.height, [])).toBe(1);
  });

  test('a figure 2 px off in the film drops the parity below the bar, grain and all', () => {
    const film = grained(frameWith(22), WHOLE, GRAIN, T);
    const verify = grained(frameWith(20), WHOLE, GRAIN, T);
    expect(parity(film, verify, WIDTH, HEIGHT, [])).toBeLessThan(PARITY);
  });

  test('a box the film draws over is left out of the share', () => {
    const film = grained(frameWith(22), WHOLE, GRAIN, T);
    const verify = grained(frameWith(20), WHOLE, GRAIN, T);
    expect(parity(film, verify, WIDTH, HEIGHT, [{ x: 18, y: 12, width: 16, height: 24 }])).toBe(1);
  });
});
