import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import sharp from 'sharp';
import { paintsOf, strayShadeShare } from '../../../library/storybook/sheet.ts';
import { SHEET_CELLS } from './cells.ts';

/** The most of a cell's opaque pixels that may be a stray hair shade (critique 1, item 16; take 5's lead reads 1.25 %, so the bar holds this film's sheets). */
const STRAY_MAX = 0.005;

/** The lead's sheets, by their `<member>/` prefix: one case walks them and one the rest, each run by its own unit-test task (`test:storybook-strays-lead`, `test:storybook-strays`), so each walk stays under its 1 s budget (verifier r2, M4). */
const LEAD = 'lead-feast/';

/** A cell's pixels as the split stored them. */
const rasterOf = (png: string) =>
  Effect.map(
    Effect.promise(() => sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })),
    ({ data, info }) => ({ width: info.width, height: info.height, rgba: new Uint8Array(data) }),
  );

/** How many cells of the act's sheets `keep` admits (by `<member>/<sheet>`), and each whose stray hair shade is over `STRAY_MAX` of its opaque pixels, with its share. */
const straysOver = (keep: (sheet: string) => boolean) =>
  Effect.gen(function* () {
    const cells = [...SHEET_CELLS]
      .filter(([sheet]) => keep(sheet))
      .flatMap(([sheet, s]) =>
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
    return { cells: cells.length, over: over.flat() };
  });

describe("In Its Order's sheet strays", () => {
  it.effect(
    'holds every stray hair shade under 0.5 % of each cell’s opaque pixels, on every sheet but the lead’s (critique 1, items 15 and 16)',
    () =>
      Effect.gen(function* () {
        const { cells, over } = yield* straysOver((sheet) => !sheet.startsWith(LEAD));
        expect(cells).toBeGreaterThan(0);
        expect(over).toEqual([]);
      }),
  );

  it.effect(
    'holds every stray hair shade under 0.5 % of each cell’s opaque pixels, on the lead’s sheets (critique 1, items 15 and 16)',
    () =>
      Effect.gen(function* () {
        const { cells, over } = yield* straysOver((sheet) => sheet.startsWith(LEAD));
        expect(cells).toBeGreaterThan(0);
        expect(over).toEqual([]);
      }),
  );
});
