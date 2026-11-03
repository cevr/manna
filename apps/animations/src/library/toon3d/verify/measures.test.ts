import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import {
  deltaE,
  deltaLab,
  depthCode,
  doubledInk,
  faceMarks,
  faceOffset,
  figureMask,
  flatness,
  inkColour,
  inkWidth,
  iou,
  keptBlobs,
  lab,
  partDeltas,
  rgbOf,
  strokeWidth,
  tears,
  wholeBox,
  widthAcross,
  worstDrift,
  type Point,
  type Raster,
  type Rgb,
} from './measures.ts';

const PAPER = rgbOf('#fdf1d9');
const INK = rgbOf('#2c1b10');
const BASE = rgbOf('#f9dbb6');
const SHADE = rgbOf('#b07a5a');

const paint = (w: number, h: number, at: (x: number, y: number) => Rgb): Raster => {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = at(x, y);
      rgba.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
    }
  return { width: w, height: h, rgba };
};

const idsOf = (w: number, h: number, at: (x: number, y: number) => number): Raster =>
  paint(w, h, (x, y) => {
    const g = at(x, y) * 12;
    return [g, g, g];
  });

const inRect = (x: number, y: number, x0: number, y0: number, x1: number, y1: number): boolean =>
  x >= x0 && x <= x1 && y >= y0 && y <= y1;

const read = <A>(o: Option.Option<A>): A => Option.getOrThrowWith(o, () => 'expected a reading');

describe('colour', () => {
  test('white and black lie ΔE 100 apart, and a colour lies 0 from itself', () => {
    expect(deltaE([255, 255, 255], [0, 0, 0])).toBeCloseTo(100, 1);
    expect(deltaE(BASE, BASE)).toBe(0);
  });
});

describe('figureMask and iou', () => {
  test('a paper-pale fill inside an ink outline is figure, and two 10 px squares 5 px apart overlap by a third', () => {
    const r = paint(30, 30, (x, y) => {
      if (inRect(x, y, 10, 10, 19, 19)) return [252, 240, 216];
      if (inRect(x, y, 8, 8, 21, 21)) return INK;
      return PAPER;
    });
    const m = figureMask(r);
    expect(m.reduce((s, v) => s + v, 0)).toBe(14 * 14);
    const a = new Uint8Array(400).map((_, i) =>
      Number(inRect(i % 20, Math.floor(i / 20), 0, 0, 9, 9)),
    );
    const b = new Uint8Array(400).map((_, i) =>
      Number(inRect(i % 20, Math.floor(i / 20), 5, 0, 14, 9)),
    );
    expect(iou(a, b)).toBeCloseTo(1 / 3, 5);
  });
});

describe('ink', () => {
  const bar = paint(40, 40, (x) => {
    if (x >= 10 && x < 18) return INK;
    return PAPER;
  });

  test('an 8 px upright bar reads 8 px wide, and its colour is the ink', () => {
    expect(inkWidth(bar, wholeBox(bar))).toBe(8);
    expect(deltaLab(read(inkColour(bar)), lab(INK))).toBeLessThan(0.5);
  });

  const ring = (width: number, radius: number): Raster => {
    const n = 2 * Math.ceil(radius + width + 4);
    return paint(n, n, (x, y) => {
      const r = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5);
      if (r >= radius && r < radius + width) return INK;
      return PAPER;
    });
  };
  const stroke = (r: Raster): number => strokeWidth(r, wholeBox(r));

  test('a ring outline reads its width to a fraction of a pixel: each quarter pixel wider reads wider, so a 15 % change is not a whole-pixel step', () => {
    const widths = Array.from({ length: 13 }, (_, k) => 5 + k * 0.25);
    const read = widths.map((width) => stroke(ring(width, 60)));
    widths.forEach((width, k) => {
      expect(Math.abs((read[k] ?? 0) / width - 1)).toBeLessThan(0.07);
      expect(Math.abs(stroke(ring(width, 30)) / stroke(ring(width, 120)) - 1)).toBeLessThan(0.02);
      if (k > 0) expect(read[k] ?? 0).toBeGreaterThan(read[k - 1] ?? 0);
    });
  });

  test('two lines 2 px apart double every gap pixel, and one line doubles none', () => {
    const two = paint(20, 10, (x) => {
      if (x === 5 || x === 6 || x === 9 || x === 10) return INK;
      return PAPER;
    });
    expect(doubledInk(two, wholeBox(two))).toBe(2 * 10);
    expect(doubledInk(bar, wholeBox(bar))).toBe(0);
  });
});

