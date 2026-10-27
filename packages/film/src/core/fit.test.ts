import { describe, expect, test } from 'bun:test';
import { anchorTurns, anchorsOf, chainThrough, fitClosed, flattened } from './fit.ts';

type Pt = readonly [number, number];

const OPTS = { tolerance: 1, reach: 6, corner: (40 * Math.PI) / 180 };

/** A closed line through `corners`, a point every pixel along each side. */
const walked = (corners: ReadonlyArray<Pt>): Pt[] =>
  corners.flatMap((a, i) => {
    const b = corners[(i + 1) % corners.length] ?? a;
    const k = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]));
    return Array.from({ length: k }, (_, j): Pt => [
      a[0] + ((b[0] - a[0]) * j) / k,
      a[1] + ((b[1] - a[1]) * j) / k,
    ]);
  });

/** The farthest any of `pts` lies from the line `line` (its nearest point). */
const farthestFrom = (pts: ReadonlyArray<Pt>, line: ReadonlyArray<Pt>) =>
  Math.max(...pts.map((p) => Math.min(...line.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])))));

describe('a fitted curve', () => {
  test('keeps a shape’s corners as anchors, its sides straight between them', () => {
    // A box with one corner cut at 45°: five corners, each a turn of 45° or 90°.
    const corners: Pt[] = [
      [10, 10],
      [90, 10],
      [90, 50],
      [70, 70],
      [10, 70],
    ];
    const chain = fitClosed(walked(corners), OPTS);
    const anchors = anchorsOf(chain);
    expect(anchors.length).toBe(5);
    for (const c of corners) expect(farthestFrom([c], anchors)).toBeLessThanOrEqual(1);
    // Each anchor a corner: its handles point their own ways.
    for (const t of anchorTurns(chain)) expect(t).toBeGreaterThan((40 * Math.PI) / 180);
    expect(farthestFrom(flattened(chain, 1), walked(corners))).toBeLessThanOrEqual(1.5);
  });

  test('takes a smooth shape with a few anchors, within its tolerance, turning nowhere', () => {
    const circle = Array.from({ length: 250 }, (_, i): Pt => {
      const a = (i / 250) * 2 * Math.PI;
      return [100 + 40 * Math.cos(a), 100 + 40 * Math.sin(a)];
    });
    const chain = fitClosed(circle, OPTS);
    expect(anchorsOf(chain).length).toBeLessThanOrEqual(8);
    for (const t of anchorTurns(chain)) expect(t).toBeLessThan(0.05);
    expect(farthestFrom(flattened(chain, 1), circle)).toBeLessThanOrEqual(1.2);
    expect(farthestFrom(circle, flattened(chain, 1))).toBeLessThanOrEqual(1.2);
  });

  test('draws points as the house’s smooth path draws them', () => {
    const pts: Pt[] = [
      [0, 0],
      [40, 0],
      [40, 30],
      [0, 30],
    ];
    const chain = chainThrough(pts);
    expect(anchorsOf(chain)).toEqual(pts);
    // The handle out of [40, 0]: a sixth of the way from [0, 0] to [40, 30].
    expect(chain[4]).toEqual([40 + 40 / 6, 30 / 6]);
  });
});
