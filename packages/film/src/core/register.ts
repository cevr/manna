import type { Raster } from './raster.ts';
import { stretchRaster } from './raster.ts';

interface Similarity {
  readonly s: number;
  readonly dx: number;
  readonly dy: number;
}

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

const addTotal = (p: Summed, x: number, y: number, sign: number, out: Float64Array) => {
  const cx = Math.max(0, Math.min(p.w, x));
  const cy = Math.max(0, Math.min(p.h, y));
  const x0 = Math.min(p.w - 1, Math.floor(cx));
  const y0 = Math.min(p.h - 1, Math.floor(cy));
  const fx = cx - x0;
  const fy = cy - y0;
  const W = p.w + 1;
  const a = (y0 * W + x0) * 3;
  const b = ((y0 + 1) * W + x0) * 3;
  const wa = (1 - fx) * (1 - fy);
  const wb = fx * (1 - fy);
  const wc = (1 - fx) * fy;
  const wd = fx * fy;
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

const colourInto = (
  p: Summed,
  width: number,
  fit: Similarity,
  i: number,
  out: Float64Array,
): void => {
  const x = i % width;
  const y = Math.floor(i / width);
  const x0 = Math.min(p.w - 1, Math.max(0, (x - fit.dx) / fit.s));
  const x1 = Math.max(1, Math.min(p.w, (x + 1 - fit.dx) / fit.s));
  const y0 = Math.min(p.h - 1, Math.max(0, (y - fit.dy) / fit.s));
  const y1 = Math.max(1, Math.min(p.h, (y + 1 - fit.dy) / fit.s));
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  addTotal(p, x1, y1, 1, out);
  addTotal(p, x0, y1, -1, out);
  addTotal(p, x1, y0, -1, out);
  addTotal(p, x0, y0, 1, out);
  const area = (x1 - x0) * (y1 - y0);
  out[0] = (out[0] ?? 0) / area;
  out[1] = (out[1] ?? 0) / area;
  out[2] = (out[2] ?? 0) / area;
};

const drawSummed = (p: Summed, width: number, height: number, fit: Similarity): Raster => {
  const rgba = new Uint8Array(width * height * 4);
  const rgb = new Float64Array(3);
  for (let i = 0; i < width * height; i++) {
    colourInto(p, width, fit, i, rgb);
    rgba[i * 4] = Math.round(rgb[0] ?? 0);
    rgba[i * 4 + 1] = Math.round(rgb[1] ?? 0);
    rgba[i * 4 + 2] = Math.round(rgb[2] ?? 0);
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, rgba };
};

export const drawSimilar = (
  picture: Raster,
  width: number,
  height: number,
  fit: Similarity,
): Raster => drawSummed(summedOf(picture), width, height, fit);

export const drawPoint = (
  picture: Raster,
  width: number,
  height: number,
  fit: Similarity,
): Raster => {
  const rgba = new Uint8Array(width * height * 4);
  const [pw, ph] = [picture.width, picture.height];
  for (let i = 0; i < width * height; i++) {
    const [x, y] = [i % width, Math.floor(i / width)];
    const u = Math.min(pw - 1, Math.max(0, Math.floor((x + 0.5 - fit.dx) / fit.s)));
    const v = Math.min(ph - 1, Math.max(0, Math.floor((y + 0.5 - fit.dy) / fit.s)));
    rgba.set(picture.rgba.subarray((v * pw + u) * 4, (v * pw + u) * 4 + 3), i * 4);
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, rgba };
};

const SHIFT_STEP = 4;
const SCALE_STEP = 0.02;
const LEAST_STEP = 1 / 32;

interface SimilarityFit extends Similarity {
  readonly score: number;
}

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
  const v = view.rgba;
  const score = (f: Similarity) => {
    let s = 0;
    for (let k = 0; k < at.length; k++) {
      const i = at[k] ?? 0;
      colourInto(p, W, f, i, rgb);
      s += Math.abs((rgb[0] ?? 0) - (v[i * 4] ?? 0));
      s += Math.abs((rgb[1] ?? 0) - (v[i * 4 + 1] ?? 0));
      s += Math.abs((rgb[2] ?? 0) - (v[i * 4 + 2] ?? 0));
    }
    return s / Math.max(1, at.length);
  };
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
  const f = (big.width / view.width + big.height / view.height) / 2;
  return { picture: { width, height, rgba }, fit: { s: 1 / f, dx: -ox / f, dy: -oy / f } };
};