describe('tears', () => {
  test('counts an enclosed 3 × 3 hole, never paper at the edge or a hole of 64 px or more', () => {
    const ids = idsOf(40, 40, (x, y) => {
      if (inRect(x, y, 5, 5, 7, 7)) return 0;
      if (inRect(x, y, 20, 20, 27, 27)) return 0;
      if (inRect(x, y, 2, 2, 37, 37)) return 5;
      return 0;
    });
    const clear = paint(40, 40, () => PAPER);
    expect(tears(ids, clear, (id) => id === 0)).toBe(9);
  });

  test('ground the ink covers is no tear: only enclosed ground that shows in the frame counts', () => {
    const ids = idsOf(40, 40, (x, y) => {
      if (inRect(x, y, 18, 18, 20, 20)) return 0;
      if (inRect(x, y, 28, 28, 30, 30)) return 0;
      if (inRect(x, y, 2, 2, 37, 37)) return 5;
      return 0;
    });
    const colour = paint(40, 40, (x, y) => {
      if (inRect(x, y, 17, 17, 21, 21)) return INK;
      return BASE;
    });
    expect(tears(ids, colour, (id) => id === 0)).toBe(9);
  });
});

describe('widthAcross', () => {
  const tube = (angle: number, half: number, length: number) => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return idsOf(120, 120, (x, y) => {
      const dx = x + 0.5 - 60;
      const dy = y + 0.5 - 60;
      const along = dx * c + dy * s;
      const across = -dx * s + dy * c;
      return Number(Math.abs(along) <= length / 2 && Math.abs(across) <= half) * 8;
    });
  };
  const axis = (
    angle: number,
    length: number,
  ): readonly [readonly [number, number], readonly [number, number]] => [
    [60 - (Math.cos(angle) * length) / 2, 60 - (Math.sin(angle) * length) / 2],
    [60 + (Math.cos(angle) * length) / 2, 60 + (Math.sin(angle) * length) / 2],
  ];

  test('a 10 px tube turned 30° reads 10 px across its axis, long or foreshortened', () => {
    const at = [0.3, 0.4, 0.5, 0.6, 0.7];
    const long = read(widthAcross(tube(Math.PI / 6, 5, 80), 8, axis(Math.PI / 6, 80), at));
    const short = read(widthAcross(tube(Math.PI / 6, 5, 24), 8, axis(Math.PI / 6, 24), at));
    expect(Math.abs(long - 10)).toBeLessThanOrEqual(1);
    expect(Math.abs(short - 10)).toBeLessThanOrEqual(1);
  });

  test('a run stops where the part folds over itself: a tube with its own part lying in front of it reads its own width', () => {
    const ids = paint(120, 120, (x, y) => {
      const front = Number(inRect(x, y, 20, 65, 100, 84));
      const back = Number(inRect(x, y, 20, 55, 100, 64));
      const id = Number(front + back > 0) * 96;
      return [id, depthCode(10 - 0.3 * front), id];
    });
    const width = read(
      widthAcross(
        ids,
        8,
        [
          [20, 60],
          [100, 60],
        ],
        [0.3, 0.5, 0.7],
      ),
    );
    expect(width).toBeCloseTo(10, 0);
  });

  test("a cylinder's depth, curving away to its silhouette, is one part: its whole width reads", () => {
    const ids = paint(120, 120, (x, y) => {
      const across = Math.abs(y + 0.5 - 60);
      const id = Number(across <= 15 && x >= 20 && x <= 100) * 96;
      const depth = 10 - Math.sqrt(Math.max(0, 15 ** 2 - across ** 2)) / 100;
      return [id, depthCode(depth), id];
    });
    const width = read(
      widthAcross(
        ids,
        8,
        [
          [20, 60],
          [100, 60],
        ],
        [0.5],
      ),
    );
    expect(width).toBeCloseTo(30, 0);
  });

  test('a sample whose run reaches another bone’s share of the part is skipped: near a bent elbow the sleeve reads its own width, not both sleeves', () => {
    const ids = idsOf(120, 120, (x, y) => {
      const lower = inRect(x, y, 20, 50, 99, 69);
      const upper = inRect(x, y, 80, 10, 99, 69);
      return Number(lower || upper) * 8;
    });
    const lower: readonly [Point, Point] = [
      [20, 60],
      [90, 60],
    ];
    const upper: readonly [Point, Point] = [
      [90, 60],
      [90, 10],
    ];
    expect(read(widthAcross(ids, 8, lower, [0.85, 0.9, 0.95], [upper]))).toBeCloseTo(20, 0);
    expect(read(widthAcross(ids, 8, upper, [0.3, 0.5, 0.7], [lower]))).toBeCloseTo(20, 0);
    expect(Option.isNone(widthAcross(ids, 8, lower, [0.9, 0.95], [upper]))).toBe(true);
  });

  test('a bone under 4 px on screen has no width', () => {
    expect(
      Option.isNone(
        widthAcross(
          tube(0, 5, 80),
          8,
          [
            [60, 60],
            [62, 60],
          ],
          [0.5],
        ),
      ),
    ).toBe(true);
  });
});

