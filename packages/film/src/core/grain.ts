// A paper's grain: its green channel less the mean of the 3 × 3 window about
// each pixel, over the pixels whose whole window a mask marks. Its spread is
// read two ways: the plain std, and a robust std from the median absolute
// deviation (× 1.4826, a normal spread's std over its MAD). An edge between
// two flat paints inside the mask puts a few large values in the plain std;
// the robust one reads the grain beside them. Both are given, so a reader
// sees what the edges add (`grain.slow.test.ts` holds both to flat, noisy and
// colour-edge controls).

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

// a typed array sorts numbers natively, with no comparator to call; a high pass has no NaN or -0 to order apart
const medianOf = (v: ReadonlyArray<number>) => Float64Array.from(v).sort()[v.length >> 1] ?? 0;

/** G less its window's mean at each pixel `at` marks whose whole window `at` marks, in reading order. */
const highPass = (r: Raster, at: Uint8Array): ReadonlyArray<number> => {
  const { width: w, height: h } = r;
  const g = (i: number) => r.rgba[i * 4 + 1] ?? 0;
  const vals: number[] = [];
  // each window's pixels as steps from its middle, in the order `OFFSETS` sums them
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
