// How a drawn key joins the body it stands in: the rule of a swap's
// compositing, read by the GL ink pass (`canvas/puppet-gl.ts`, which takes
// these constants into its shader).
//
// The cut end: where the key's cut end lies over a body part's outline, the
// body's ink under it is hidden. A body pixel the key does not cover, whose
// colour is the line's ink, and which stands within the line's width of the
// key's coverage takes the colour of the key's nearest covered pixel. Along
// the key's inked side that pixel is the key's own line, so the line stays
// one line; at its cut end it is the key's paint, so the torso's shoulder
// line and side contour under the drawing go.

import type { Rgb } from './cast-sheet-pixels.ts';
import type { Raster } from './raster.ts';

/** How near the line's ink a body pixel's colour stands (RGB distance, 0-255 a channel) for it to be read as ink. */
export const KEY_JOIN_INK = 96;

/** Whether `rgb` (0-255) reads as the line's `ink`. */
export const inkLike = (r: number, g: number, b: number, ink: Rgb) =>
  Math.hypot(r - ink[0], g - ink[1], b - ink[2]) <= KEY_JOIN_INK;

/**
 * `body` (straight RGBA) with its ink hidden under the drawn `key` laid on
 * the same grid: each opaque body pixel the key does not cover, ink-like,
 * within `width` px of a covered key pixel takes the nearest one's colour
 * (ties to the lower row, then the lower column, as the GL flood breaks
 * them). Every other pixel is kept byte for byte.
 */
export const keyJoin = (body: Raster, key: Raster, ink: Rgb, width: number): Raster => {
  const { width: W, height: H } = body;
  const rgba = Uint8Array.from(body.rgba);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (body.rgba[i + 3]! < 128 || covers(key, x, y)) continue;
      if (!inkLike(body.rgba[i]!, body.rgba[i + 1]!, body.rgba[i + 2]!, ink)) continue;
      const best = nearestCovered(key, x, y, width);
      if (best >= 0) rgba.set(key.rgba.subarray(best, best + 3), i);
    }
  return { width: W, height: H, rgba };
};

/** Whether `key` covers pixel (`x`, `y`). */
const covers = (key: Raster, x: number, y: number) => key.rgba[(y * key.width + x) * 4 + 3]! >= 128;

/** The RGBA offset of `key`'s covered pixel nearest (`x`, `y`) within `width` px (ties to the lower row, then column), or -1. */
const nearestCovered = (key: Raster, x: number, y: number, width: number) => {
  const r = Math.ceil(width);
  let best = -1;
  let bestD = width * width;
  for (let qy = Math.max(0, y - r); qy <= Math.min(key.height - 1, y + r); qy++)
    for (let qx = Math.max(0, x - r); qx <= Math.min(key.width - 1, x + r); qx++) {
      const d = (qx - x) ** 2 + (qy - y) ** 2;
      if (d < bestD || (d === bestD && best < 0)) {
        if (covers(key, qx, qy)) [best, bestD] = [(qy * key.width + qx) * 4, d];
      }
    }
  return best;
};
