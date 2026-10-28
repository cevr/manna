import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { fitPose } from './pose-fit.ts';
import { type PuppetSheet, puppetOf, rasterOf, restPose } from './puppet.ts';
import type { Raster } from './raster.ts';

const [W, H] = [40, 32];
const PAPER = [240, 232, 216] as const;
const [INK, TEAL, RUST] = [
  [40, 30, 26, 255],
  [60, 120, 140, 255],
  [200, 120, 70, 255],
];

/** A 40 × 32 sleeve about row 16 (x 2..38), 8 px thick: a dark outline, its upper half teal and its forearm rust, as one part. */
const SLEEVE: PuppetSheet = (() => {
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 12; y < 20; y++)
    for (let x = 2; x < 38; x++) {
      const edge = y < 14 || y >= 18 || x < 4 || x >= 36;
      const fill = [RUST, TEAL][Number(x < 20)]!;
      rgba.set([fill, INK][Number(edge)]!, (y * W + x) * 4);
    }
  return { width: W, height: H, parts: [{ name: 'arm', pixels: { width: W, height: H, rgba } }] };
})();

const PUPPET = Result.getOrThrow(
  puppetOf(SLEEVE, {
    bones: [
      { name: 'shoulderRight', pivot: [4, 16], tip: [20, 16] },
      { name: 'elbowRight', parent: 'shoulderRight', pivot: [20, 16], tip: [36, 16] },
    ],
    skin: { arm: ['shoulderRight', 'elbowRight'] },
  }),
);

/** `r` laid over the paper, opaque. */
const overPaper = (r: Raster): Raster => {
  const rgba = new Uint8Array(r.rgba.length);
  for (let i = 0; i < r.rgba.length; i += 4) {
    const a = r.rgba[i + 3]! / 255;
    for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(r.rgba[i + c]! * a + PAPER[c]! * (1 - a));
    rgba[i + 3] = 255;
  }
  return { width: r.width, height: r.height, rgba };
};

describe('the pose fitter', () => {
  test('the fitter recovers known angles, the same twice', () => {
    const want = { shoulderRight: 17.3, elbowRight: -21.6 };
    const rest = restPose(PUPPET);
    const target = overPaper(rasterOf(PUPPET, { ...rest, numbers: want }));
    const bones = ['shoulderRight', 'elbowRight'];
    const fit = fitPose(PUPPET, target, { bones });
    expect(Math.abs(fit.numbers['shoulderRight']! - want.shoulderRight)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(fit.numbers['elbowRight']! - want.elbowRight)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(fit.root[0] - rest.root[0])).toBeLessThanOrEqual(0.5);
    expect(Math.abs(fit.scale - 1)).toBeLessThanOrEqual(0.01);
    expect(fitPose(PUPPET, target, { bones })).toEqual(fit);
  });
});
