import { describe, expect, test } from 'bun:test';
import { cellDrift } from './dom.ts';

const W = 64;
const H = 36;
const AREA = { x: 0, y: 0, w: W, h: H, cols: 8, rows: 4 };
type Rgb = readonly [number, number, number];

/** `AREA`'s pixels, RGBA, each `paint(x, y)`. */
const raster = (paint: (x: number, y: number) => Rgb) => {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) data.set([...paint(x, y), 255], (y * W + x) * 4);
  return data;
};

const TEAL: Rgb = [76, 126, 146];
const RUST: Rgb = [228, 93, 0];

/** Cell `k`'s two values: its pixels changed past the floor, and its largest change. */
const cell = (drift: ReadonlyArray<number>, k: number) => [drift[2 * k], drift[2 * k + 1]];

describe('cellDrift', () => {
  test('each cell counts its pixels changed past the floor and keeps its largest change; the rest of the grid none', () => {
    const before = raster(() => TEAL);
    const after = raster((x, y) => {
      if (x === 13 && y === 5) return [76, 126, 146 - 40];
      if (x === 12 && y === 6) return [76 + 9, 126, 146];
      if (x === 11 && y === 7) return [76 + 1, 126, 146];
      return TEAL;
    });
    const drift = cellDrift(before, after, AREA, 1);
    expect(drift).toHaveLength(2 * 8 * 4);
    expect(cell(drift, 1)).toEqual([2, 40]);
    expect(drift.filter((d, k) => k !== 2 && k !== 3 && d !== 0)).toEqual([]);
    expect(cell(cellDrift(before, after, AREA, 0), 1)).toEqual([3, 40]);
  });

  test('a one-pixel line that moves within its cell is seen, where a mean of the cell holds', () => {
    const line = (at: number) =>
      raster((x, y) => {
        if (x === at && y < 9) return [0, 0, 0];
        return [255, 255, 255];
      });
    expect(cell(cellDrift(line(9), line(14), AREA, 0), 1)).toEqual([18, 255]);
    expect(cell(cellDrift(line(9), line(9), AREA, 0), 1)).toEqual([0, 0]);
  });

  test('a soft change of a few levels counts each pixel as a sharp one does', () => {
    const soft = cellDrift(
      raster(() => [48, 92, 132]),
      raster(() => [56, 100, 140]),
      AREA,
      0,
    );
    expect(cell(soft, 0)).toEqual([72, 8]);
  });

  test('a hue at one luma keeps its channels apart', () => {
    expect(
      cell(
        cellDrift(
          raster(() => TEAL),
          raster(() => RUST),
          AREA,
          0,
        ),
        0,
      ),
    ).toEqual([72, 152]);
  });
});
