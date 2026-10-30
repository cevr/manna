import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { type Rgb, deltaE, labOf, lumaOf } from './cast-sheet-pixels.ts';
import {
  FIT_BARS,
  type FitRow,
  type FitSpec,
  fitPasses,
  fitRows,
  measuringGround,
  neighbourMask,
  overGround,
} from './fit-rows.ts';
import { CREAM, INK, RENDER_GROUND, SHEET_GROUND, W, H, paint } from './fixtures/fit/figure.ts';
import { PAPER } from './fixtures/figure.ts';
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

type Rgba = readonly [number, number, number, number];

/** A cut-out's crop and a kept sheet's: 48 px square, a box figure `[6, 42)²` (moved `dx` right) inside a 3 px line of ink, its inside `cloth`, `at` painted over it, `outside` round it. */
const S = 48;
type At = (x: number, y: number) => Option.Option<Rgba>;
const inside = (v: number, lo: number, hi: number) => v >= lo && v < hi;
const boxPixel = (outside: Rgba, cloth: Rgb, x: number, y: number): Rgba => {
  if (!inside(x, 6, 42) || !inside(y, 6, 42)) return outside;
  if (!inside(x, 9, 39) || !inside(y, 9, 39)) return [...INK, 255];
  return [...cloth, 255];
};
const crop = (outside: Rgba, cloth: Rgb, at: At = () => Option.none(), dx = 0): Raster => {
  const rgba = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++)
      rgba.set(
        Option.getOrElse(at(x, y), () => boxPixel(outside, cloth, x - dx, y)),
        (y * S + x) * 4,
      );
  return { width: S, height: S, rgba };
};

/** `at` for the box `[x0, x1) × [y0, y1)`: `px` inside it. */
const boxOf =
  ([x0, x1, y0, y1]: readonly [number, number, number, number], px: Rgba): At =>
  (x, y) =>
    Option.liftPredicate(px, () => inside(x, x0, x1) && inside(y, y0, y1));

const either =
  (...ats: ReadonlyArray<At>): At =>
  (x, y) =>
    Option.firstSomeOf(ats.map((a) => a(x, y)));

const CLEAR: Rgba = [0, 0, 0, 0];
const SHEET_PAPER: Rgba = [...SHEET_GROUND, 255];
/** A 2 px speck of the sheet's paper (ΔE 5.2 off its ground) in the ground: grain the flood steps round. */
const GRAIN = boxOf([2, 4, 20, 22], [...PAPER, 255]);

/** A posed crop read as the cut-out path reads it: over its own measuring ground. */
const overOwn = (posed: Raster) => overGround(posed, measuringGround([posed]));

/** The least ΔE76 from `c` to every opaque pixel of `r`. */
const leastDeltaE = (c: Rgb, r: Raster) => {
  let least = Infinity;
  for (let i = 0; i < S * S; i++)
    if ((r.rgba[i * 4 + 3] ?? 0) === 255) {
      const px: Rgb = [r.rgba[i * 4] ?? 0, r.rgba[i * 4 + 1] ?? 0, r.rgba[i * 4 + 2] ?? 0];
      least = Math.min(least, deltaE(labOf(c), labOf(px)));
    }
  return least;
};

const hex = (c: Rgb) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

