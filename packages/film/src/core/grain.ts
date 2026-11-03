import type { Raster } from './raster.ts';

/** A grain read over a mask: its robust and plain std, and how many windows it read. */
interface Grain {
  readonly robust: number;
  readonly plain: number;
  readonly n: number;
}

/** A normal spread's std over its median absolute deviation. */
const MAD_STD = 1.4826;

/** The window's reach about its pixel: 1 for 3 × 3, so a thin painted strip still has windows. */
const REACH = 1;

const OFFSETS = Array.from({ length: (2 * REACH + 1) ** 2 }, (_, k) => [
  (k % (2 * REACH + 1)) - REACH,
  Math.floor(k / (2 * REACH + 1)) - REACH,
]);

const medianOf = (v: ReadonlyArray<number>) => Float64Array.from(v).sort()[v.length >> 1] ?? 0;

/** G less its window's mean at each pixel `at` marks whose whole window `at` marks, in reading order. */
const highPass = (r: Raster, at: Uint8Array): ReadonlyArray<number> => {
  const { width: w, height: h } = r;
  const g = (i: number) => r.rgba[i * 4 + 1] ?? 0;
  const vals: number[] = [];
  const window = OFFSETS.map(([dx = 0, dy = 0]) => dy * w + dx);
  for (let y = REACH; y < h - REACH; y++)
    for (let x = REACH; x < w - REACH; x++) {
      const i = y * w + x;
      if (!window.every((d) => at[i + d] === 1)) continue;
      let sum = 0;
      for (const d of window) sum += g(i + d);
      vals.push(g(i) - sum / window.length);
    }
  return vals;
};

/** The grain of `r` over the pixels `at` marks (1): robust and plain std of its high pass, and its windows. */
export const grainOf = (r: Raster, at: Uint8Array): Grain => {
  const vals = highPass(r, at);
  const n = vals.length;
  const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const mid = medianOf(vals);
  return {
    robust: MAD_STD * medianOf(vals.map((v) => Math.abs(v - mid))),
    plain: Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(1, n)),
    n,
  };
};
