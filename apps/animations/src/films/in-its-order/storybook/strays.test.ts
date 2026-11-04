import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import sharp from 'sharp';
import { paintsOf, strayShadeShare } from '../../../library/storybook/sheet.ts';
import { SHEET_CELLS } from './cells.ts';

/** The most of a cell's opaque pixels that may be a stray hair shade (critique 1, item 16; take 5's lead reads 1.25 %, so the bar holds this film's sheets). */
const STRAY_MAX = 0.005;

/** A cell's pixels as the split stored them. */
const rasterOf = (png: string) =>
  Effect.map(
    Effect.promise(() => sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })),
    ({ data, info }) => ({ width: info.width, height: info.height, rgba: new Uint8Array(data) }),
  );

describe("In Its Order's sheet strays", () => {
  it.effect(
    'holds every stray hair shade under 0.5 % of each cell’s opaque pixels (critique 1, items 15 and 16)',
    () =>
      Effect.gen(function* () {
        const cells = [...SHEET_CELLS].flatMap(([sheet, s]) =>
          Object.entries(s.cells).map(([cell, c]) => ({
            at: `${sheet} ${cell}`,
            png: c.png,
            paints: paintsOf(s.palette),
          })),
        );
        const over = yield* Effect.forEach(cells, (c) =>
          Effect.map(rasterOf(c.png), (r) => {
            const share = strayShadeShare(r, c.paints);
            if (share <= STRAY_MAX) return [];
            return [`${c.at}: ${(share * 100).toFixed(2)} %`];
          }),
        );
        expect(over.flat()).toEqual([]);
      }),
  );
});
