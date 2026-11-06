import { labOf } from '@manna/film/core';
import type { Raster } from '@manna/film/tools';
import { PARENTS, type RigPart } from './channels.ts';

type Pt = readonly [number, number];
type Rgb = readonly [number, number, number];

/**
 * A part sheet as the rig reads it: its parts front to back (the body, the
 * one still part, last), each its PNG at the sheet's size; where the sheet's
 * top-left lies in the cell's px; and each part's pivot in the cell's px.
 */
export interface RigSheet {
  readonly parts: ReadonlyArray<{ readonly name: RigPart; readonly png: Raster }>;
  readonly at: Pt;
  readonly pivots: Readonly<Record<RigPart, Pt>>;
}

/** The least pixels a colour of the cell is held by to be one of its paints (`cellPaintsOf`). */
const LEAST_PAINT = 40;

/** The alpha from which the body's okra paint is drawn, opaque, as the cell's own pixels are. */
const PAINT_ALPHA = 128;

/** A pixel's alpha in a sheet's PNG at the cell's (`x`, `y`), 0 off the sheet. */
const alphaOn = (sheet: RigSheet, png: Raster, x: number, y: number): number => {
  const [sx, sy] = [x - sheet.at[0], y - sheet.at[1]];
  if (sx < 0 || sy < 0 || sx >= png.width || sy >= png.height) return 0;
  return png.rgba[(sy * png.width + sx) * 4 + 3] ?? 0;
};

/** Each cell pixel's owner, an index into the sheet's parts: the first moving part (front to back) whose PNG holds it, else the body. */
export const ownersOf = (sheet: RigSheet, width: number, height: number): Uint8Array => {
  const body = sheet.parts.length - 1;
  const moving = sheet.parts.slice(0, body);
  return Uint8Array.from({ length: width * height }, (_, i) => {
    const [x, y] = [i % width, Math.floor(i / width)];
    const k = moving.findIndex((p) => alphaOn(sheet, p.png, x, y) > 0);
    return [k, body][Number(k < 0)] ?? body;
  });
};

/** The cell's own paints: each colour its opaque pixels hold at least `LEAST_PAINT` times, with its Lab. */
export const cellPaintsOf = (
  cell: Raster,
): ReadonlyArray<{ readonly rgb: Rgb; readonly lab: Rgb }> => {
  const counts = new Map<number, number>();
  for (let i = 0; i < cell.width * cell.height; i++) {
    if ((cell.rgba[i * 4 + 3] ?? 0) === 0) continue;
    const c =
      ((cell.rgba[i * 4] ?? 0) << 16) |
      ((cell.rgba[i * 4 + 1] ?? 0) << 8) |
      (cell.rgba[i * 4 + 2] ?? 0);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, n]) => n >= LEAST_PAINT)
    .map(([c]) => {
      const rgb: Rgb = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
      return { rgb, lab: labOf(rgb) };
    });
};

/** The paint of `paints` nearest `rgb` in Lab. */
const snapped = (paints: ReturnType<typeof cellPaintsOf>, rgb: Rgb): Rgb => {
  const lab = labOf(rgb);
  const d = (p: (typeof paints)[number]) =>
    (p.lab[0] - lab[0]) ** 2 + (p.lab[1] - lab[1]) ** 2 + (p.lab[2] - lab[2]) ** 2;
  return paints.reduce((best, p) => [best, p][Number(d(p) < d(best))] ?? best).rgb;
};

/**
 * A drawn key of the cell as the sheet's parts, by name: each moving part
 * the key's own pixels where it owns them, the body the key's own pixels
 * where it owns them and, under every moving part, the okra paint its PNG
 * holds, each pixel snapped to the nearest of the cell's own paints
 * (`cellPaintsOf` of `open`, the open cell), opaque.
 */
export const partsOfKey = (
  sheet: RigSheet,
  key: Raster,
  owners: Uint8Array,
  paints: ReturnType<typeof cellPaintsOf>,
): ReadonlyMap<RigPart, Raster> => {
  const body = sheet.parts.length - 1;
  const bodyPng = sheet.parts[body]?.png ?? key;
  return new Map(
    sheet.parts.map(({ name }, k) => {
      const rgba = new Uint8Array(key.rgba.length);
      for (let i = 0; i < owners.length; i++) {
        if (owners[i] === k) {
          rgba.set(key.rgba.subarray(i * 4, i * 4 + 4), i * 4);
          continue;
        }
        const [x, y] = [i % key.width, Math.floor(i / key.width)];
        if (k !== body || alphaOn(sheet, bodyPng, x, y) < PAINT_ALPHA) continue;
        const s = ((y - sheet.at[1]) * bodyPng.width + (x - sheet.at[0])) * 4;
        const rgb: Rgb = [bodyPng.rgba[s] ?? 0, bodyPng.rgba[s + 1] ?? 0, bodyPng.rgba[s + 2] ?? 0];
        rgba.set([...snapped(paints, rgb), 255], i * 4);
      }
      return [name, { width: key.width, height: key.height, rgba }] as const;
    }),
  );
};

/** A part's chain of poses, its root's first and itself last. */
export const chainOf = (part: RigPart): ReadonlyArray<RigPart> => {
  const parent = PARENTS[part];
  if (parent === 'none') return [part];
  return [...chainOf(parent), part];
};
