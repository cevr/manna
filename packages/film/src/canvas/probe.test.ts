import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';
import {
  type Probe,
  probeFace,
  probeOf,
  probeHand,
  probesFaces,
  probePlate,
  probing,
  quadOnCanvas,
  recordInk,
  recordPlate,
  recordText,
  unprobed,
} from './probe.ts';
import { insidePolygon } from '../core/polygon.ts';
import { rng } from '../core/random.ts';
import type { Point } from '../core/schema.ts';

describe('quadOnCanvas', () => {
  const W = 320;
  const H = 180;
  /** `n` × `n` points across the open square (0, 1)², each at its cell's centre. */
  const grid = (n: number): ReadonlyArray<Point> =>
    Array.from({ length: n * n }, (_, k): Point => [
      ((k % n) + 0.5) / n,
      (Math.floor(k / n) + 0.5) / n,
    ]);
  const fine = grid(48);
  /** A grid dense enough to land in a sliver of a few px², sampled only where the coarse one finds nothing. */
  const sliver = grid(640);

  test('agrees with a brute-force sample over random transforms of a plate', () => {
    const next = rng(20261123);
    const span = (lo: number, hi: number) => lo + (hi - lo) * next();
    const seen = { on: 0, off: 0, boxOnly: 0 };
    const disagree: Array<{ readonly k: number; readonly quad: ReadonlyArray<Point> }> = [];
    for (let k = 0; k < 400; k++) {
      const [w, h] = [span(10, 400), span(10, 400)];
      const turn = span(0, 2 * Math.PI);
      const [sx, sy] = [span(0.05, 3), span(0.05, 3)];
      const skew = span(-1, 1);
      const [ex, ey] = [span(-400, 600), span(-400, 500)];
      const map = ([u, v]: Point): Point => {
        const x = u * w * sx + v * h * skew * sx;
        const y = v * h * sy;
        return [
          Math.cos(turn) * x - Math.sin(turn) * y + ex,
          Math.sin(turn) * x + Math.cos(turn) * y + ey,
        ];
      };
      const quad = (
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ] as const
      ).map((p) => map(p));
      const sampled = (points: ReadonlyArray<Point>) =>
        points.map(map).some(([x, y]) => x > 0 && x < W && y > 0 && y < H) ||
        points.some(([u, v]) => insidePolygon(quad, [u * W, v * H]));
      const fast = quadOnCanvas(quad, W, H);
      const brute = sampled(fine) || (fast && sampled(sliver));
      const boxOn =
        Math.max(...quad.map((p) => p[0])) > 0 &&
        Math.max(...quad.map((p) => p[1])) > 0 &&
        Math.min(...quad.map((p) => p[0])) < W &&
        Math.min(...quad.map((p) => p[1])) < H;
      if (fast) seen.on++;
      if (boxOn && !fast) seen.boxOnly++;
      if (!boxOn) seen.off++;
      if (fast !== brute) disagree.push({ k, quad });
    }
    expect(disagree).toEqual([]);
    expect(seen.on).toBeGreaterThan(60);
    expect(seen.off).toBeGreaterThan(60);
    expect(seen.boxOnly).toBeGreaterThan(20);
  });

  test('a tilted plate past a corner, its box over the canvas, is off it', () => {
    const quad: ReadonlyArray<Point> = [
      [60, -70],
      [-70, 60],
      [-75, 55],
      [55, -75],
    ];
    expect(quadOnCanvas(quad, W, H)).toBe(false);
    expect(
      quadOnCanvas(
        quad.map(([x, y]): Point => [x + 30, y + 30]),
        W,
        H,
      ),
    ).toBe(true);
  });

  test('a plate of no area, or one only touching an edge, is off it', () => {
    expect(
      quadOnCanvas(
        [
          [10, 10],
          [100, 10],
          [100, 10],
          [10, 10],
        ],
        W,
        H,
      ),
    ).toBe(false);
    expect(
      quadOnCanvas(
        [
          [-50, 0],
          [0, 0],
          [0, 50],
          [-50, 50],
        ],
        W,
        H,
      ),
    ).toBe(false);
  });
});

