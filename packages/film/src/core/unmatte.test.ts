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

  test('clears light paint behind a rim px it un-mattes, and keeps a rim px with ink behind it', () => {
    const front = part();
    const light = part();
    const inked = part();
    for (let y = 0; y < H; y++) inked.set([...INK, 255], (y * W + 3) * 4);
    const [, behind] = unmatte([front, light], W, H, PAPER);
    expect(at(behind!, 3)[3]).toBe(0);
    const [kept, back] = unmatte([front, inked], W, H, PAPER);
    expect(at(kept!, 3)).toEqual(at(front, 3));
    expect(at(back!, 3)).toEqual(at(inked, 3));
  });
});
