import { Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import sharp from 'sharp';
import { linesOf, paintsOf } from '../../../library/storybook/sheet.ts';
import { proportionSamples } from '../../../library/storybook/verify/measures.ts';
import { SHEET_CELLS } from './cells.ts';

/** The proportions bar's most spread of a line across a sheet's cells, as a share of its median crown-to-soles height (`verify/bars.ts`). */
const PROPORTIONS_MAX = 0.04;

/** A cell's pixels as the split stored them. */
const rasterOf = (png: string) =>
  Effect.map(
    Effect.promise(() => sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })),
    ({ data, info }) => ({ width: info.width, height: info.height, rgba: new Uint8Array(data) }),
  );

describe("In Its Order's sheet proportions", () => {
  it.effect(
    'reads each sheet’s soles, hem and sash top within the proportions bar across its stored cells, as the verify does, so no prop drawn near a costume paint, nor a fleck of light cloth, reads as its line (the bottle’s collar as the lead’s sash top, 0.33; critique 1, items 6 and 7)',
    () =>
      Effect.gen(function* () {
        const over = yield* Effect.forEach([...SHEET_CELLS], ([sheet, s]) =>
          Effect.map(
            Effect.forEach(Object.entries(s.cells), ([key, c]) =>
              Effect.map(rasterOf(c.png), (r) => ({ key, lines: linesOf(r, paintsOf(s.palette)) })),
            ),
            (cells) =>
              proportionSamples(sheet, cells, paintsOf(s.palette)).samples.flatMap((sample) => {
                if (Option.getOrElse(sample.value, () => 1) <= PROPORTIONS_MAX) return [];
                return [`${sample.at}: ${Option.getOrElse(sample.value, () => Number.NaN)}`];
              }),
          ),
        );
        expect(over.flat()).toEqual([]);
      }),
  );
});
