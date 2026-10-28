// A picture drawn into a view's pixels by one similarity (a uniform scale and
// a shift), and that similarity fitted on colour: the move that lays a
// picture made from the view (okra's repaint of a padded copy of it) back
// over the view, found where the picture should still show the view's own
// pixels. A view point X is the picture's point (X - d) / s, both in pixel
// corners; each view pixel takes the picture's mean over its footprint, read
// exactly from the picture's summed areas. The fit is a coordinate descent
// from a start (the padding's own move), each step halved when no move
// lowers the mean RGB distance over the pixels asked, until a shift step is
// under a 32nd of a pixel; a scale step turns about those pixels' middle, so
// that it does not shift them. Pure and deterministic.

import type { Raster } from './raster.ts';
import { stretchRaster } from './raster.ts';

/** A view point X is the picture's point (X - (dx, dy)) / s. */
interface Similarity {
  readonly s: number;
  readonly dx: number;
  readonly dy: number;
}

/** A picture's summed areas: (w + 1) × (h + 1) totals of red, green and blue (three a corner) from the top-left corner. */
interface Summed {
  readonly w: number;
  readonly h: number;
  readonly sums: Float64Array;
}

const summedOf = (r: Raster): Summed => {
  const [w, h] = [r.width, r.height];
  const W = w + 1;
  const sums = new Float64Array(W * (h + 1) * 3);
  for (let c = 0; c < 3; c++)
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        row += r.rgba[(y * w + x) * 4 + c] ?? 0;
        sums[((y + 1) * W + x + 1) * 3 + c] = (sums[(y * W + x + 1) * 3 + c] ?? 0) + row;
      }
    }
  return { w, h, sums };
};

/**
 * Adds `sign` times the totals from the corner to point (x, y), held inside
 * the picture, into `out` (red, green, blue): bilinear between the four
 * corner totals, exact for pixels of one colour each.
 */
const addTotal = (p: Summed, x: number, y: number, sign: number, out: Float64Array) => {
  const cx = Math.max(0, Math.min(p.w, x));
  const cy = Math.max(0, Math.min(p.h, y));
  const [x0, y0] = [Math.min(p.w - 1, Math.floor(cx)), Math.min(p.h - 1, Math.floor(cy))];
  const [fx, fy] = [cx - x0, cy - y0];
  const W = p.w + 1;
  const [a, b] = [(y0 * W + x0) * 3, ((y0 + 1) * W + x0) * 3];
  const [wa, wb, wc, wd] = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
  const t = p.sums;
  for (let c = 0; c < 3; c++)
    out[c] =
      (out[c] ?? 0) +
      sign *
        ((t[a + c] ?? 0) * wa +
          (t[a + 3 + c] ?? 0) * wb +
          (t[b + c] ?? 0) * wc +
          (t[b + 3 + c] ?? 0) * wd);
};

/** View pixel `i`'s colour under `fit` into `out` (red, green, blue): the picture's mean over the pixel's footprint, a footprint past the picture's edge keeping at least its edge's last pixel. */
const colourInto = (
  p: Summed,
  width: number,
  fit: Similarity,
  i: number,
  out: Float64Array,
): void => {
  const [x, y] = [i % width, Math.floor(i / width)];
  const [u0, v0] = [(x - fit.dx) / fit.s, (y - fit.dy) / fit.s];
  const [u1, v1] = [(x + 1 - fit.dx) / fit.s, (y + 1 - fit.dy) / fit.s];
  const [x0, x1] = [Math.min(p.w - 1, Math.max(0, u0)), Math.max(1, Math.min(p.w, u1))];
  const [y0, y1] = [Math.min(p.h - 1, Math.max(0, v0)), Math.max(1, Math.min(p.h, v1))];
  out.fill(0);
  addTotal(p, x1, y1, 1, out);
  addTotal(p, x0, y1, -1, out);
  addTotal(p, x1, y0, -1, out);
  addTotal(p, x0, y0, 1, out);
  const area = (x1 - x0) * (y1 - y0);
  for (let c = 0; c < 3; c++) out[c] = (out[c] ?? 0) / area;
};

const drawSummed = (p: Summed, width: number, height: number, fit: Similarity): Raster => {
  const rgba = new Uint8Array(width * height * 4);
  const rgb = new Float64Array(3);
  for (let i = 0; i < width * height; i++) {
    colourInto(p, width, fit, i, rgb);
    rgba.set(
      [Math.round(rgb[0] ?? 0), Math.round(rgb[1] ?? 0), Math.round(rgb[2] ?? 0), 255],
      i * 4,
    );
  }
  return { width, height, rgba };
};