describe('flatness', () => {
  const disc = (shadeAt: (x: number, y: number) => boolean) => {
    const inDisc = (x: number, y: number) => Math.hypot(x + 0.5 - 30, y + 0.5 - 30) <= 20;
    const ids = idsOf(60, 60, (x, y) => Number(inDisc(x, y)) * 5);
    const colour = paint(60, 60, (x, y) => {
      if (!inDisc(x, y)) return PAPER;
      if (shadeAt(x, y)) return SHADE;
      return BASE;
    });
    return read(Option.fromUndefinedOr(flatness(colour, ids, new Map([[5, [BASE, SHADE]]]))[0]));
  };

  test('a two-tone disc is all flat, with one shade blob and a straight edge', () => {
    const f = disc((x) => x >= 30);
    expect(f.share).toBe(1);
    expect(f.blobs).toBe(1);
    expect(f.raggedness).toBeLessThan(2.2);
  });

  test('two shade spots are two blobs, and a stair-stepped edge is more ragged than a straight one', () => {
    expect(
      disc((x, y) => Math.hypot(x - 20, y - 30) < 4 || Math.hypot(x - 40, y - 30) < 4).blobs,
    ).toBe(2);
    const straight = disc((x) => x >= 30).raggedness;
    const ragged = disc((x, y) => x >= 30 + ((y % 4) - 2) * 3).raggedness;
    expect(ragged).toBeGreaterThan(straight * 1.5);
  });

  test('a ramp from base to shade is mostly not flat', () => {
    const ramp = paint(60, 60, (x) => {
      const t = x / 59;
      return [
        BASE[0] + (SHADE[0] - BASE[0]) * t,
        BASE[1] + (SHADE[1] - BASE[1]) * t,
        BASE[2] + (SHADE[2] - BASE[2]) * t,
      ];
    });
    const ids = idsOf(60, 60, () => 5);
    const f = read(Option.fromUndefinedOr(flatness(ramp, ids, new Map([[5, [BASE, SHADE]]]))[0]));
    expect(f.share).toBeLessThan(0.3);
  });
});

describe('partDeltas', () => {
  const PAINTS = new Map([
    [5, [BASE, SHADE]],
    [6, [BASE, SHADE]],
    [9, [SHADE]],
  ]);
  /** A 30 × 24 block inked round on paper, `dx` px right of x 10, filled by `fill`. */
  const figure = (dx: number, fill: (x: number, y: number) => Rgb) => (x: number, y: number) => {
    if (inRect(x, y, 10 + dx, 8, 39 + dx, 31)) return fill(x, y);
    if (inRect(x, y, 9 + dx, 7, 40 + dx, 32)) return INK;
    return PAPER;
  };

  test('a part painted a known colour off the kept reads that ΔE, and an unread part is left out', () => {
    const off: Rgb = [BASE[0] - 10, BASE[1], BASE[2]];
    const ids = idsOf(
      60,
      40,
      (x, y) => Number(inRect(x, y, 10, 8, 39, 31)) * (5 + Number(x >= 25)),
    );
    const kept = paint(
      60,
      40,
      figure(0, () => BASE),
    );
    const scene = paint(
      60,
      40,
      figure(0, (x) => {
        if (x < 25) return off;
        return BASE;
      }),
    );
    const deltas = partDeltas(kept, scene, ids, PAINTS);
    expect(deltas.map((d) => d.part)).toEqual([5, 6]);
    expect(deltas[0]?.deltaE ?? 0).toBeCloseTo(deltaE(BASE, off), 3);
    expect(deltas[1]?.deltaE ?? 1).toBe(0);
  });

  test('a part drawn 10 px off its kept place, in the kept paints, reads ΔE about 0', () => {
    const twoTone = (_x: number, y: number): Rgb => {
      if (y < 20) return BASE;
      return SHADE;
    };
    const kept = paint(60, 40, figure(0, twoTone));
    const scene = paint(60, 40, figure(10, twoTone));
    const ids = idsOf(60, 40, (x, y) => 1 + 4 * Number(inRect(x, y, 20, 8, 49, 31)));
    const deltas = partDeltas(kept, scene, ids, new Map([[5, [BASE, SHADE]]]));
    expect(deltas.map((d) => d.part)).toEqual([5]);
    expect(deltas[0]?.deltaE ?? 99).toBeLessThan(0.5);
  });

  test("another part's pixels near one of this part's paints, far from this part, are not its kept colour", () => {
    const near: Rgb = [SHADE[0] + 14, SHADE[1], SHADE[2]];
    const kept = paint(110, 40, (x, y) => {
      if (x >= 60) return figure(60, () => near)(x, y);
      return figure(0, (_x, yy) => {
        if (yy < 20) return BASE;
        return SHADE;
      })(x, y);
    });
    const ids = idsOf(110, 40, (x, y) => {
      if (inRect(x, y, 10, 8, 39, 31)) return 5;
      if (inRect(x, y, 70, 8, 99, 31)) return 6;
      return 0;
    });
    const scene = paint(110, 40, (x, y) => {
      if (x >= 60) return figure(60, () => PAPER)(x, y);
      return figure(0, (_x, yy) => {
        if (yy < 20) return BASE;
        return SHADE;
      })(x, y);
    });
    const deltas = partDeltas(kept, scene, ids, new Map([[5, [BASE, SHADE]]]));
    expect(deltas[0]?.deltaE ?? 99).toBeLessThan(0.5);
  });
});