/**
 * A stand-in context (bun has no canvas): attaching and detaching a probe only
 * keys a WeakMap by it, and no draw here touches it.
 */
const context = (): CanvasRenderingContext2D => Schema.decodeSync(Schema.Any)({});

/** A stand-in context the probe can read: an identity transform, full opacity. */
const drawable = (): CanvasRenderingContext2D =>
  Schema.decodeSync(Schema.Any)({
    globalAlpha: 1,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  });

const probe = (): Probe => ({ sink: { texts: [], inks: [] }, scene: 'a', dx: 0, alpha: 1 });

/** A hand's grip as the hand declares it: all hold, or half way from hold to palm. */
const HOLD = { open: 0, hold: 1, point: 0, palm: 0 } as const;
const TURNING = { open: 0, hold: 0.5, point: 0, palm: 0.5 } as const;

const boom = () => {
  throw new Error('the draw failed');
};

describe('probe', () => {
  test('a draw that throws while probed still detaches the probe', () => {
    const ctx = context();
    expect(() => probing(ctx, probe(), boom)).toThrow('the draw failed');
    expect(probeOf(ctx)).toBeUndefined();
  });

  test('a draw that throws inside unprobed puts the probe back', () => {
    const ctx = context();
    const p = probe();
    probing(ctx, p, () => {
      expect(() => unprobed(ctx, boom)).toThrow('the draw failed');
      expect(probeOf(ctx)).toBe(p);
    });
  });

  test('probePlate marks the lines drawn inside it as on its plate, and names it by them', () => {
    const ctx = drawable();
    const p = probe();
    const card: ReadonlyArray<readonly [number, number]> = [
      [-310, -165],
      [310, -165],
      [310, 165],
      [-310, 165],
    ];
    probing(ctx, p, () => {
      probePlate(ctx, card, () => {
        recordText(ctx, probeOf(ctx)!, 'Justify', -150, -120, 300, 70, 1);
        recordText(ctx, probeOf(ctx)!, 'declared righteous', -250, 40, 500, 60, 1);
      });
      recordText(ctx, probeOf(ctx)!, 'elsewhere', 0, 0, 100, 40, 1);
    });
    const [plate, ...lines] = p.sink.texts;
    expect(p.sink.inks.map((i) => i.kind)).toEqual(['plate']);
    expect(plate).toMatchObject({ text: 'Justify / declared righteous', x: -310, w: 620, h: 330 });
    expect(lines.map((l) => [l.text, l.on])).toEqual([
      ['Justify', plate?.order],
      ['declared righteous', plate?.order],
      ['elsewhere', undefined],
    ]);
  });

  test('each record carries the scale of the space it was drawn in', () => {
    const ctx: CanvasRenderingContext2D = Schema.decodeSync(Schema.Any)({
      globalAlpha: 1,
      getTransform: () => ({ a: 0, b: 3, c: -3, d: 0, e: 40, f: 0 }),
    });
    const p = probe();
    recordText(ctx, p, 'turned', 0, 0, 10, 10, 1);
    recordInk(
      ctx,
      p,
      'stroke',
      [
        [0, 0],
        [10, 0],
      ],
      2,
      1,
    );
    expect(p.sink.texts.map((t) => t.scale)).toEqual([3]);
    expect(p.sink.inks.map((m) => [m.scale, m.width])).toEqual([[3, 6]]);
  });

  test('what the caption probe records is tagged as the caption; nothing else is', () => {
    const ctx = drawable();
    const p = probe();
    const voice: Probe = { ...p, caption: true };
    recordText(ctx, p, 'one two three', 0, 0, 100, 40, 1);
    recordPlate(ctx, voice, 0, 900, 400, 60, 0.8);
    recordText(ctx, voice, 'one two three', 0, 900, 400, 60, 0.8);
    expect(p.sink.texts.map((t) => t.caption)).toEqual([undefined, true]);
    expect(p.sink.inks.map((m) => m.caption)).toEqual([true]);
  });

  test('a draw that throws inside probePlate puts the probe back', () => {
    const ctx = drawable();
    const p = probe();
    probing(ctx, p, () => {
      expect(() =>
        probePlate(
          ctx,
          [
            [0, 0],
            [10, 10],
          ],
          boom,
        ),
      ).toThrow('the draw failed');
      expect(probeOf(ctx)).toBe(p);
    });
  });
});

