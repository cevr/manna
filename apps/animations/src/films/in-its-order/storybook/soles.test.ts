import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import sharp from 'sharp';
import { paintsOf, soleHairOf } from '../../../library/storybook/sheet.ts';
import { SHEET_CELLS } from './cells.ts';

/** The sheets whose member's palette has no footwear paint, so the split has none to give their soles: the mother's and the diners' sandals keep the hair paint they were drawn nearest (critique 2, item 10; the mother stays as drawn, owner). */
const UNSHOD = [
  'feast-mother/iio-baby',
  'filler-dressed/iio-diner-1',
  'filler-dressed/iio-diner-2',
  'filler-dressed/iio-diner-3',
  'filler-dressed/iio-diner-4',
];

/** A cell's pixels as the split stored them. */
const rasterOf = (png: string) =>
  Effect.map(
    Effect.promise(() => sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })),
    ({ data, info }) => ({ width: info.width, height: info.height, rgba: new Uint8Array(data) }),
  );

describe("In Its Order's sheet soles", () => {
  it.effect(
    'gives no hair paint to any soles’ band of a member with a footwear paint, and names each sheet with none (critique 2, items 10 and 11)',
    () =>
      Effect.gen(function* () {
        const sheets = [...SHEET_CELLS].map(([sheet, s]) => ({
          sheet,
          paints: paintsOf(s.palette),
          cells: Object.entries(s.cells),
        }));
        const unshod = sheets
          .filter((s) => !s.paints.some((p) => p.role === 'footwear'))
          .map((s) => s.sheet);
        const shod = sheets.filter((s) => !unshod.includes(s.sheet));
        const haired = yield* Effect.forEach(
          shod.flatMap((s) => s.cells.map(([cell, c]) => ({ ...s, cell, png: c.png }))),
          (c) =>
            Effect.map(rasterOf(c.png), (r) => {
              const n = soleHairOf(r, c.paints);
              if (n === 0) return [];
              return [`${c.sheet} ${c.cell}: ${n} px`];
            }),
        );
        expect(unshod).toEqual(UNSHOD);
        expect(haired.flat()).toEqual([]);
      }),
  );
});