describe('keptBlobs', () => {
  test("a kept part's shade patches count as its blobs, by its paints, with no ids pass of the kept", () => {
    const patches = [12, 22, 32];
    const kept = paint(60, 40, (x, y) => {
      if (inRect(x, y, 10, 8, 49, 31)) {
        if (patches.some((px) => inRect(x, y, px, 14, px + 4, 20))) return SHADE;
        return BASE;
      }
      if (inRect(x, y, 9, 7, 50, 32)) return INK;
      return PAPER;
    });
    const ids = idsOf(60, 40, (x, y) => Number(inRect(x, y, 14, 8, 53, 31)));
    expect(keptBlobs(kept, ids, new Map([[1, [BASE, SHADE]]]), 1)).toBe(3);
  });
});

describe('faceMarks', () => {
  const face = (ox: number, oy: number) =>
    paint(100, 100, (x, y) => {
      const r = Math.hypot(x - 50, y - 50);
      if (r >= 40 && r <= 44) return INK;
      if (
        inRect(x, y, 30 + ox, 30 + oy, 40 + ox, 32 + oy) ||
        inRect(x, y, 60 + ox, 30 + oy, 70 + ox, 32 + oy)
      )
        return INK;
      if (
        inRect(x, y, 33 + ox, 40 + oy, 36 + ox, 45 + oy) ||
        inRect(x, y, 64 + ox, 40 + oy, 67 + ox, 45 + oy)
      )
        return INK;
      if (inRect(x, y, 44 + ox, 65 + oy, 56 + ox, 67 + oy)) return INK;
      return BASE;
    });
  const head = { x0: 6, y0: 6, x1: 94, y1: 94 };

  test('reads two brows, two eyes and a mouth, and a face moved 3 across and 4 down is 5 px off', () => {
    const a = read(faceMarks(face(0, 0), head));
    expect(a.brows[0][0]).toBeCloseTo(35.5, 5);
    expect(a.eyes[1][1]).toBeCloseTo(43, 5);
    expect(a.mouth[0]).toBeCloseTo(50.5, 5);
    expect(faceOffset(a, read(faceMarks(face(3, 4), head)))).toBeCloseTo(5, 5);
  });

  test('a face missing its mouth has no reading', () => {
    const blank = paint(100, 100, (x, y) => {
      if (inRect(x, y, 30, 30, 40, 32)) return INK;
      return BASE;
    });
    expect(Option.isNone(faceMarks(blank, head))).toBe(true);
  });
});

describe('worstDrift', () => {
  test('is the largest change from the first value as a fraction, and none with no first value to drift from', () => {
    expect(read(worstDrift([10, 11, 8]))).toBeCloseTo(0.2, 9);
    expect(Option.isNone(worstDrift([]))).toBe(true);
    expect(Option.isNone(worstDrift([0, 4, 8]))).toBe(true);
  });
});