describe('probeHand', () => {
  /** A context scaled 2× and moved (100, 50): what the person's units land on. */
  const placed = (): CanvasRenderingContext2D =>
    Schema.decodeSync(Schema.Any)({
      globalAlpha: 0.5,
      getTransform: () => ({ a: 2, b: 0, c: 0, d: 2, e: 100, f: 50 }),
    });
  const BODY: ReadonlyArray<readonly [number, number]> = [
    [-30, -120],
    [30, -120],
    [30, 0],
    [-30, 0],
  ];

  test('records each hand on screen: where it is, its shoulder, its work, its size and reach, its grip, and whether its body hides it', () => {
    const ctx = placed();
    const p: Probe = { sink: { texts: [], inks: [], hands: [] }, scene: 'a', dx: 10, alpha: 0.8 };
    let asked = 0;
    const body = () => {
      asked++;
      return [BODY];
    };
    probing(ctx, p, () => {
      probeHand(ctx, {
        side: 'far',
        shoulder: [-17, -111],
        at: [-10, -60],
        to: [-10, -60],
        size: 20,
        radius: 100,
        reach: 1,
        grip: HOLD,
        formed: 1,
        over: false,
        body,
      });
      probeHand(ctx, {
        side: 'near',
        shoulder: [17, -111],
        at: [80, -60],
        to: [90, -40],
        size: 20,
        radius: 100,
        reach: 1.4,
        grip: TURNING,
        formed: 0.5,
        over: true,
        body,
      });
    });
    expect(p.sink.hands).toEqual([
      {
        scene: 'a',
        side: 'far',
        x: 90,
        y: -70,
        sx: 76,
        sy: -172,
        tx: 90,
        ty: -70,
        size: 40,
        radius: 200,
        reach: 1,
        grip: HOLD,
        formed: 1,
        inside: true,
        over: false,
        alpha: 0.4,
      },
      {
        scene: 'a',
        side: 'near',
        x: 270,
        y: -70,
        sx: 144,
        sy: -172,
        tx: 290,
        ty: -30,
        size: 40,
        radius: 200,
        reach: 1,
        grip: TURNING,
        formed: 0.5,
        inside: false,
        over: true,
        alpha: 0.4,
      },
    ]);
    expect(asked).toBe(2);
  });

  test('a probe that does not collect hands, or none, records nothing and builds no body', () => {
    const ctx = placed();
    let asked = 0;
    const body = () => {
      asked++;
      return [BODY];
    };
    const hand = {
      side: 'near',
      shoulder: [17, -111],
      at: [0, -60],
      to: [0, -60],
      size: 20,
      radius: 100,
      reach: 1,
      grip: HOLD,
      formed: 1,
      over: false,
      body,
    } as const;
    probeHand(ctx, hand);
    const p = probe();
    probing(ctx, p, () => probeHand(ctx, hand));
    expect(p.sink).toEqual({ texts: [], inks: [] });
    expect(asked).toBe(0);
  });

  test('a face takes its place in the drawing order, so what is drawn after it is known to lie over it', () => {
    const ctx = drawable();
    const p: Probe = { sink: { texts: [], inks: [], faces: [] }, scene: 'a', dx: 0, alpha: 1 };
    probing(ctx, p, () => {
      recordInk(
        ctx,
        p,
        'fill',
        [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
        0,
        1,
      );
      expect(probesFaces(ctx)).toBe(true);
      probeFace(ctx, 5, 5, 40);
      recordInk(
        ctx,
        p,
        'stroke',
        [
          [0, 5],
          [10, 5],
        ],
        2,
        1,
      );
    });
    expect(p.sink.faces?.map((f) => f.order)).toEqual([1]);
    expect(p.sink.inks.map((m) => m.order)).toEqual([0, 1]);
    expect(probesFaces(ctx)).toBe(false);
  });
});
