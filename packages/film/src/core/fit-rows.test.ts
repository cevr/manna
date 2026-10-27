import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { FIT_BARS, type FitRow, fitPasses, fitRows } from './fit-rows.ts';
import type { Raster } from './raster.ts';

type Rgb = readonly [number, number, number];

const INK: Rgb = [43, 29, 22];
const CREAM: Rgb = [253, 225, 188];
const TEAL: Rgb = [97, 137, 141];
const SHEET_GROUND: Rgb = [253, 241, 219];
const RENDER_GROUND: Rgb = [238, 221, 201];

const W = 64;
const H = 96;

/** A head (a disc) over a body (a box) inside a 3 px line, `dx` to the right; its body's left half teal. */
const figure = (x: number, y: number, dx = 0) => {
  const [px, py] = [x - dx, y];
  return (
    (px - 32) ** 2 + (py - 18) ** 2 <= 10 ** 2 || (px >= 18 && px <= 46 && py >= 26 && py <= 84)
  );
};

interface Paint {
  readonly ground: Rgb;
  readonly dx?: number;
  readonly sliver?: boolean;
  readonly hole?: boolean;
  readonly mark?: number;
}

const NEAR: ReadonlyArray<readonly [number, number]> = [
  [3, 0],
  [-3, 0],
  [0, 3],
  [0, -3],
  [2, 2],
  [-2, 2],
  [2, -2],
  [-2, -2],
];

/** A pixel of the figure moved by `dx`: the ground outside it, its line within 3 px of its edge, teal on its body's left half, cream elsewhere. */
const colourAt = (ground: Rgb, x: number, y: number, dx: number): Rgb => {
  if (!figure(x, y, dx)) return ground;
  if (NEAR.some(([ox, oy]) => !figure(x + ox, y + oy, dx))) return INK;
  if (y > 26 && x - dx < 32) return TEAL;
  return CREAM;
};

/** The box `[x0, x1) × [y0, y1)` of `rgba` filled with `c`. */
const fill = (
  rgba: Uint8Array,
  [x0, x1, y0, y1]: readonly [number, number, number, number],
  c: Rgb,
) => {
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) rgba.set([c[0], c[1], c[2], 255], (y * W + x) * 4);
};

/** The figure painted on `ground`: its line, its cream and teal papers, and what the paint adds. */
const paint = ({ ground, dx = 0, sliver = false, hole = false, mark }: Paint): Raster => {
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) fill(rgba, [x, x + 1, y, y + 1], colourAt(ground, x, y, dx));
  // A 2 px strip of cream just outside the body's right line: a sliver.
  if (sliver) fill(rgba, [47 + dx, 49 + dx, 50, 62], CREAM);
  // A 6 px square of the ground inside the body: a hole.
  if (hole) fill(rgba, [26 + dx, 32 + dx, 60, 66], ground);
  // A line 3 px thick across the body from row `mark`.
  Option.map(Option.fromUndefinedOr(mark), (m) => fill(rgba, [22 + dx, 43 + dx, m, m + 3], INK));
  return { width: W, height: H, rgba };
};

const SHEET = paint({ ground: SHEET_GROUND });

const failing = (rows: ReadonlyArray<FitRow>) => rows.filter((r) => !r.pass).map((r) => r.name);

const within = (r: FitRow) =>
  Option.match(Option.fromUndefinedOr(r.bar.min), {
    onNone: () => true,
    onSome: (min) => r.value >= min,
  }) &&
  Option.match(Option.fromUndefinedOr(r.bar.max), {
    onNone: () => true,
    onSome: (max) => r.value <= max,
  });

