import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { type PoseSpec, limitsOf, sample, sequence } from './pose-sample.ts';
import { type Puppet, puppetOf } from './puppet.ts';

const [W, H] = [40, 60];

/** A 40 × 60 figure: a body column and a right arm out to the left of it, each its own colour. */
const FIGURE: Puppet = (() => {
  const paint = (inside: (x: number, y: number) => boolean, rgb: readonly number[]) => {
    const rgba = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) if (inside(x, y)) rgba.set([...rgb, 255], (y * W + x) * 4);
    return { width: W, height: H, rgba };
  };
  return Result.getOrThrow(
    puppetOf(
      {
        width: W,
        height: H,
        parts: [
          {
            name: 'arm',
            pixels: paint((x, y) => x >= 4 && x < 18 && y >= 18 && y < 22, [200, 40, 40]),
          },
          {
            name: 'body',
            pixels: paint((x, y) => x >= 18 && x < 26 && y >= 6 && y < 56, [40, 40, 200]),
          },
        ],
      },
      {
        bones: [
          { name: 'lean', pivot: [22, 54], tip: [22, 20] },
          { name: 'head', parent: 'lean', pivot: [22, 20], tip: [22, 6] },
          { name: 'shoulderRight', parent: 'lean', pivot: [18, 20], tip: [11, 20] },
          { name: 'elbowRight', parent: 'shoulderRight', pivot: [11, 20], tip: [4, 20] },
        ],
        skin: { arm: ['shoulderRight', 'elbowRight'], body: ['lean', 'head'] },
      },
    ),
  );
})();

const SPEC: PoseSpec = { puppet: FIGURE, paper: [240, 230, 210], size: [64, 64] };

describe('sample', () => {
  test('one seed draws the same pixels and truth every time', () => {
    const a = sample(SPEC, 7);
    const b = sample(SPEC, 7);
    expect(Buffer.from(a.img.rgba).equals(Buffer.from(b.img.rgba))).toBe(true);
    expect(b.truth).toEqual(a.truth);
    expect(sample(SPEC, 8).truth.numbers).not.toEqual(a.truth.numbers);
  });

  test('a sample lies on its own paper, its numbers within the limits, every joint of its bones named', () => {
    const limits = limitsOf(FIGURE);
    const { img, truth } = sample(SPEC, 11);
    expect([img.width, img.height]).toEqual([64, 64]);
    // the top-left corner is paper (opaque, within the jitter of its colour)
    expect(img.rgba[3]).toBe(255);
    for (const [c, v] of truth.paper.entries())
      expect(Math.abs(img.rgba[c]! - v)).toBeLessThanOrEqual(1);
    for (const [bone, n] of Object.entries(truth.numbers)) {
      const [lo, hi] = limits[bone]!;
      expect(n).toBeGreaterThanOrEqual(lo);
      expect(n).toBeLessThanOrEqual(hi);
    }
    expect(Object.keys(truth.joints).toSorted()).toEqual([
      'chin',
      'crown',
      'elbowR',
      'hip',
      'shoulderR',
    ]);
    // the joints of bones this puppet lacks (no neck, no wrists, no left arm)
    expect(truth.masked.toSorted()).toEqual([
      'elbowL',
      'handL',
      'handR',
      'neckBase',
      'shoulderL',
      'wristL',
      'wristR',
    ]);
  });
});

describe('limitsOf', () => {
  test('each range holds the drawn rest and its neighbours, the wrists and head their fixed ranges', () => {
    const limits = limitsOf(FIGURE);
    expect(limits['lean']).toEqual([-8, 8]);
    expect(limits['head']).toEqual([-15, 15]);
    for (const bone of ['shoulderRight', 'elbowRight']) {
      const [lo, hi] = limits[bone]!;
      expect(lo).toBeLessThanOrEqual(-20);
      expect(hi).toBeGreaterThanOrEqual(20);
      expect(lo).toBeGreaterThanOrEqual(-170);
      expect(hi).toBeLessThanOrEqual(170);
    }
  });
});

describe('sequence', () => {
  test('one seed gives the same frames; every frame keeps one place, scale and paper', () => {
    const a = sequence(SPEC, 3, 6);
    const b = sequence(SPEC, 3, 6);
    expect(a.map((f) => f.truth)).toEqual(b.map((f) => f.truth));
    expect(a).toHaveLength(6);
    for (const f of a) {
      expect(f.truth.root).toEqual(a[0]!.truth.root);
      expect(f.truth.paper).toEqual(a[0]!.truth.paper);
    }
  });
});
