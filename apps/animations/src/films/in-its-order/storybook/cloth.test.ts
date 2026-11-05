import { Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import sharp from 'sharp';
import type { Raster } from '@manna/film/tools';
import { hexOf, medianOf, paintsOf } from '../../../library/storybook/sheet.ts';
import { CELLS as KEPT } from '../../../library/cast/feast-guest-woman/shot-sheets/feast-courtyard/cells.ts';
import { CELLS as TABLE } from '../../../library/cast/feast-guest-woman/shot-sheets/iio-table/cells.ts';
import { PALETTES } from './palettes.ts';

/** Her mantle rows, as shares of a cell's rows: her mantle and sash from the shoulders to the knees (critique 3, finding 4). */
const MANTLE_ROWS = [0.5, 0.75] as const;

/** How far (points of the rows' opaque pixels) a paint's share in her mantle rows may lie from her kept sheet's median. */
const CLOTH_SPREAD = 0.02;

/** The share of her opaque rows, from the lowest, that holds her sandals and the contact shadow under them, seated: below her robe's hem. */
const FEET = 0.25;

/** A cell's pixels as the split stored them. */
const rasterOf = Effect.fn('Act1Cloth.rasterOf')(function* (png: string) {
  const { data, info } = yield* Effect.promise(() =>
    sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  );
  const raster: Raster = { width: info.width, height: info.height, rgba: new Uint8Array(data) };
  return raster;
});

/** Each paint's share of the opaque pixels in `rows` (shares of the cell's height), by hex. */
const sharesIn = (r: Raster, rows: readonly [number, number]): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>();
  let opaque = 0;
  for (let y = Math.round(r.height * rows[0]); y < Math.round(r.height * rows[1]); y++)
    for (let x = 0; x < r.width; x++) {
      const i = (y * r.width + x) * 4;
      if ((r.rgba[i + 3] ?? 0) === 0) continue;
      opaque++;
      const hex = hexOf([r.rgba[i] ?? 0, r.rgba[i + 1] ?? 0, r.rgba[i + 2] ?? 0]);
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
  return new Map([...counts].map(([hex, n]) => [hex, n / Math.max(1, opaque)]));
};

/** The pixels of `hex` from `from` rows under a cell's first opaque row (her head, crown to collar) down to her feet (`FEET` of its opaque rows from the lowest). */
const aboveFeet = (r: Raster, hex: string, from: number): number => {
  const rows = Array.from({ length: r.height }, (_, y) => y).filter((y) =>
    Array.from({ length: r.width }, (_, x) => r.rgba[(y * r.width + x) * 4 + 3] ?? 0).some(
      (a) => a > 0,
    ),
  );
  const [first = 0, last = 0] = [rows[0], rows.at(-1)];
  const top = last - Math.ceil((last - first + 1) * FEET);
  let n = 0;
  for (let y = first + from; y < top; y++)
    for (let x = 0; x < r.width; x++) {
      const i = (y * r.width + x) * 4;
      if ((r.rgba[i + 3] ?? 0) === 0) continue;
      if (hexOf([r.rgba[i] ?? 0, r.rgba[i + 1] ?? 0, r.rgba[i + 2] ?? 0]) === hex) n++;
    }
  return n;
};

/** The guest woman's paints that belong at her feet only: her sandals' and the contact shadow's. */
const FEET_PAINTS = [PALETTES.get('feast-guest-woman')]
  .flatMap((palette) => {
    if (!palette) return [];
    return paintsOf(palette);
  })
  .flatMap((p) => {
    if (p.role !== 'footwear' && p.part !== 'contact shadow') return [];
    return [hexOf(p.rgb)];
  });

describe("In Its Order's guest woman's cloth", () => {
  it.effect(
    'paints her mantle rows on her table sheet as her kept sheet does, each paint’s share within 2 points of its median there, and her sandals’ and the contact shadow’s paints nowhere between her head and her feet (critique 3, finding 4: her neckline, mantle and sash edges took the sandals’ brown, her sash the contact shadow’s lavender)',
    () =>
      Effect.gen(function* () {
        const kept = yield* Effect.forEach(Object.values(KEPT), (c) =>
          Effect.map(rasterOf(c.png), (r) => sharesIn(r, MANTLE_ROWS)),
        );
        const table = yield* Effect.forEach(Object.entries(TABLE), ([cell, c]) =>
          Effect.map(rasterOf(c.png), (r) => ({
            cell,
            shares: sharesIn(r, MANTLE_ROWS),
            feet: FEET_PAINTS.map((hex) => [hex, aboveFeet(r, hex, c.head)] as const),
          })),
        );
        const paints = new Set(
          [...kept, ...table.map((t) => t.shares)].flatMap((m) => [...m.keys()]),
        );
        const misses = table.flatMap((t) =>
          [...paints].flatMap((hex) => {
            const reference = medianOf(kept.map((m) => m.get(hex) ?? 0));
            const share = t.shares.get(hex) ?? 0;
            if (Option.isNone(reference) || Math.abs(share - reference.value) <= CLOTH_SPREAD)
              return [];
            return [
              `${t.cell}: ${hex} ${(share * 100).toFixed(2)} % against ${(reference.value * 100).toFixed(2)} %`,
            ];
          }),
        );
        expect({
          misses,
          feet: table.flatMap((t) =>
            t.feet.flatMap(([hex, n]) => {
              if (n === 0) return [];
              return [`${t.cell}: ${hex} ${n} px`];
            }),
          ),
        }).toEqual({ misses: [], feet: [] });
        expect(FEET_PAINTS).toHaveLength(2);
      }),
  );
});
