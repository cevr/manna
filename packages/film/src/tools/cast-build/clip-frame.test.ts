import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { type Puppet, puppetOf } from '../../core/puppet.ts';
import { firstFrameOf, lastFrameOf } from './clip-frame.ts';

const PAPER = [240, 230, 210] as const;

/** A `w` × `h` sheet: a body column standing on row `feet` and a right arm out to its left. */
const figure = (w: number, h: number, feet: number): Puppet => {
  const paint = (inside: (x: number, y: number) => boolean, rgb: readonly number[]) => {
    const rgba = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) if (inside(x, y)) rgba.set([...rgb, 255], (y * w + x) * 4);
    return { width: w, height: h, rgba };
  };
  const mid = Math.round(w / 2);
  return Result.getOrThrow(
    puppetOf(
      {
        width: w,
        height: h,
        parts: [
          {
            name: 'arm',
            pixels: paint(
              (x, y) => x >= mid - 18 && x < mid - 4 && y >= 18 && y < 22,
              [200, 40, 40],
            ),
          },
          {
            name: 'body',
            pixels: paint(
              (x, y) => x >= mid - 4 && x < mid + 4 && y >= 6 && y <= feet,
              [40, 40, 200],
            ),
          },
        ],
      },
      {
        bones: [
          { name: 'lean', pivot: [mid, feet - 2], tip: [mid, 20] },
          { name: 'head', parent: 'lean', pivot: [mid, 20], tip: [mid, 6] },
          { name: 'shoulderRight', parent: 'lean', pivot: [mid - 4, 20], tip: [mid - 11, 20] },
          {
            name: 'elbowRight',
            parent: 'shoulderRight',
            pivot: [mid - 11, 20],
            tip: [mid - 18, 20],
          },
        ],
        skin: { arm: ['shoulderRight', 'elbowRight'], body: ['lean', 'head'] },
      },
    ),
  );
};

const px = (img: { readonly width: number; readonly rgba: Uint8Array }, x: number, y: number) => [
  ...img.rgba.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4),
];

/** The lowest row whose pixel in column `x` is nearer the body's blue than the paper. */
const standsOn = (
  img: { readonly width: number; readonly height: number; readonly rgba: Uint8Array },
  x: number,
) => {
  for (let y = img.height - 1; y >= 0; y--) if (px(img, x, y)[0]! < (40 + PAPER[0]) / 2) return y;
  return -1;
};

describe('clip frames', () => {
  test("a first frame is the view at rest placed as a sample's middle draw, at twice the canvas, on the sheet's paper", () => {
    const p = figure(40, 60, 55);
    const f = firstFrameOf({ puppet: p, paper: PAPER });
    expect([f.img.width, f.img.height]).toEqual([1066, 1356]);
    const scale = +(Math.min(678 / 60, 520 / 40) * 0.91).toFixed(5);
    const bottom = 678 - (678 - 60 * scale) * 0.5;
    expect(f.scale).toBe(scale);
    expect(f.root[0]).toBeCloseTo(533 / 2 + scale * (p.root[0] - 20), 3);
    expect(f.root[1]).toBeCloseTo(bottom + scale * (p.root[1] - 60), 3);
    expect(px(f.img, 0, 0)).toEqual([...PAPER, 255]);
    expect(px(f.img, 1065, 1355)).toEqual([...PAPER, 255]);
    // the body column's centre stands on the canvas's centre line, unblurred
    expect(px(f.img, 533, Math.round(f.feet - 40))).toEqual([40, 40, 200, 255]);
  });

  test("a last frame shares the first frame's scale, root x and feet line, though its sheet is another size and its feet stand higher on it", () => {
    const first = firstFrameOf({ puppet: figure(40, 60, 55), paper: PAPER });
    const last = lastFrameOf(first, { puppet: figure(52, 70, 50), paper: PAPER });
    expect(last.scale).toBe(first.scale);
    expect(last.root[0]).toBe(first.root[0]);
    expect(last.feet).toBe(first.feet);
    // as read off the pixels: both stand on one row, though the last's sheet has more paper under its feet
    expect(Math.abs(standsOn(last.img, 533) - standsOn(first.img, 533))).toBeLessThanOrEqual(1);
    expect(standsOn(first.img, 533)).toBe(first.feet);
  });
});
