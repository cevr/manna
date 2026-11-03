import { BunServices } from '@effect/platform-bun';
import { describe, expect, test } from 'bun:test';
import { Effect, FileSystem } from 'effect';
import { it } from 'effect-bun-test';
import sharp from 'sharp';

import type { Pixels } from './field-paint.ts';
import { SOURCE, WIDTHS, nightStills } from './night.ts';
import { hueOf, oklab, turnBetween, withNightSky } from './night-paint.ts';

const WIDTH = 60;
const HEIGHT = 40;

type Colour = readonly [number, number, number];

/** Round 4's sky, its far hills, its field, its moon and a star, as the painting has them. */
const SKY: Colour = [30, 43, 80];
const HILL: Colour = [62, 58, 104];
const FIELD: Colour = [52, 92, 58];
const MOON: Colour = [236, 190, 110];
const STAR: Colour = [250, 240, 205];
/** The brand's night, `#12354e`, written here as the test's own expectation. */
const NIGHT_HUE = hueOf(oklab(0x12, 0x35, 0x4e));

/** A small night: sky, hills from row 20, the field from row 30 (75%), a violet fleck in the field, the moon and a star in the sky. */
const night = (): Pixels => {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y++)
    for (let x = 0; x < WIDTH; x++) {
      let colour = SKY;
      if (y >= 20) colour = HILL;
      if (y >= 30) colour = FIELD;
      if (y >= 34 && x < 4) colour = HILL;
      if (y >= 4 && y < 7 && x >= 50 && x < 53) colour = MOON;
      if (y === 8 && x === 10) colour = STAR;
      data.set([...colour, 255], (y * WIDTH + x) * 4);
    }
  return { width: WIDTH, height: HEIGHT, data };
};

const pixel = (image: Pixels, x: number, y: number): Colour => {
  const at = (y * image.width + x) * 4;
  return [image.data[at] ?? 0, image.data[at + 1] ?? 0, image.data[at + 2] ?? 0];
};

const labOf = ([r, g, b]: Colour) => oklab(r, g, b);

describe('the night’s repaint', () => {
  test('turns the sky and the far hills to the night’s hue, keeping their lightness and chroma', () => {
    const painted = withNightSky(night());
    for (const [x, y] of [
      [5, 5],
      [30, 15],
      [30, 25],
    ] as const) {
      const before = labOf(pixel(night(), x, y));
      const after = labOf(pixel(painted, x, y));
      expect(Math.abs(after.L - before.L)).toBeLessThan(0.01);
      expect(Math.abs(Math.hypot(after.a, after.b) - Math.hypot(before.a, before.b))).toBeLessThan(
        0.01,
      );
    }
    expect(Math.abs(turnBetween(hueOf(labOf(pixel(painted, 5, 5))), NIGHT_HUE))).toBeLessThan(3);
  });

  test('leaves the field, the moon, a star and the field’s own violet shadows as they were', () => {
    const before = night();
    const painted = withNightSky(before);
    for (const [x, y] of [
      [30, 35],
      [51, 5],
      [10, 8],
      [2, 38],
    ] as const)
      expect(pixel(painted, x, y)).toEqual(pixel(before, x, y));
  });

  it.effect(
    'the shipped stills are the step’s output from its source, and a second run writes the same bytes',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const source = yield* fs.readFile(SOURCE);
        const first = yield* nightStills(source);
        const second = yield* nightStills(source);
        expect(second).toEqual(first);
        for (const { width, bytes } of first)
          expect(
            new Uint8Array(yield* fs.readFile(`${import.meta.dir}/../src/art/night-${width}.webp`)),
          ).toEqual(bytes);
        expect(first.map(({ width }) => width)).toEqual([...WIDTHS]);
      }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect(
    'the shipped still keeps the painting’s lightness everywhere, so its moon, stars and land stay where they were',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const read = (bytes: Uint8Array) =>
          Effect.promise(() =>
            sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
          );
        const source = yield* read(yield* fs.readFile(SOURCE));
        const shipped = yield* read(
          yield* fs.readFile(`${import.meta.dir}/../src/art/night-1536.webp`),
        );
        expect([shipped.info.width, shipped.info.height]).toEqual([
          source.info.width,
          source.info.height,
        ]);
        let moved = 0;
        const pixels = source.info.width * source.info.height;
        for (let at = 0; at < pixels * 4; at += 4) {
          const a = oklab(source.data[at] ?? 0, source.data[at + 1] ?? 0, source.data[at + 2] ?? 0);
          const b = oklab(
            shipped.data[at] ?? 0,
            shipped.data[at + 1] ?? 0,
            shipped.data[at + 2] ?? 0,
          );
          moved += Math.abs(a.L - b.L);
        }
        expect(moved / pixels).toBeLessThan(0.01);
      }).pipe(Effect.provide(BunServices.layer)),
  );
});