describe('fitRows', () => {
  test('the same figure on another ground passes every row, the same rows each time', () => {
    const rows = fitRows(SHEET, paint({ ground: RENDER_GROUND }));
    expect(new Set(rows.map((r) => r.name))).toEqual(
      new Set([
        'silhouette.edge',
        'outline.turns',
        'silhouette.iou',
        'ink.edge',
        'slivers',
        'holes',
      ]),
    );
    expect(failing(rows)).toEqual([]);
    expect(fitPasses(rows)).toBe(true);
    expect(fitRows(SHEET, paint({ ground: RENDER_GROUND }))).toEqual(rows);
  });

  test('a figure moved 8 px fails its silhouette', () => {
    const rows = fitRows(SHEET, paint({ ground: RENDER_GROUND, dx: 8 }));
    expect(failing(rows)).toContain('silhouette.edge');
    expect(fitPasses(rows)).toBe(false);
  });

  test('a sliver of paper outside the line fails slivers, and a hole of the ground fails holes', () => {
    expect(failing(fitRows(SHEET, paint({ ground: RENDER_GROUND, sliver: true })))).toEqual([
      'slivers',
    ]);
    expect(failing(fitRows(SHEET, paint({ ground: RENDER_GROUND, hole: true })))).toEqual([
      'holes',
    ]);
  });

  test('each row passes exactly when its value lies inside its bar', () => {
    for (const p of [{ dx: 8 }, { sliver: true }, { hole: true }, {}])
      for (const r of fitRows(SHEET, paint({ ground: RENDER_GROUND, ...p })))
        expect(r.pass).toBe(within(r));
  });

  test('a crop with no figure gives no rows, and no rows never pass', () => {
    const empty: Raster = { width: W, height: H, rgba: new Uint8Array(W * H * 4).fill(240) };
    expect(fitRows(SHEET, empty)).toEqual([]);
    expect(fitPasses([])).toBe(false);
  });

  test("a view's bar for a row and band holds in place of the house's", () => {
    const moved = paint({ ground: RENDER_GROUND, dx: 8 });
    const rows = fitRows(SHEET, moved, {
      bars: {
        'silhouette.edge/head': { max: 20 },
        'silhouette.edge/body': { max: 20 },
        'silhouette.iou': { min: 0 },
      },
    });
    expect(rows.filter((r) => r.name === 'silhouette.edge').every((r) => r.pass)).toBe(true);
    expect(rows.find((r) => r.name === 'outline.turns' && r.band === 'body')?.bar).toEqual(
      FIT_BARS['outline.turns/body'],
    );
  });

  test("a probe fails where the render's line is not where the sheet's is, and passes where it is", () => {
    const sheet = paint({ ground: SHEET_GROUND, mark: 60 });
    const probe = { name: 'belt', along: 'col', at: 38, from: 30, to: 80 } as const;
    const at = (mark: number) =>
      fitRows(sheet, paint({ ground: RENDER_GROUND, mark }), { probes: [probe] }).find(
        (r) => r.name === 'probe.belt',
      );
    expect(at(61)?.pass).toBe(true);
    expect(at(70)?.value).toBe(10);
    expect(at(70)?.pass).toBe(false);
  });

  test('class rows read each class on the sheet by its samples and on the render by its papers', () => {
    const rows = fitRows(SHEET, paint({ ground: RENDER_GROUND }), {
      classes: {
        cream: { sheet: ['#fde1bc'], paper: ['#fde1bc'] },
        teal: { sheet: ['#61898d'], paper: ['#61898d'] },
      },
    });
    const iou = rows.filter((r) => r.name === 'class.iou');
    expect(iou.map((r) => [r.part, r.value])).toEqual([
      ['cream', 1],
      ['teal', 1],
    ]);
    expect(rows.filter((r) => r.name === 'class.colour').map((r) => r.value)).toEqual([0, 0]);
  });

  test('part rows compare the region each label picks on both crops: one moved fails, one in place passes', () => {
    const spec = {
      classes: {
        cream: { sheet: ['#fde1bc'], paper: ['#fde1bc'] },
        teal: { sheet: ['#61898d'], paper: ['#61898d'] },
      },
      labels: {
        robe: { classes: ['teal'] },
        mantle: { classes: ['teal'], compared: false },
      },
    };
    const parts = (dx: number) =>
      fitRows(SHEET, paint({ ground: RENDER_GROUND, dx }), spec)
        .filter((r) => r.name.startsWith('part.'))
        .map((r) => `${r.name}/${r.part} ${r.pass}`);
    expect(parts(0)).toEqual(['part.iou/robe true', 'part.edge/robe true']);
    expect(parts(8)).toEqual(['part.iou/robe false', 'part.edge/robe false']);
  });
});
