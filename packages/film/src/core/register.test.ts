import { describe, expect, test } from 'bun:test';
import type { Raster } from './raster.ts';
import { drawPoint, drawSimilar, fitSimilarity, padInto } from './register.ts';

type Similarity = Parameters<typeof drawSimilar>[3];

/** A 64 × 64 picture of smooth colour waves, no two nearby pixels alike. */
const PICTURE: Raster = (() => {
  const [w, h] = [64, 64];
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      rgba.set(
        [
          128 + 90 * Math.sin(x * 0.31 + y * 0.07),
          128 + 90 * Math.cos(y * 0.27 - x * 0.05),
          128 + 60 * Math.sin((x + y) * 0.19),
          255,
        ].map(Math.round),
        (y * w + x) * 4,
      );
  return { width: w, height: h, rgba };
})();

/** The farthest a view corner of a 24 × 24 view lies between two similarities, pixels. */
const apart = (a: Similarity, b: Similarity) =>
  Math.max(
    ...[
      [0, 0],
      [24, 0],
      [0, 24],
      [24, 24],
    ].map(([x = 0, y = 0]) =>
      // the view corner's picture point under `a`, laid back by `b`
      Math.hypot(((x - a.dx) / a.s) * b.s + b.dx - x, ((y - a.dy) / a.s) * b.s + b.dy - y),
    ),
  );

describe('register', () => {
  test('recovers a known similarity on a synthetic raster within 0.5 px', () => {
    const truth: Similarity = { s: 0.4, dx: 1.2, dy: -1.6 };
    const view = drawSimilar(PICTURE, 24, 24, truth);
    const where = new Uint8Array(24 * 24).fill(1);
    const fit = fitSimilarity(view, PICTURE, where, { s: 0.41, dx: -0.5, dy: 0.4 });
    expect(apart(fit, truth)).toBeLessThan(0.5);
  });

  test('a padded view is laid back over itself by its padding', () => {
    const view = drawSimilar(PICTURE, 20, 30, { s: 0.5, dx: 0, dy: 0 });
    const { picture, fit } = padInto(view, 48, 64, [240, 230, 210]);
    const back = drawSimilar(picture, 20, 30, fit);
    let worst = 0;
    for (let i = 0; i < back.rgba.length; i++)
      if (i % 4 !== 3) worst = Math.max(worst, Math.abs((back.rgba[i] ?? 0) - (view.rgba[i] ?? 0)));
    expect(worst).toBeLessThan(40);
    expect(picture.rgba.subarray(0, 4)).toEqual(new Uint8Array([240, 230, 210, 255]));
  });

  test('a point draw gives each view pixel the one picture pixel under its centre, unaveraged', () => {
    // the picture's every other pixel, each its own colour: the point draw at half scale picks them alone
    const back = drawPoint(PICTURE, 32, 32, { s: 0.5, dx: 0, dy: 0 });
    const at = (r: Raster, x: number, y: number, w: number) =>
      r.rgba.subarray((y * w + x) * 4, (y * w + x) * 4 + 4);
    expect(at(back, 5, 7, 32)).toEqual(at(PICTURE, 11, 15, 64));
    expect(at(back, 31, 0, 32)).toEqual(at(PICTURE, 63, 1, 64));
  });
});
