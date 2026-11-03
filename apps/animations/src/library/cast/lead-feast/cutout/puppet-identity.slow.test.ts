import { expect, it } from 'effect-bun-test';
import { rasterOf } from '@manna/film/core';
import { Effect } from 'effect';
import { puppetFor } from './puppet.ts';

// The real paint belongs to animations. This public-consumer guard keeps the
// film package independent of the cast while checking the recorded rasters.
it.effect('the lead without limbs stays byte-identical at four recorded poses', () =>
  Effect.gen(function* () {
    const puppet = yield* puppetFor('single-9');
    const without = { ...puppet, parts: puppet.parts.map(({ limb: _limb, ...part }) => part) };
    const cases = [
      [0, 0, 1, '1fcd4735178ab6af'],
      [45, -38, 1, '265c13302cdafd99'],
      [90, 0, 0.5, 'ef3fe38cb1c91e86'],
      [-30, 20, 1, 'fa51a60ad398d97f'],
    ] as const;
    for (const [elbow, wrist, scale, expected] of cases) {
      const raster = rasterOf(without, {
        numbers: {
          elbowRight: elbow,
          wristRight: wrist,
          shoulderRight: elbow / 3,
          elbowLeft: -elbow,
        },
        root: puppet.root,
        scale,
      });
      expect(new Bun.CryptoHasher('sha256').update(raster.rgba).digest('hex').slice(0, 16)).toBe(
        expected,
      );
    }
  }),
);
