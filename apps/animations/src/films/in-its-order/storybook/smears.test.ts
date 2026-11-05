import { Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import sharp from 'sharp';
import type { Raster } from '@manna/film/tools';
import { faceBoxOf, paintsOf } from '../../../library/storybook/sheet.ts';
import { SHEET_CELLS } from './cells.ts';

/** The largest 4-connected island of skin shade the eyes' half of a face may hold: a shading under a brow larger than this reads as a smear (critique 3, finding 3: 87 to 111 px on the lead's `wince` and `lift`); his other cells read none over 40. */
const SMEAR_PX = 40;

/** A cell's pixels as the split stored them. */
const rasterOf = Effect.fn('Act1Smears.rasterOf')(function* (png: string) {
  const { data, info } = yield* Effect.promise(() =>
    sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  );
  const raster: Raster = { width: info.width, height: info.height, rgba: new Uint8Array(data) };
  return raster;
});

/** Each pixel of a cell marked 1 where it is a skin shade. */
const shadeMaskOf = (r: Raster, paints: ReturnType<typeof paintsOf>) => {
  const shades = new Set(
    paints
      .filter((p) => p.role === 'skin' && p.tone === 'shade')
      .map((p) => (p.rgb[0] << 16) | (p.rgb[1] << 8) | p.rgb[2]),
  );
  const { width, height, rgba } = r;
  const mask = new Uint8Array(width * height);
  for (let q = 0; q < width * height; q++) {
    if ((rgba[q * 4 + 3] ?? 0) === 0) continue;
    const key = ((rgba[q * 4] ?? 0) << 16) | ((rgba[q * 4 + 1] ?? 0) << 8) | (rgba[q * 4 + 2] ?? 0);
    mask[q] = Number(shades.has(key));
  }
  return mask;
};

/** The 4-connected island of marked pixels from `start`, each marked 2 as it is taken. */
const islandFrom = (mask: Uint8Array, width: number, start: number): ReadonlyArray<number> => {
  mask[start] = 2;
  const stack = [start];
  const island: Array<number> = [];
  while (stack.length > 0) {
    const q = stack.pop() ?? 0;
    island.push(q);
    const x = q % width;
    for (const m of [q - width, q + width, q - 1, q + 1]) {
      if (m < 0 || m >= mask.length || Math.abs((m % width) - x) > 1 || mask[m] !== 1) continue;
      mask[m] = 2;
      stack.push(m);
    }
  }
  return island;
};

/**
 * Each 4-connected island of a skin shade that reaches into the upper half
 * of the cell's face box (its brows and eyes), by its size: none when the
 * cell reads no face.
 */
const browSmearsOf = (r: Raster, paints: ReturnType<typeof paintsOf>) =>
  Option.match(faceBoxOf(r, paints), {
    onNone: () => [],
    onSome: (box) => {
      const mask = shadeMaskOf(r, paints);
      const underBrow = (q: number) => {
        const [x, y] = [q % r.width, Math.floor(q / r.width)];
        return x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height / 2;
      };
      const sizes: Array<number> = [];
      for (let start = 0; start < mask.length; start++) {
        if (mask[start] !== 1) continue;
        const island = islandFrom(mask, r.width, start);
        if (island.some(underBrow)) sizes.push(island.length);
      }
      return sizes;
    },
  });

describe("In Its Order's lead's faces", () => {
  it.effect(
    'draws no island of skin shade over 40 px under a brow on any of the lead’s cells, so no face carries a smear across a cut (critique 3, finding 3)',
    () =>
      Effect.gen(function* () {
        const cells = [...SHEET_CELLS]
          .filter(([sheet]) => sheet.startsWith('lead-feast/'))
          .flatMap(([sheet, s]) =>
            Object.entries(s.cells).map(([cell, c]) => ({
              at: `${sheet} ${cell}`,
              png: c.png,
              paints: paintsOf(s.palette),
            })),
          );
        expect(cells.length).toBeGreaterThan(0);
        const over = yield* Effect.forEach(cells, (c) =>
          Effect.map(rasterOf(c.png), (r) =>
            browSmearsOf(r, c.paints)
              .filter((n) => n > SMEAR_PX)
              .map((n) => `${c.at}: ${n} px`),
          ),
        );
        expect(over.flat()).toEqual([]);
      }),
  );
});