/** `picture` drawn into a `width` × `height` view by `fit`, opaque: each pixel the picture's mean over its footprint. */
export const drawSimilar = (
  picture: Raster,
  width: number,
  height: number,
  fit: Similarity,
): Raster => drawSummed(summedOf(picture), width, height, fit);

/** The most a fit's shift step starts at, pixels, and its scale step, a part of the scale. */
const SHIFT_STEP = 4;
const SCALE_STEP = 0.02;
/** The fit stops once a shift step is under this, pixels. */
const LEAST_STEP = 1 / 32;

/** A similarity fitted, and its score: the mean RGB distance (0-765) over the pixels asked. */
interface SimilarityFit extends Similarity {
  readonly score: number;
}

/**
 * The similarity, near `start`, that draws `picture` closest to `view` in
 * colour over the pixels `where` marks (1): a coordinate descent with
 * halving steps on the scale and the shift, the scale turned about the
 * marked pixels' middle. `where` marks the pixels the picture should still
 * show as the view does.
 */
export const fitSimilarity = (
  view: Raster,
  picture: Raster,
  where: Uint8Array,
  start: Similarity,
): SimilarityFit => {
  const p = summedOf(picture);
  const W = view.width;
  const at: number[] = [];
  let [mx, my] = [0, 0];
  for (let i = 0; i < where.length; i++)
    if (where[i] === 1) {
      at.push(i);
      mx += (i % W) + 0.5;
      my += Math.floor(i / W) + 0.5;
    }
  const [cx, cy] = [mx / Math.max(1, at.length), my / Math.max(1, at.length)];
  const rgb = new Float64Array(3);
  const score = (f: Similarity) => {
    let s = 0;
    for (const i of at) {
      colourInto(p, W, f, i, rgb);
      for (let c = 0; c < 3; c++) s += Math.abs((rgb[c] ?? 0) - (view.rgba[i * 4 + c] ?? 0));
    }
    return s / Math.max(1, at.length);
  };
  /** `f` scaled by `k` about the marked pixels' middle. */
  const scaled = (f: Similarity, k: number): Similarity => ({
    s: f.s * k,
    dx: cx - (cx - f.dx) * k,
    dy: cy - (cy - f.dy) * k,
  });
  let best: SimilarityFit = { ...start, score: score(start) };
  let [shift, scale] = [SHIFT_STEP, SCALE_STEP];
  while (shift >= LEAST_STEP) {
    const tries: ReadonlyArray<Similarity> = [
      { ...best, dx: best.dx + shift },
      { ...best, dx: best.dx - shift },
      { ...best, dy: best.dy + shift },
      { ...best, dy: best.dy - shift },
      scaled(best, 1 + scale),
      scaled(best, 1 - scale),
    ];
    const next = tries
      .map((f): SimilarityFit => ({ s: f.s, dx: f.dx, dy: f.dy, score: score(f) }))
      .reduce((a, b) => [a, b][Number(b.score < a.score)] ?? a, best);
    if (next === best) [shift, scale] = [shift / 2, scale / 2];
    else best = next;
  }
  return best;
};

/**
 * `view` laid in the middle of a `width` × `height` picture of `ground`,
 * scaled as large as it fits (bilinear), and the similarity that lays the
 * picture back over the view.
 */
export const padInto = (
  view: Raster,
  width: number,
  height: number,
  ground: readonly [number, number, number],
) => {
  const k = Math.min(width / view.width, height / view.height);
  const big = stretchRaster(view, k, k);
  const [ox, oy] = [Math.floor((width - big.width) / 2), Math.floor((height - big.height) / 2)];
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.set([ground[0], ground[1], ground[2], 255], i * 4);
  for (let y = 0; y < big.height; y++)
    rgba.set(
      big.rgba.subarray(y * big.width * 4, (y + 1) * big.width * 4),
      ((oy + y) * width + ox) * 4,
    );
  // the drawn size over the view's: each axis rounds to whole pixels, so the mean of the two
  const f = (big.width / view.width + big.height / view.height) / 2;
  return { picture: { width, height, rgba }, fit: { s: 1 / f, dx: -ox / f, dy: -oy / f } };
};
