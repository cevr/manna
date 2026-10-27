import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { type LabelRegion, type LabelTable, labelRegions } from './label.ts';
import type { Raster } from './raster.ts';
import { traceView } from './trace.ts';

/** A region of `cls` round centre (`x`, `y`), `r` each way, its size its box's. */
const region = (id: number, cls: string, x: number, y: number, r: number): LabelRegion => ({
  id,
  class: cls,
  at: [x, y],
  box: [x - r, y - r, x + r, y + r],
  size: (2 * r) ** 2,
});

/** A face, two ears beside it (the near one larger), two hands below, and a cream robe. */
const REGIONS = [
  region(1, 'skin', 50, 30, 15),
  region(2, 'skin', 28, 30, 4),
  region(3, 'skin', 72, 30, 3),
  region(4, 'skin', 20, 90, 6),
  region(5, 'skin', 80, 90, 5),
  region(6, 'cream', 50, 80, 20),
];

/** Regions 2 and 3 touch region 1; region 5 touches region 6. */
const touches = (a: number, b: number) =>
  [
    [1, 2],
    [1, 3],
    [5, 6],
  ].some(([x, y]) => (a === x && b === y) || (a === y && b === x));

const ids = (table: LabelTable) => {
  const { picked, refused } = labelRegions(REGIONS, table, touches);
  return {
    picked: Object.fromEntries(Object.entries(picked).map(([name, r]) => [name, r.id])),
    refused,
  };
};

/** Every label picked, as `ids` gives them, none refused. */
const all = (picked: Readonly<Record<string, number>>) => ({ picked, refused: [] });

describe('labelRegions', () => {
  test('a label with no rule picks the largest region of its classes', () => {
    expect(ids({ face: { classes: ['skin'] }, robe: { classes: ['cream'] } })).toEqual(
      all({ face: 1, robe: 6 }),
    );
  });

  test('two parts of one class are parted by left and right of a labelled part', () => {
    expect(
      ids({
        face: { classes: ['skin'] },
        earNear: { classes: ['skin'], where: [{ left: 'face' }, { touching: 'face' }] },
        earFar: { classes: ['skin'], where: [{ right: 'face' }, { touching: 'face' }] },
      }),
    ).toEqual(all({ face: 1, earNear: 2, earFar: 3 }));
  });

  test('two parts of one class are parted by above and below a labelled part', () => {
    expect(
      ids({
        hand: { classes: ['skin'], where: [{ below: 'ear' }] },
        ear: { classes: ['skin'], where: [{ above: 'robe' }, { left: 'robe' }] },
        robe: { classes: ['cream'] },
      }),
    ).toEqual(all({ hand: 4, ear: 2, robe: 6 }));
  });

  test('touching parts a smaller region from a larger one that does not touch', () => {
    expect(
      ids({
        robe: { classes: ['cream'] },
        hand: { classes: ['skin'], where: [{ touching: 'robe' }] },
      }),
    ).toEqual(all({ robe: 6, hand: 5 }));
  });

  test('a label that picks nothing, names no label or is made of itself is refused by name', () => {
    const refused = (table: LabelTable) => labelRegions(REGIONS, table, touches).refused.join('; ');
    expect(refused({ tail: { classes: ['teal'] } })).toBe('the label tail picks no region (teal)');
    expect(refused({ hand: { classes: ['skin'], where: [{ below: 'foot' }] } })).toBe(
      'no label foot',
    );
    expect(refused({ hand: { classes: ['skin'], where: [{ below: 'hand' }] } })).toBe(
      'the label hand is made of itself',
    );
    expect(
      refused({
        face: { classes: ['skin'] },
        ear: { classes: ['skin'], where: [{ above: 'face' }] },
      }),
    ).toBe('the label ear picks no region (skin, above face)');
  });
});

type Rgb = readonly [number, number, number];
const GROUND: Rgb = [240, 230, 210];
const INK: Rgb = [20, 15, 10];
const SKIN: Rgb = [253, 175, 112];
const W = 80;
const H = 40;

/** The colour at distance `d` from the nearest disc's edge: the ground outside, the ink within 2 px inside, the skin past it. */
const colourAt = (d: number): Rgb => {
  if (d > 0) return GROUND;
  if (d > -2) return INK;
  return SKIN;
};

/** Two skin discs side by side, each inside a 2 px ink ring, on the ground: the left one larger. */
const sheet = (): Raster => {
  const rgba = new Uint8Array(W * H * 4);
  const discs = [
    { x: 22, y: 20, r: 12 },
    { x: 58, y: 20, r: 9 },
  ];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.min(...discs.map((c) => Math.hypot(x - c.x, y - c.y) - c.r));
      const c = colourAt(d);
      rgba.set([c[0], c[1], c[2], 255], (y * W + x) * 4);
    }
  return { width: W, height: H, rgba };
};

const VIEW = {
  box: [0, 0, W, H] as const,
  classes: { skin: ['#fdaf70'] },
};

describe('a view traced from labels', () => {
  test('picks the regions its seeds picked, and writes the same outlines', () => {
    const SHEET = sheet();
    const seeded = traceView(SHEET, {
      ...VIEW,
      parts: { big: { seeds: [[22, 20]] }, small: { seeds: [[58, 20]] } },
    });
    const labelled = traceView(SHEET, {
      ...VIEW,
      labels: {
        big: { classes: ['skin'] },
        small: { classes: ['skin'], where: [{ right: 'big' }] },
      },
      parts: { big: { label: 'big' }, small: { label: 'small' } },
    });
    expect(Result.map(labelled, (t) => t.outlines)).toEqual(Result.map(seeded, (t) => t.outlines));
    expect(Result.map(labelled, (t) => Object.keys(t.labelled))).toEqual(
      Result.succeed(['big', 'small']),
    );
  });

  test('a part naming a label its table lacks is refused by name', () => {
    const traced = traceView(sheet(), {
      ...VIEW,
      labels: { big: { classes: ['skin'] } },
      parts: { big: { label: 'big' }, small: { label: 'small' } },
    });
    expect(Result.isFailure(traced) && traced.failure.reason).toContain(
      'the part small names no label small',
    );
  });
});
