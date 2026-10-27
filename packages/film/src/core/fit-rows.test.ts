import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { FIT_BARS, type FitRow, type FitSpec, fitPasses, fitRows } from './fit-rows.ts';
import { RENDER_GROUND, SHEET_GROUND, W, H, paint } from './fixtures/fit/figure.ts';
import type { Raster } from './raster.ts';

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

/** The figure's papers and a hand's skin, each painted on the render as on the sheet. */
const CLASSES = {
  cream: { sheet: ['#fde1bc'], paper: ['#fde1bc'] },
  teal: { sheet: ['#61898d'], paper: ['#61898d'] },
  skin: { sheet: ['#fdaf70'], paper: ['#fdaf70'] },
} as const;

/** The row named `name` of `rows`. */
const rowNamed = (rows: ReadonlyArray<FitRow>, name: string) => rows.find((r) => r.name === name);

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

  test("a thin strip of paper off the figure is a sliver, not the ground's grain; a thick or a short one is grain", () => {
    // 2 × 10 px, 5 px off the body's right line: a sliver; 3 × 6 px under it and 2 × 5 px left of the body's foot: the ground's grain.
    const strips = [
      [52, 54, 40, 50],
      [52, 55, 60, 66],
      [10, 12, 88, 93],
    ] as const;
    const rows = fitRows(SHEET, paint({ ground: RENDER_GROUND, strips }));
    expect(rowNamed(rows, 'slivers')?.value).toBe(20);
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
    const sheet = paint({ ground: SHEET_GROUND, marks: [60] });
    const probe = { name: 'belt', along: 'col', at: 38, from: 30, to: 80 } as const;
    const at = (mark: number) =>
      rowNamed(
        fitRows(sheet, paint({ ground: RENDER_GROUND, marks: [mark] }), { probes: [probe] }),
        'probe.belt',
      );
    expect(at(61)?.pass).toBe(true);
    expect(at(70)?.value).toBe(10);
    expect(at(70)?.pass).toBe(false);
  });

  test('a probe fails where the seam between two papers moves 8 px, and passes where it stays', () => {
    const probe = { name: 'seam', along: 'row', at: 50, from: 10, to: 54 } as const;
    const at = (seam: number) =>
      rowNamed(
        fitRows(SHEET, paint({ ground: RENDER_GROUND, seam }), {
          classes: CLASSES,
          probes: [probe],
        }),
        'probe.seam',
      );
    expect(at(32)?.value).toBe(0);
    expect(at(40)?.value).toBe(8);
    expect(at(40)?.pass).toBe(false);
  });

  test('a probe fails where the render draws a stroke the sheet does not, alone or beside one it does', () => {
    const probe = { name: 'belt', along: 'col', at: 38, from: 30, to: 80 } as const;
    const belt = (sheet: ReadonlyArray<number>, render: ReadonlyArray<number>) =>
      rowNamed(
        fitRows(
          paint({ ground: SHEET_GROUND, marks: sheet }),
          paint({ ground: RENDER_GROUND, marks: render }),
          { probes: [probe] },
        ),
        'probe.belt',
      );
    const alone = belt([], [60]);
    expect(alone?.pass).toBe(false);
    expect(alone?.where).toContain('render adds');
    expect(belt([60], [60, 66])?.pass).toBe(false);
  });

  test('a probe fails where the render lays a stroke over the whole probe, its edges past both ends', () => {
    const probe = { name: 'fold', along: 'row', at: 61, from: 23, to: 41 } as const;
    const fold = (marks: ReadonlyArray<number>) =>
      rowNamed(
        fitRows(SHEET, paint({ ground: RENDER_GROUND, marks }), { probes: [probe] }),
        'probe.fold',
      );
    expect(fold([])?.pass).toBe(true);
    expect(fold([60])?.value).toBe(19);
    expect(fold([60])?.pass).toBe(false);
    const fromEdge = rowNamed(
      fitRows(SHEET, paint({ ground: RENDER_GROUND, marks: [60] }), {
        probes: [{ ...probe, from: 21 }],
      }),
      'probe.fold',
    );
    expect(fromEdge?.pass).toBe(false);
  });

  test('a probe holds an inked seam moved 3 px to its edges, not to the stretch both edges sweep', () => {
    const probe = { name: 'seam', along: 'row', at: 50, from: 27, to: 40 } as const;
    const seam = (at: number) =>
      rowNamed(
        fitRows(
          paint({ ground: SHEET_GROUND, seam: 33, seamInk: 3 }),
          paint({ ground: RENDER_GROUND, seam: at, seamInk: 3 }),
          {
            classes: CLASSES,
            probes: [probe],
          },
        ),
        'probe.seam',
      );
    expect(seam(33)?.value).toBe(0);
    expect(seam(36)?.value).toBe(3);
  });

  test("a change just inside a probe's end is matched to the same change just past it", () => {
    const probe = { name: 'belt', along: 'col', at: 38, from: 30, to: 61 } as const;
    const row = rowNamed(
      fitRows(
        paint({ ground: SHEET_GROUND, marks: [62] }),
        paint({ ground: RENDER_GROUND, marks: [60] }),
        { probes: [probe] },
      ),
      'probe.belt',
    );
    expect(row?.value).toBe(2);
  });

  test('class rows read each class on the sheet by its samples and on the render by its papers', () => {
    const rows = fitRows(SHEET, paint({ ground: RENDER_GROUND }), {
      classes: { cream: CLASSES.cream, teal: CLASSES.teal },
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
      classes: { cream: CLASSES.cream, teal: CLASSES.teal },
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

  test('an erased hand fails its part rows, whether its anchor is read or no class reads it, saying why', () => {
    const hands = (spec: FitSpec, hand: boolean) =>
      fitRows(paint({ ground: SHEET_GROUND, hand: true }), paint({ ground: RENDER_GROUND, hand }), {
        classes: CLASSES,
        ...spec,
      }).filter((r) => r.part === 'hand');
    const anchored: FitSpec = {
      labels: {
        robe: { classes: ['teal'], compared: false },
        hand: { classes: ['skin'], where: [{ touching: 'robe' }] },
      },
    };
    expect(hands(anchored, true).map((r) => r.pass)).toEqual([true, true]);
    expect(hands(anchored, false).map((r) => r.pass)).toEqual([false, false]);
    const unread: FitSpec = {
      labels: {
        head: { classes: ['hair'], compared: false },
        hand: { classes: ['skin'], where: [{ below: 'head' }] },
      },
    };
    const rows = hands(unread, false);
    expect(rows.map((r) => [r.name, r.pass])).toEqual([
      ['part.iou', false],
      ['part.edge', false],
    ]);
    expect(rows[0]?.where).toContain('head picks no region (hair: no fit class)');
  });
});
