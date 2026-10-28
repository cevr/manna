import { describe, expect, test } from 'bun:test';
import { cutLimb, fitKey, keyInFrame } from './key-cut.ts';
import type { Raster } from './raster.ts';

const PAPER = [250, 246, 238] as const;
const INK = [40, 30, 28] as const;
const SLEEVE = [90, 120, 170] as const;
const BODY = [150, 90, 60] as const;

const paper = (width: number, height: number): Raster => {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.set([...PAPER, 255], i * 4);
  return { width, height, rgba };
};
const fill = (r: Raster, box: readonly [number, number, number, number], c: readonly number[]) => {
  for (let y = box[1]; y < box[3]; y++)
    for (let x = box[0]; x < box[2]; x++) r.rgba.set([...c, 255], (y * r.width + x) * 4);
};
// a body block, and an arm out to its right: a sleeve inked round, on a bone from (20, 20) to (44, 20)
const figure = (r: Raster, at: readonly [number, number]) => {
  const [ox, oy] = at;
  fill(r, [ox + 4, oy + 8, ox + 18, oy + 40], BODY);
  fill(r, [ox + 18, oy + 15, ox + 46, oy + 26], INK);
  fill(r, [ox + 19, oy + 17, ox + 45, oy + 24], SLEEVE);
  return r;
};

describe('a drawn key cut into the sheet frame', () => {
  test('the fit finds the drawing where it lies, and the frame lays it back on the view', () => {
    const view = figure(paper(56, 48), [0, 0]);
    const drawn = figure(paper(70, 60), [9, 6]);
    const fit = fitKey(drawn, view, () => true);
    expect([fit.s, fit.dx, fit.dy]).toEqual([1, 9, 6]);
    expect(fit.error).toBe(0);
    expect(fit.ground).toEqual(PAPER);
    // a frame padded 3 left and 2 above: its pixel (x, y) is the view's (x - 3, y - 2), flat paint read back whole
    const framed = keyInFrame(drawn, fit, [60, 52], [3, 2]);
    const px = (x: number, y: number) => [
      ...framed.rgba.subarray((y * 60 + x) * 4, (y * 60 + x) * 4 + 4),
    ];
    expect([px(33, 22), px(10, 32), px(1, 1)]).toEqual([
      [...SLEEVE, 255],
      [...BODY, 255],
      [...PAPER, 255],
    ]);
  });

  test('the limb is its sleeve and the ink round it, and nothing of the body', () => {
    const r = figure(paper(56, 48), [0, 0]);
    const cut = cutLimb(r, PAPER, {
      root: [20, 20.5],
      elbow: [32, 20.5],
      wrist: [44, 20.5],
      rUpper: 7,
      rFore: 7,
    });
    // from the ink left of the sleeve to the wrist and one pixel past it: the ink beyond, and the body, stay
    expect(cut.at).toEqual([18, 15]);
    expect([cut.raster.width, cut.raster.height]).toEqual([27, 11]);
    const at = (x: number, y: number) => [
      ...cut.raster.rgba.subarray((y * 27 + x) * 4, (y * 27 + x) * 4 + 4),
    ];
    expect(at(10, 5)).toEqual([...SLEEVE, 255]);
    expect(at(10, 0)).toEqual([...INK, 255]);
  });
});
