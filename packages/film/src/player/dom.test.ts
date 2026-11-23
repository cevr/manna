import { describe, expect, test } from 'bun:test';
import { canvasColours } from './dom.ts';

const W = 64;
const H = 36;
const AREA = { x: 0, y: 0, w: W, h: H, cols: 8, rows: 4 };

/** A stand-in context whose pixels are `paint(x, y)` (RGBA), read back through `getImageData`. */
const painted = (paint: (x: number, y: number) => readonly [number, number, number]) => {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [r, g, b] = paint(x, y);
      data.set([r, g, b, 255], (y * W + x) * 4);
    }
  const getImageData = (x0: number, y0: number, w: number, h: number) => {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      out.set(data.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + w) * 4), y * w * 4);
    return { data: out, width: w, height: h };
  };
  return { getImageData } as unknown as CanvasRenderingContext2D;
};

const TEAL = [76, 126, 146] as const;
const RUST = [228, 93, 0] as const;

describe('canvasColours', () => {
  test("each cell is the exact mean of its pixels' red, green and blue", () => {
    const cells = canvasColours(
      painted((x) => {
        if (x < 4) return RUST;
        return TEAL;
      }),
      AREA,
    );
    expect(cells).toHaveLength(8 * 4 * 3);
    expect(cells.slice(0, 3)).toEqual([(228 + 76) / 2, (93 + 126) / 2, (0 + 146) / 2]);
    expect(cells.slice(3, 6)).toEqual([...TEAL]);
  });

  test('a one-pixel line is in its cell however a resize would sample it', () => {
    const line = canvasColours(
      painted((x, y) => {
        if (x === 13 && y < 9) return [0, 0, 0];
        return [255, 255, 255];
      }),
      AREA,
    );
    expect(line[3]).toBeCloseTo(255 - 255 / 8);
  });

  test('a hue at one luma keeps its channels apart', () => {
    const [a, b] = [RUST, TEAL].map((c) =>
      canvasColours(
        painted(() => c),
        AREA,
      ),
    );
    expect(Math.abs((a?.[0] ?? 0) - (b?.[0] ?? 0))).toBeGreaterThan(100);
  });
});
