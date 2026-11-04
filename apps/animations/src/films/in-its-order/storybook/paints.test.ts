import { Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import sharp from 'sharp';
import type { Raster } from '@manna/film/tools';
import { hexOf, paintsOf, strayShadeShare } from '../../../library/storybook/sheet.ts';
import { SHEET_CELLS } from './cells.ts';

/** The most of a cell's opaque pixels that may be a stray hair shade (critique 1, item 16; take 5's lead reads 1.25 %, so the bar holds this film's sheets). */
const STRAY_MAX = 0.005;

/** The most of a head band's hair that may be its hair shade (critique 1, item 4): the table and milk sheets read 0.5 to 8.3 %, the close redrawn from his front 20 % (the curls' shaded undersides, larger in a close), the old close 99.6 % (its base drawn in sandal brown). */
const SHADE_MAX = 0.25;

/** The head band's depth as a share of the cell's head (crown to collar): the top 60 % (critique 1, item 4). */
const BAND = 0.6;

const rasterOf = (png: string) =>
  Effect.map(
    Effect.promise(() => sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })),
    ({ data, info }): Raster => ({
      width: info.width,
      height: info.height,
      rgba: new Uint8Array(data),
    }),
  );

/** Every cell this film draws: its sheet's key, its name, its PNG and head, and its member's paints. */
const CELLS = [...SHEET_CELLS].flatMap(([sheet, s]) =>
  Object.entries(s.cells).map(([cell, c]) => ({
    sheet,
    cell,
    png: c.png,
    head: Option.fromUndefinedOr(c.head),
    paints: paintsOf(s.palette),
  })),
);

/** The hair base and hair shade pixels in a cell's head band, from its first opaque row down `BAND` of its head. */
const headBandOf = (r: Raster, head: number, paints: (typeof CELLS)[number]['paints']) => {
  const tone = new Map(
    paints.flatMap((p) => {
      if (p.role === 'hair') return [[hexOf(p.rgb), p.tone] as const];
      return [];
    }),
  );
  const crown = Math.floor(
    Array.from(r.rgba.keys()).find((i) => i % 4 === 3 && (r.rgba[i] ?? 0) > 0) ?? 0,
  );
  const top = Math.floor(crown / 4 / r.width);
  const counts = { base: 0, shade: 0 };
  for (let y = top; y < Math.min(r.height, top + head * BAND); y++)
    for (let x = 0; x < r.width; x++) {
      const i = (y * r.width + x) * 4;
      if ((r.rgba[i + 3] ?? 0) === 0) continue;
      const t = tone.get(hexOf([r.rgba[i] ?? 0, r.rgba[i + 1] ?? 0, r.rgba[i + 2] ?? 0]));
      if (t === 'base' || t === 'shade') counts[t] += 1;
    }
  return counts;
};

describe("In Its Order's sheet paints", () => {
  it.effect(
    'holds every stray hair shade under 0.5 % of each cell’s opaque pixels (critique 1, items 15 and 16)',
    () =>
      Effect.gen(function* () {
        const over = yield* Effect.forEach(CELLS, (c) =>
          Effect.map(rasterOf(c.png), (r) => {
            const share = strayShadeShare(r, c.paints);
            if (share <= STRAY_MAX) return [];
            return [`${c.sheet} ${c.cell}: ${(share * 100).toFixed(2)} %`];
          }),
        );
        expect(over.flat()).toEqual([]);
      }),
  );

  it.effect(
    'draws each head band’s hair in its hair base: its hair shade at most a quarter of the hair there, so no sandal brown takes the base’s place (critique 1, item 4)',
    () =>
      Effect.gen(function* () {
        const hairy = CELLS.filter(
          (c) => Option.isSome(c.head) && c.paints.some((p) => p.role === 'hair'),
        );
        const misses = yield* Effect.forEach(hairy, (c) =>
          Effect.map(rasterOf(c.png), (r) => {
            const band = headBandOf(
              r,
              Option.getOrElse(c.head, () => 0),
              c.paints,
            );
            const share = band.shade / Math.max(1, band.base + band.shade);
            if (share <= SHADE_MAX) return [];
            return [`${c.sheet} ${c.cell}: hair shade ${(share * 100).toFixed(1)} % of the hair`];
          }),
        );
        expect(misses.flat()).toEqual([]);
      }),
  );
});
