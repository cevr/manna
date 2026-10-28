// A paper's grain: its green channel less the mean of the 3 × 3 window about
// each pixel, over the pixels whose whole window a mask marks. Its spread is
// read two ways: the plain std, and a robust std from the median absolute
// deviation (× 1.4826, a normal spread's std over its MAD). An edge between
// two flat paints inside the mask puts a few large values in the plain std;
// the robust one reads the grain beside them. Both are given, so a reader
// sees what the edges add (`grain.test.ts` holds both to flat, noisy and
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

const medianOf = (v: ReadonlyArray<number>) => [...v].sort((a, b) => a - b)[v.length >> 1] ?? 0;

/** G less its window's mean at each pixel `at` marks whose whole window `at` marks, in reading order. */
const highPass = (r: Raster, at: Uint8Array): ReadonlyArray<number> => {
  const { width: w, height: h } = r;
  const g = (i: number) => r.rgba[i * 4 + 1] ?? 0;
  const vals: number[] = [];
  for (let y = REACH; y < h - REACH; y++)
    for (let x = REACH; x < w - REACH; x++) {
      const window = OFFSETS.map(([dx = 0, dy = 0]) => (y + dy) * w + x + dx);
      if (!window.every((j) => at[j] === 1)) continue;
      vals.push(g(y * w + x) - window.reduce((a, j) => a + g(j), 0) / window.length);
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
