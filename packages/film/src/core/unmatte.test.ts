import { describe, expect, test } from 'bun:test';
import type { Rgb } from './cast-sheet-pixels.ts';
import { unmatte } from './unmatte.ts';

const [W, H] = [16, 8];
const PAPER: Rgb = [250, 240, 220];
const INK: Rgb = [20, 12, 8];
const FILL: Rgb = [240, 230, 205];

/** Each column's colour from 3 on: a 40 % ink mix, a px bluer than the paper, ink (5..6), then a light fill (7..15). */
const COLUMNS: ReadonlyArray<Rgb> = [
  [20 * 0.4 + 250 * 0.6, 12 * 0.4 + 240 * 0.6, 8 * 0.4 + 220 * 0.6].map(
    Math.round,
  ) as unknown as Rgb,
  [250, 244, 236],
  INK,
  INK,
  ...Array.from({ length: W - 7 }, () => FILL),
];

/** A row-banded part: columns 0..2 ground, then `COLUMNS`. */
const part = () => {
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 3; x < W; x++) rgba.set([...COLUMNS[x - 3]!, 255], (y * W + x) * 4);
  return rgba;
};

const at = (r: Uint8Array, x: number, y = 4) => [
  ...r.subarray((y * W + x) * 4, (y * W + x) * 4 + 4),
];
const over = (px: number[]) =>
  [0, 1, 2].map((c) => (px[c]! * px[3]!) / 255 + PAPER[c]! * (1 - px[3]! / 255));

describe('unmatte', () => {
  test("solves a rim px's alpha along the line to the ink, so it is the kept px over the paper within 1", () => {
    const src = part();
    const [out] = unmatte([src], W, H, PAPER);
    const px = at(out!, 3);
    expect(Math.abs(px[3]! - 0.4 * 255)).toBeLessThanOrEqual(2);
    over(px).forEach((v, c) => expect(Math.abs(v - at(src, 3)[c]!)).toBeLessThanOrEqual(1));
  });

  test('drops a rim px the line to the ink does not reach (paper lighter or bluer than the flat paper)', () => {
    const [out] = unmatte([part()], W, H, PAPER);
    expect(at(out!, 4)[3]).toBe(0);
  });

  test('keeps the ink, and the fill inside it, byte for byte', () => {
    const src = part();
    const [out] = unmatte([src], W, H, PAPER);
    for (const x of [5, 6, 7, 10, 15]) expect(at(out!, x)).toEqual(at(src, x));
  });

  test('clears the paint behind a rim px it un-mattes, light or ink, so the rest over the paper is the view', () => {
    const front = part();
    const inked = part();
    for (let y = 0; y < H; y++) inked.set([...INK, 255], (y * W + 3) * 4);
    for (const behind of [part(), inked]) {
      const [out, back] = unmatte([front, behind], W, H, PAPER);
      expect(Math.abs(at(out!, 3)[3]! - 0.4 * 255)).toBeLessThanOrEqual(2);
      expect(at(back!, 3)[3]).toBe(0);
      // the ink past the rim's first ink px, held by both, is kept in both
      expect(at(back!, 6)).toEqual(at(behind, 6));
    }
  });

  test('clears a pocket of paper the box cuts off from the ground at its corners, to its ink', () => {
    // columns 0..2 the sheet's paper on the frame's left border, 3 ink, then fill: no ground anywhere
    const cols: ReadonlyArray<Rgb> = [
      ...Array.from({ length: 3 }, (): Rgb => [250, 244, 236]),
      INK,
      ...Array.from({ length: W - 4 }, () => FILL),
    ];
    const src = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) src.set([...cols[x]!, 255], (y * W + x) * 4);
    const [out] = unmatte([src], W, H, PAPER);
    for (const x of [0, 1, 2]) expect(at(out!, x)[3]).toBe(0);
    for (const x of [3, 4, 10]) expect(at(out!, x)).toEqual(at(src, x));
  });

  test('un-matte keeps paper on a non-corner box edge', () => {
    // a fill to every edge of the box, and on its bottom edge (x 6..9) a highlight of the sheet's paper inked round above and beside it: no ground, and no corner the paper joins
    const src = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const highlight = y === H - 1 && x >= 6 && x < 10;
        const inked = !highlight && x >= 5 && x < 11 && y >= H - 2;
        let c: Rgb = FILL;
        if (inked) c = INK;
        if (highlight) c = [250, 244, 236];
        src.set([...c, 255], (y * W + x) * 4);
      }
    const [out] = unmatte([src], W, H, PAPER);
    for (const x of [6, 7, 8, 9]) expect(at(out!, x, H - 1)).toEqual(at(src, x, H - 1));
    for (const x of [0, 15]) expect(at(out!, x, 0)).toEqual(at(src, x, 0));
  });

  test('clears paper a part holds 6 px deep outside its ink, and still un-mattes the ink edge past it', () => {
    // columns 0..2 ground, 3..8 the sheet's paper (bluer than its flat colour), then the 40 % mix, ink and fill
    const [w, h] = [32, 8];
    const cols: ReadonlyArray<Rgb> = [
      ...Array.from({ length: 6 }, (): Rgb => [250, 244, 236]),
      ...COLUMNS.slice(0, 1),
      ...COLUMNS.slice(2),
    ];
    const src = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 3; x < w; x++)
        src.set([...cols[Math.min(x - 3, cols.length - 1)]!, 255], (y * w + x) * 4);
    const [out] = unmatte([src], w, h, PAPER);
    const px = (x: number) => [...out!.subarray((4 * w + x) * 4, (4 * w + x) * 4 + 4)];
    for (let x = 3; x <= 8; x++) expect(px(x)[3]).toBe(0);
    expect(Math.abs(px(9)[3]! - 0.4 * 255)).toBeLessThanOrEqual(2);
    for (const x of [10, 11, 12, 20])
      expect(px(x)).toEqual([...src.subarray((4 * w + x) * 4, (4 * w + x) * 4 + 4)]);
  });
});
