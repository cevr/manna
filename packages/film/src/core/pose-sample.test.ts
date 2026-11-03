import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { type PoseSpec, sample } from './pose-sample.ts';
import { type Puppet, puppetOf } from './puppet.ts';

const [W, H] = [40, 60];

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
    const { img, truth } = sample(SPEC, 11);
    expect([img.width, img.height]).toEqual([64, 64]);
    expect(img.rgba[3]).toBe(255);
    for (const [c, v] of truth.paper.entries())
      expect(Math.abs(img.rgba[c]! - v)).toBeLessThanOrEqual(1);
    expect(Object.keys(truth.numbers).toSorted()).toEqual([
      'elbowRight',
      'head',
      'lean',
      'shoulderRight',
    ]);
    expect(Object.keys(truth.joints).toSorted()).toEqual([
      'chin',
      'crown',
      'elbowR',
      'hip',
      'shoulderR',
    ]);
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

describe('the limits of a sample', () => {
  test('each range holds the drawn rest and its neighbours, the lean and head their fixed ranges', () => {
    const drawn: Record<string, Array<number>> = {};
    for (let seed = 0; seed < 200; seed++)
      for (const [bone, n] of Object.entries(sample(SPEC, seed).truth.numbers))
        (drawn[bone] ??= []).push(n);
    const range = (bone: string) => [Math.min(...drawn[bone]!), Math.max(...drawn[bone]!)];
    const [leanLo, leanHi] = range('lean');
    expect(leanLo).toBeGreaterThanOrEqual(-8);
    expect(leanLo).toBeLessThan(-7);
    expect(leanHi).toBeLessThanOrEqual(8);
    expect(leanHi).toBeGreaterThan(7);
    const [headLo, headHi] = range('head');
    expect(headLo).toBeGreaterThanOrEqual(-15);
    expect(headLo).toBeLessThan(-14);
    expect(headHi).toBeLessThanOrEqual(15);
    expect(headHi).toBeGreaterThan(14);
    const arms: ReadonlyArray<readonly [string, number, number]> = [
      ['shoulderRight', -116, 34],
      ['elbowRight', -150, 20],
    ];
    for (const [bone, lo, hi] of arms) {
      const [drawnLo, drawnHi] = range(bone);
      expect(drawnLo).toBeGreaterThanOrEqual(lo);
      expect(drawnLo).toBeLessThan(lo + 2);
      expect(drawnHi).toBeLessThanOrEqual(hi);
      expect(drawnHi).toBeGreaterThan(hi - 2);
    }
  });
});
