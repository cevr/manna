import { describe, expect, test } from 'bun:test';
import type { Rgb } from './cast-sheet-pixels.ts';
import { keyJoin } from './key-join.ts';
import type { Raster } from './raster.ts';

const INK: Rgb = [20, 16, 12];
const SKIN: Rgb = [230, 180, 140];
const SLEEVE: Rgb = [200, 190, 170];

/** A `w` × `h` raster painted by `at`: an RGB, opaque, or `'clear'`. */
const raster = (w: number, h: number, at: (x: number, y: number) => Rgb | 'clear'): Raster => {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = at(x, y);
      if (c !== 'clear') rgba.set([...c, 255], (y * w + x) * 4);
    }
  return { width: w, height: h, rgba };
};
const rgbAt = (r: Raster, x: number, y: number) => {
  const i = (y * r.width + x) * 4;
  return [r.rgba[i], r.rgba[i + 1], r.rgba[i + 2]];
};
const alphaAt = (r: Raster, x: number, y: number) => r.rgba[(y * r.width + x) * 4 + 3];

/** A torso: clear above row 10, its shoulder line inked on rows 10-11, skin below. */
const torsoAt = (_x: number, y: number): Rgb | 'clear' => {
  if (y < 10) return 'clear';
  if (y <= 11) return INK;
  return SKIN;
};
/** A key over it: x 6-13, rows 0-9, its sides inked, its cut end (row 9) its paint. */
const keyAt = (x: number, y: number): Rgb | 'clear' => {
  if (y > 9 || x < 6 || x > 13) return 'clear';
  if (x === 6 || x === 13) return INK;
  return SLEEVE;
};

describe('a swap joins its drawn key to the body', () => {
  const joined = keyJoin(raster(20, 20, torsoAt), raster(20, 20, keyAt), INK, 3);

  test("a drawn key's cut end hides the body's ink under it", () => {
    // under the cut end the torso's line takes the key's paint
    expect(rgbAt(joined, 9, 10)).toEqual([...SLEEVE]);
    expect(rgbAt(joined, 10, 11)).toEqual([...SLEEVE]);
    // beside the key's inked side it takes the key's line: still one line
    expect(rgbAt(joined, 6, 11)).toEqual([...INK]);
    // farther than the line's width from the key the torso's line stands
    expect(rgbAt(joined, 2, 10)).toEqual([...INK]);
    expect(rgbAt(joined, 17, 11)).toEqual([...INK]);
    // the body's paint is not ink, and is kept
    expect(rgbAt(joined, 9, 13)).toEqual([...SKIN]);
    expect(alphaAt(joined, 9, 10)).toBe(255);
  });
});
