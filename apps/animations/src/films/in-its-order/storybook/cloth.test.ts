import { Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import sharp from 'sharp';
import type { Raster } from '@manna/film/tools';
import {
  deltaE,
  hexOf,
  medianOf,
  paintsOf,
  rgbOfHex,
  TWIN_PAINT,
} from '../../../library/storybook/sheet.ts';
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

/** Where a cell's speck rows start, as a share of its opaque rows from the first: below her head, her body from the shoulders down. */
const SPECK_ROWS = 0.4;

/** The largest ink island (px, 8-connected) that reads as a speck in a line rather than a line of its own. */
const SPECK_PX = 8;

/** Her ink, by hex. */
const INK = [PALETTES.get('feast-guest-woman')].flatMap((palette) => {
  if (!palette) return [];
  return [hexOf(rgbOfHex(palette.ink))];
});

/** Her ink's channels, read pixel by pixel as the islands are walked. */
const INK_RGB = INK.flatMap((hex) => rgbOfHex(hex));

/** Her cloth's paints, by hex: each garment and sash paint, and each other paint within `TWIN_PAINT` of a garment paint (its twin), as her body-cloth rule reads cloth. */
const CLOTH = [PALETTES.get('feast-guest-woman')].flatMap((palette) => {
  if (!palette) return [];
  const paints = paintsOf(palette);
  const garments = paints.filter((p) => p.role === 'garment');
  return paints.flatMap((p) => {
    const twin = p.role === 'other' && garments.some((g) => deltaE(p.rgb, g.rgb) <= TWIN_PAINT);
    if (p.role !== 'garment' && p.role !== 'sash' && !twin) return [];
    return [hexOf(p.rgb)];
  });
});

/** The hex of a cell's pixel `q`, `clear` where it is transparent. */
const hexAt = (r: Raster, q: number): string => {
  if ((r.rgba[q * 4 + 3] ?? 0) === 0) return 'clear';
  return hexOf([r.rgba[q * 4] ?? 0, r.rgba[q * 4 + 1] ?? 0, r.rgba[q * 4 + 2] ?? 0]);
};

/** The in-cell 8-neighbours of pixel `q`. */
const around8 = (r: Raster, q: number): ReadonlyArray<number> => {
  const [x, y] = [q % r.width, Math.floor(q / r.width)];
  return [-1, 0, 1].flatMap((dy) =>
    [-1, 0, 1].flatMap((dx) => {
      const [u, v] = [x + dx, y + dy];
      if ((dx === 0 && dy === 0) || u < 0 || v < 0 || u >= r.width || v >= r.height) return [];
      return [v * r.width + u];
    }),
  );
};

/** The 8-connected islands of ink in a cell's rows from `top` down, each as its pixels. */
const inkIslandsOf = (r: Raster, top: number): ReadonlyArray<ReadonlyArray<number>> => {
  const [k0, k1, k2] = INK_RGB;
  const ink = (q: number) =>
    q >= top * r.width &&
    (r.rgba[q * 4 + 3] ?? 0) > 0 &&
    r.rgba[q * 4] === k0 &&
    r.rgba[q * 4 + 1] === k1 &&
    r.rgba[q * 4 + 2] === k2;
  const seen = new Uint8Array(r.width * r.height);
  const islands: Array<ReadonlyArray<number>> = [];
  for (let q0 = 0; q0 < seen.length; q0++) {
    if (seen[q0] === 1 || !ink(q0)) continue;
    seen[q0] = 1;
    const [island, stack] = [[q0], [q0]];
    while (stack.length > 0)
      for (const m of around8(r, stack.pop() ?? 0)) {
        if (seen[m] === 1 || !ink(m)) continue;
        seen[m] = 1;
        island.push(m);
        stack.push(m);
      }
    islands.push(island);
  }
  return islands;
};

/** The 8-connected islands of ink of `SPECK_PX` or fewer in a cell's rows below `SPECK_ROWS` of its opaque rows. */
const inkSpecksOf = (r: Raster): number => {
  const opaque = (q: number) => (r.rgba[q * 4 + 3] ?? 0) > 0;
  const all = Array.from({ length: r.width * r.height }, (_, q) => q);
  const [first, last] = [all.find(opaque) ?? 0, all.findLast(opaque) ?? 0].map((q) =>
    Math.floor(q / r.width),
  );
  const top = (first ?? 0) + Math.floor(((last ?? 0) - (first ?? 0) + 1) * SPECK_ROWS);
  return inkIslandsOf(r, top).filter((island) => island.length <= SPECK_PX).length;
};

/** The ink islands of a cell, of any size, whose 8-neighbour rim is all her cloth's paints: ink lying wholly inside her cloth. */
const inkInClothOf = (r: Raster): ReadonlyArray<ReadonlyArray<number>> =>
  inkIslandsOf(r, 0).filter((island) => {
    const inside = new Set(island);
    const rim = island.flatMap((q) => around8(r, q).filter((m) => !inside.has(m)));
    return rim.length > 0 && rim.every((m) => CLOTH.includes(hexAt(r, m)));
  });

describe("In Its Order's guest woman's cloth", () => {
  it.effect(
    'leaves no ink island of any size wholly inside her cloth on any table cell, its 8-neighbour rim all garment, sash or twin paint (art check 4b, fault 1: 23–29 islands of 9–115 px a cell scratched her left fold and sleeve top in cold-ouch)',
    () =>
      Effect.gen(function* () {
        const table = yield* Effect.forEach(Object.entries(TABLE), ([cell, c]) =>
          Effect.map(rasterOf(c.png), (r) => {
            const islands = inkInClothOf(r);
            return [cell, islands.length, islands.reduce((n, i) => n + i.length, 0)] as const;
          }),
        );
        expect(CLOTH.length).toBeGreaterThanOrEqual(3);
        expect(table.filter(([, n]) => n > 0)).toEqual([]);
      }),
  );

  it.effect(
    'leaves no more ink specks in her body on any table cell than her kept sheet’s most, 38: 8-connected ink islands of 8 px or less below .40 of her opaque rows (critique 4, fault 1: 143–159 a cell dotted her olive mantle edges and neckline)',
    () =>
      Effect.gen(function* () {
        const kept = yield* Effect.forEach(Object.values(KEPT), (c) =>
          Effect.map(rasterOf(c.png), inkSpecksOf),
        );
        const most = Math.max(...kept);
        const table = yield* Effect.forEach(Object.entries(TABLE), ([cell, c]) =>
          Effect.map(rasterOf(c.png), (r) => [cell, inkSpecksOf(r)] as const),
        );
        expect(INK).toHaveLength(1);
        expect(most).toBe(38);
        expect(table.filter(([, n]) => n > most)).toEqual([]);
      }),
  );

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