describe('fitRows over a cut-out crop', () => {
  test('a 12 px hole is counted though the kept crop has a larger false hole of its own', () => {
    const concept = crop(SHEET_PAPER, CREAM, boxOf([9, 39, 9, 14], SHEET_PAPER));
    const posed = crop(CLEAR, CREAM, boxOf([26, 38, 26, 38], CLEAR));
    const holes = rowNamed(fitRows(concept, overOwn(posed)), 'holes');
    expect(holes?.value).toBe(144);
    expect(holes?.pass).toBe(false);
  });

  test('a 2 x 24 px hole 3 px inside the line is counted whole 8 px beside a paper pocket', () => {
    const concept = crop(SHEET_PAPER, CREAM, boxOf([21, 29, 12, 36], SHEET_PAPER));
    const posed = crop(CLEAR, CREAM, boxOf([12, 14, 12, 36], CLEAR));
    const holes = rowNamed(fitRows(concept, overOwn(posed)), 'holes');
    expect(holes?.value).toBe(48);
    expect(holes?.pass).toBe(false);
  });

  test("a hole within `POCKET_REACH` of a paper pocket reads as that pocket shifted, excused though they don't touch", () => {
    const concept = crop(SHEET_PAPER, CREAM, boxOf([16, 24, 12, 36], SHEET_PAPER));
    const posed = crop(CLEAR, CREAM, boxOf([12, 14, 12, 36], CLEAR));
    expect(rowNamed(fitRows(concept, overOwn(posed)), 'holes')?.value).toBe(0);
  });

  test('a clear run out from a paper pocket, as its rim is cut, is excused out to the reach and counted one px past it', () => {
    const reach = 7;
    const pocket = boxOf([20, 28, 12, 36], SHEET_PAPER);
    const concept = crop(SHEET_PAPER, CREAM, pocket);
    const cleared = (wide: number) =>
      overOwn(crop(CLEAR, CREAM, boxOf([20 - wide, 28, 12, 36], CLEAR)));
    expect(rowNamed(fitRows(concept, cleared(reach)), 'holes')?.value).toBe(0);
    expect(rowNamed(fitRows(concept, cleared(reach + 1)), 'holes')?.value).toBe(24);
  });

  test('a 1 px outline shift, a see-through seam speck and a kept hole drawn 1 px wider count no hole', () => {
    const concept = crop(SHEET_PAPER, CREAM, boxOf([26, 36, 26, 36], SHEET_PAPER));
    const posed = crop(
      CLEAR,
      CREAM,
      either(boxOf([20, 22, 20, 21], [...CREAM, 96]), boxOf([25, 37, 25, 37], CLEAR)),
      1,
    );
    const holes = rowNamed(fitRows(concept, overOwn(posed)), 'holes');
    expect(holes?.value).toBe(0);
    expect(holes?.pass).toBe(true);
  });

  test('cloth within ΔE 3.5 of the paper reads as figure over the measuring ground', () => {
    const cloth: Rgb = [236, 229, 216];
    expect(deltaE(labOf(cloth), labOf(PAPER))).toBeLessThanOrEqual(3.5);
    const concept = crop([200, 225, 250, 255], cloth);
    const posed = crop(CLEAR, cloth);
    const spec: FitSpec = { classes: { cloth: { sheet: [hex(cloth)], paper: [hex(cloth)] } } };
    const iou = (rows: ReadonlyArray<FitRow>) => rowNamed(rows, 'class.iou')?.value ?? 0;
    expect(iou(fitRows(concept, overGround(posed, PAPER), spec))).toBeLessThan(0.1);
    const rows = fitRows(concept, overOwn(posed), spec);
    expect(iou(rows)).toBe(1);
    expect(failing(rows)).toEqual([]);
  });

  test('the measuring ground is light and lies farthest from every opaque pixel, not the clear ones', () => {
    const posed = crop(CLEAR, CREAM);
    const g = measuringGround([posed]);
    expect(lumaOf(g)).toBeGreaterThanOrEqual(180);
    const light: ReadonlyArray<Rgb> = [
      [255, 255, 255],
      PAPER,
      RENDER_GROUND,
      [255, 255, 0],
      [0, 255, 255],
      [90, 255, 30],
    ];
    for (const c of light)
      expect(leastDeltaE(g, posed)).toBeGreaterThanOrEqual(leastDeltaE(c, posed));
    const swatch = (a: number) => crop([...g, a], g, () => Option.some([...g, a]));
    expect(measuringGround([posed, swatch(0)])).toEqual(g);
    expect(measuringGround([posed, swatch(255)])).not.toEqual(g);
    expect(measuringGround([posed], [hex(g)])).not.toEqual(g);
  });

  test('a see-through strip outside the line leaves the slivers and class rows, not the silhouette', () => {
    const concept = crop(SHEET_PAPER, CREAM);
    const plain = crop(CLEAR, CREAM);
    const ground = measuringGround([plain]);
    const strip = (a: number) => crop(CLEAR, CREAM, boxOf([42, 44, 10, 22], [...CREAM, a]));
    const spec: FitSpec = { classes: { cream: CLASSES.cream } };
    const read = (posed: Raster) => fitRows(concept, overGround(posed, ground), spec);
    const value = (rows: ReadonlyArray<FitRow>, name: string) => rowNamed(rows, name)?.value;
    const [none, opaque, seen] = [read(plain), read(strip(255)), read(strip(128))];
    expect(failing(opaque)).toContain('slivers');
    expect(failing(seen)).not.toContain('slivers');
    expect(value(seen, 'class.iou')).toBe(value(none, 'class.iou'));
    expect(value(opaque, 'class.iou')).not.toBe(value(none, 'class.iou'));
    expect(value(seen, 'silhouette.iou')).toBe(value(opaque, 'silhouette.iou'));
    expect(value(seen, 'silhouette.iou')).not.toBe(value(none, 'silhouette.iou'));
  });

  test("a rim of the sheet's own ground the cut carries past the line is no sliver", () => {
    const concept = crop(SHEET_PAPER, CREAM);
    const plain = crop(CLEAR, CREAM);
    const ground = measuringGround([plain]);
    const rim = crop(CLEAR, CREAM, boxOf([42, 44, 10, 22], SHEET_PAPER));
    const rows = fitRows(concept, overGround(rim, ground), { classes: { cream: CLASSES.cream } });
    expect(rowNamed(rows, 'slivers')?.value).toBe(0);
  });

  test("a speck of the sheet's paper inside the figure that the cut clears is no hole", () => {
    const speck = [20, 23, 20, 23] as const;
    const concept = crop(SHEET_PAPER, CREAM, either(GRAIN, boxOf(speck, [...PAPER, 255])));
    const posed = crop(CLEAR, CREAM, boxOf(speck, CLEAR));
    expect(rowNamed(fitRows(concept, overOwn(posed)), 'holes')?.value).toBe(0);
  });

  test("a 12 px hole in a light cloth is counted though the sheet's ground holds grain", () => {
    const cloth: Rgb = [236, 232, 226];
    expect(deltaE(labOf(cloth), labOf(SHEET_GROUND))).toBeLessThanOrEqual(15);
    const concept = crop(SHEET_PAPER, cloth, GRAIN);
    const posed = crop(CLEAR, cloth, boxOf([14, 26, 14, 26], CLEAR));
    expect(rowNamed(fitRows(concept, overOwn(posed)), 'holes')?.value).toBe(144);
  });

  test("a 12 px hole in a light cloth is counted though the cloth's grain lies near the sheet's ground", () => {
    const cloth: Rgb = [236, 232, 226];
    const grain: At = (x, y) =>
      Option.liftPredicate<Rgba>(
        SHEET_PAPER,
        () => inside(x, 9, 39) && inside(y, 9, 39) && x % 5 === 0 && y % 5 === 0,
      );
    const block = boxOf([14, 26, 14, 26], CLEAR);
    const concept = crop(SHEET_PAPER, cloth, grain);
    const posed = crop(CLEAR, cloth, either(block, grain));
    expect(rowNamed(fitRows(concept, overOwn(posed)), 'holes')?.value).toBeGreaterThanOrEqual(100);
  });

  test("a 12 px hole through a light cloth's grain clumps, within `near` of the sheet's ground, is counted", () => {
    const cloth: Rgb = [236, 232, 226];
    const clumpColour: Rgb = [247, 235, 216];
    // Above the paper core's ΔE 2, so no clump is a pocket, and within the kept crop's `near` (ΔE 3), so each is a kept hole.
    const clumpDe = deltaE(labOf(clumpColour), labOf(SHEET_GROUND));
    expect(clumpDe).toBeGreaterThan(2);
    expect(clumpDe).toBeLessThanOrEqual(3);
    // Nine clumps, 4 to 8 px square at a 10 px pitch: 36 of their px lie under the block.
    const clumps = Array.from({ length: 9 }, (_, k): At => {
      const [x0, y0, s] = [
        10 + (k % 3) * 10,
        10 + Math.floor(k / 3) * 10,
        4 + ((k % 3) + Math.floor(k / 3)),
      ];
      return boxOf([x0, x0 + s, y0, y0 + s], [...clumpColour, 255]);
    });
    const block = boxOf([16, 28, 16, 28], CLEAR);
    const concept = crop(SHEET_PAPER, cloth, either(...clumps));
    const posed = crop(CLEAR, cloth, either(block, ...clumps));
    const holes = rowNamed(fitRows(concept, overOwn(posed)), 'holes');
    expect(holes?.value).toBe(108);
    expect(holes?.pass).toBe(false);
  });

  test("a hole cut 3 px off a kept pocket of the sheet's paper is that pocket, excused", () => {
    const concept = crop(SHEET_PAPER, CREAM, boxOf([16, 28, 16, 28], SHEET_PAPER));
    const posed = crop(CLEAR, CREAM, boxOf([19, 31, 19, 31], CLEAR));
    const holes = rowNamed(fitRows(concept, overOwn(posed)), 'holes');
    expect(holes?.value).toBe(0);
    expect(holes?.pass).toBe(true);
  });

  test.each([
    [9, 84],
    [8, 144],
  ])(
    "a kept hole with %i px of the sheet's paper excuses a 12 px hole 2 px off it only from 9 px up: holes %i",
    (paper, holes) => {
      // The first `paper` px, row by row, of a 3 x 3 kept hole 2 px right of the hole; its other px stay cloth.
      const pocket =
        (px: Rgba): At =>
        (x, y) =>
          Option.liftPredicate(
            px,
            () => inside(x, 28, 31) && inside(y, 18, 21) && (y - 18) * 3 + (x - 28) < paper,
          );
      const concept = crop(SHEET_PAPER, CREAM, pocket(SHEET_PAPER));
      const posed = crop(CLEAR, CREAM, either(boxOf([14, 26, 14, 26], CLEAR), pocket(CLEAR)));
      expect(rowNamed(fitRows(concept, overOwn(posed)), 'holes')?.value).toBe(holes);
    },
  );

  test.each([
    [[252, 244, 220] as const, 1.9, 84],
    [[250, 242, 217] as const, 2.1, 144],
  ])(
    "a 4 x 4 kept hole of %j, ΔE %d off the sheet's ground, excuses a 12 px hole 2 px off it only within ΔE 2: holes %i",
    (paper, de, holes) => {
      expect(deltaE(labOf(paper), labOf(SHEET_GROUND))).toBeCloseTo(de, 2);
      const pocket = (px: Rgba) => boxOf([28, 32, 18, 22], px);
      const concept = crop(SHEET_PAPER, CREAM, pocket([...paper, 255]));
      const posed = crop(CLEAR, CREAM, either(boxOf([14, 26, 14, 26], CLEAR), pocket(CLEAR)));
      expect(rowNamed(fitRows(concept, overOwn(posed)), 'holes')?.value).toBe(holes);
    },
  );

  test("a neighbour's art that only the kept crop holds changes no row", () => {
    const art = [42, 48, 12, 30] as const;
    const head = either(boxOf([44, 46, 14, 28], [...CREAM, 255]), boxOf(art, [...INK, 255]));
    const neighbour = Uint8Array.from({ length: S * S }, (_, i) =>
      Number(inside(i % S, art[0], art[1]) && inside(Math.floor(i / S), art[2], art[3])),
    );
    const posed = overOwn(crop(CLEAR, CREAM));
    const classes = { cream: CLASSES.cream };
    const alone = fitRows(crop(SHEET_PAPER, CREAM), posed, { classes });
    const beside = crop(SHEET_PAPER, CREAM, head);
    expect(fitRows(beside, posed, { classes })).not.toEqual(alone);
    expect(fitRows(beside, posed, { classes, neighbour })).toEqual(alone);
  });

  test('a neighbour still a box reads 1 px past its width gives no mask', () => {
    // 4 x 2 still: art only in its last column, so a wrapped read would find it.
    const rgba = Uint8Array.from(
      { length: 4 * 2 * 4 },
      (_, i) => Number(i % 4 === 3 && Math.floor(i / 4) % 4 === 3) * 255,
    );
    const still: Raster = { width: 4, height: 2, rgba };
    expect(neighbourMask(still, [1, 0], 3, 2)).toEqual(
      Option.some(Uint8Array.from([0, 0, 1, 0, 0, 1])),
    );
    expect(neighbourMask(still, [2, 0], 3, 2)).toEqual(Option.none());
  });
});
