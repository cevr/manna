// A figure drawn in pixels for the fit rows' tests (`fit-rows.test.ts`,
// `fit-rows.slow.test.ts`): a head (a disc) over a body (a box) inside a
// 3 px line, its body teal on the left of a seam and cream on the right, on
// a sheet's ground or a render's, and what a test adds to it: a move, a
// strip of cream, a hole of the ground, strokes of ink, a hand of skin.
// Every number a row reads is known from the numbers it is drawn with.
// Tests only.

import type { Raster } from '../../raster.ts';

type Rgb = readonly [number, number, number];

export const INK: Rgb = [43, 29, 22];
export const CREAM: Rgb = [253, 225, 188];
export const TEAL: Rgb = [97, 137, 141];
export const SKIN: Rgb = [253, 175, 112];
export const SHEET_GROUND: Rgb = [253, 241, 219];
export const RENDER_GROUND: Rgb = [238, 221, 201];

export const W = 64;
export const H = 96;

/** The figure's body: its left, right, top and bottom columns and rows, its line inside them. */
export const BODY = { left: 18, right: 46, top: 26, bottom: 84 } as const;

/** The column the body's teal gives way to its cream at, unmoved. */
export const SEAM = 32;

/** Whether pixel (`x`, `y`) is of the figure moved `dx` to the right. */
const figure = (x: number, y: number, dx = 0) => {
  const [px, py] = [x - dx, y];
  return (
    (px - 32) ** 2 + (py - 18) ** 2 <= 10 ** 2 ||
    (px >= BODY.left && px <= BODY.right && py >= BODY.top && py <= BODY.bottom)
  );
};

/** A box `[x0, x1) × [y0, y1)`. */
export type Box = readonly [number, number, number, number];

export interface Paint {
  readonly ground: Rgb;
  /** How far right the whole figure is moved. */
  readonly dx?: number;
  /** The column its teal gives way to its cream at (`SEAM` unless given). */
  readonly seam?: number;
  /** A 2 × 12 px strip of cream just outside the body's right line. */
  readonly sliver?: boolean;
  /** Boxes of cream painted over it: strips, attached or not. */
  readonly strips?: ReadonlyArray<Box>;
  /** A 6 px square of the ground inside the body. */
  readonly hole?: boolean;
  /** Rows a line 3 px thick crosses the body from. */
  readonly marks?: ReadonlyArray<number>;
  /** A 6 px square of skin on the body's teal, low on its left: a hand. */
  readonly hand?: boolean;
}

const NEAR: ReadonlyArray<readonly [number, number]> = [
  [3, 0],
  [-3, 0],
  [0, 3],
  [0, -3],
  [2, 2],
  [-2, 2],
  [2, -2],
  [-2, -2],
];

/** A pixel of the figure moved by `dx`: the ground outside it, its line within 3 px of its edge, teal on its body left of `seam`, cream elsewhere. */
const colourAt = (ground: Rgb, x: number, y: number, dx: number, seam: number): Rgb => {
  if (!figure(x, y, dx)) return ground;
  if (NEAR.some(([ox, oy]) => !figure(x + ox, y + oy, dx))) return INK;
  if (y > BODY.top && x - dx < seam) return TEAL;
  return CREAM;
};

/** The box `[x0, x1) × [y0, y1)` of `rgba` filled with `c`. */
const fill = (rgba: Uint8Array, [x0, x1, y0, y1]: Box, c: Rgb) => {
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) rgba.set([c[0], c[1], c[2], 255], (y * W + x) * 4);
};

/** The figure painted on `ground`: its line, its cream and teal papers, and what the paint adds. */
export const paint = ({
  ground,
  dx = 0,
  seam = SEAM,
  sliver = false,
  strips = [],
  hole = false,
  marks = [],
  hand = false,
}: Paint): Raster => {
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) fill(rgba, [x, x + 1, y, y + 1], colourAt(ground, x, y, dx, seam));
  if (sliver) fill(rgba, [47 + dx, 49 + dx, 50, 62], CREAM);
  for (const s of strips) fill(rgba, s, CREAM);
  if (hole) fill(rgba, [26 + dx, 32 + dx, 60, 66], ground);
  for (const m of marks) fill(rgba, [22 + dx, 43 + dx, m, m + 3], INK);
  if (hand) fill(rgba, [24 + dx, 30 + dx, 70, 76], SKIN);
  return { width: W, height: H, rgba };
};
