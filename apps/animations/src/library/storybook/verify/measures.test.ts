import { rng } from '@manna/film/core';
import type { Raster } from '@manna/film/tools';
import { Option } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { deltaE, hexOf, type Lines, type Palette, paintsOf, type Rgb } from '../sheet.ts';
import type { FigureFrame } from '../shot.ts';
import { BARS } from './bars.ts';
import {
  colourStep,
  type FigureRead,
  type FrameRead,
  heightSamples,
  lightSamples,
  paintMedians,
  paletteShare,
  pocketCount,
  proportionSamples,
  readFigure,
  scaleInfo,
  scaleSamples,
  stepSamples,
} from './measures.ts';
import { type Measured, one, verdictOf, verdictText } from './verdict.ts';

/** A run where every check reads one passing value: each test swaps in the check it holds. */
const ALL_PASS: Measured = {
  palette: [one('x', 1)],
  pockets: [one('x', 0)],
  'colour-step': [one('x', 0)],
  proportions: [one('x', 0)],
  scale: [one('x', 1)],
  'one-sheet': [one('x', 0)],
  light: [one('x', 1)],
  'render-height': [one('x', 0)],
  determinism: [one('x', 0)],
};

const INK: Rgb = [20, 10, 5];
const SKIN: Rgb = [240, 180, 130];
const ROBE: Rgb = [110, 130, 125];
const FOREIGN: Rgb = [0, 200, 0];
const GROUND: Rgb = [160, 220, 170];

const PALETTE: Palette = {
  ink: hexOf(INK),
  parts: [
    { name: 'skin', base: hexOf(SKIN), role: 'skin' },
    { name: 'robe', base: hexOf(ROBE), role: 'garment' },
  ],
};

const PAINTS = paintsOf(PALETTE);

/** A `width` × `height` picture, clear, with `fill` painting each pixel it answers a colour for. */
const pictureOf = (
  width: number,
  height: number,
  fill: (x: number, y: number) => Option.Option<Rgb>,
): Raster => {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      Option.map(fill(x, y), (c) => rgba.set([...c, 255], (y * width + x) * 4));
  return { width, height, rgba };
};

/** A figure in a frame: an inked box whose top third is skin and the rest robe, at (x0, y0), `w` × `h`, the robe drawn in `robe`. */
const figureIn = (
  frame: { readonly width: number; readonly height: number },
  at: { readonly x0: number; readonly y0: number; readonly w: number; readonly h: number },
  robe: Rgb = ROBE,
): Raster =>
  pictureOf(frame.width, frame.height, (x, y) => {
    const u = x - at.x0;
    const v = y - at.y0;
    if (u < 0 || v < 0 || u >= at.w || v >= at.h) return Option.none();
    if (u === 0 || v === 0 || u === at.w - 1 || v === at.h - 1) return Option.some(INK);
    if (v < at.h / 3) return Option.some(SKIN);
    return Option.some(robe);
  });

describe('paletteShare and pocketCount', () => {
  test('share the opaque pixels that are exactly a paint, the ink one of them, and count the ones at the ground', () => {
    const cell = pictureOf(4, 2, (x, y) =>
      Option.fromUndefinedOr(
        [
          [INK, SKIN, ROBE, FOREIGN],
          [GROUND, GROUND],
        ][y]?.[x],
      ),
    );
    expect(paletteShare(cell, PAINTS)).toBe(3 / 6);
    expect(pocketCount(cell, GROUND)).toBe(2);
    expect(pocketCount(cell, [0, 0, 0])).toBe(0);
  });
});

describe('readFigure', () => {
  const frame = { width: 60, height: 80 };

  test('reads a figure clear of the frame as whole, its lines, and every interior pixel as a paint', () => {
    const read = readFigure(figureIn(frame, { x0: 10, y0: 5, w: 30, h: 60 }), PAINTS);
    expect(read.whole).toBe(true);
    expect(Option.map(read.lines, (l) => [l.crown, l.bottom])).toEqual(Option.some([0, 59]));
    expect(read.litInterior).toBe(read.interior);
    expect(read.interior).toBeGreaterThan(0);
  });

  test('reads a figure the frame cuts off as not whole', () => {
    expect(readFigure(figureIn(frame, { x0: 0, y0: 5, w: 30, h: 60 }), PAINTS).whole).toBe(false);
  });

  test('counts no interior pixel of a colour off the palette as lit', () => {
    const read = readFigure(figureIn(frame, { x0: 10, y0: 5, w: 30, h: 60 }, FOREIGN), PAINTS);
    expect(read.litInterior).toBeLessThan(read.interior * 0.5);
  });
});

describe('paintMedians', () => {
  test("takes each paint's median and count over every opaque pixel nearest it, the outline's included, and none for the ink", () => {
    const medians = paintMedians(
      figureIn({ width: 60, height: 80 }, { x0: 10, y0: 5, w: 30, h: 60 }),
      PAINTS,
    );
    expect(medians.has(0)).toBe(false);
    expect(medians.get(1)).toEqual({ rgb: SKIN, count: 28 * 19 });
    expect(medians.get(2)).toEqual({ rgb: ROBE, count: 28 * 39 });
  });
});

describe('colourStep', () => {
  const frame = { width: 60, height: 80 };
  const box = { x0: 10, y0: 5, w: 30, h: 60 };

  test('is 0 between two cells of the same paints, and the shift of a paint that drifts', () => {
    const a = paintMedians(figureIn(frame, box), PAINTS);
    const b = paintMedians(figureIn(frame, { ...box, x0: 20 }), PAINTS);
    const drifted: Rgb = [ROBE[0] + 4, ROBE[1], ROBE[2]];
    const c = paintMedians(figureIn(frame, box, drifted), PAINTS);
    expect(colourStep(a, b)).toEqual(Option.some(0));
    expect(Option.getOrElse(colourStep(a, c), () => -1)).toBeGreaterThan(1);
  });

  test('reads a step in a paint drawn in two alternating colours, whose pixels are none of them interior (round 1, M4)', () => {
    const checker = (drift: number): Raster =>
      pictureOf(50, 80, (x, y) => {
        if (x < 5 || x >= 45 || y < 5 || y >= 75) return Option.none();
        if (y < 25) return Option.some(SKIN);
        return Option.some([ROBE[0] + drift + ((x + y) % 2) * 6, ROBE[1], ROBE[2]]);
      });
    const step = colourStep(paintMedians(checker(0), PAINTS), paintMedians(checker(6), PAINTS));
    expect(Option.getOrElse(step, () => -1)).toBeCloseTo(
      deltaE([ROBE[0] + 6, ROBE[1], ROBE[2]], [ROBE[0] + 12, ROBE[1], ROBE[2]]),
      9,
    );
  });

  test('reads the step of a paint drawn in one-pixel stripes between ink stripes, none of whose pixels has a neighbour of its own paint (round 2, M1)', () => {
    const striped = (drift: number): Raster =>
      pictureOf(80, 100, (x, y) => {
        if (x < 5 || x >= 75 || y < 5 || y >= 95) return Option.none();
        if (y < 30) return Option.some(SKIN);
        if (x % 2 === 0) return Option.some(INK);
        return Option.some([ROBE[0] + drift, ROBE[1], ROBE[2]]);
      });
    const [a, b] = [paintMedians(striped(0), PAINTS), paintMedians(striped(6), PAINTS)];
    expect(a.get(2)?.count).toBe(35 * 65);
    const samples = stepSamples(
      [
        plannedAt(0, 1, [posed({ name: 'f', cell: 'a', scale: 1 })]),
        plannedAt(1, 1, [posed({ name: 'f', cell: 'b', scale: 1 })]),
      ],
      new Map([
        [
          'f',
          new Map([
            ['a', a],
            ['b', b],
          ]),
        ],
      ]),
    );
    expect(Option.getOrElse(samples[0]?.value ?? Option.none(), () => -1)).toBeCloseTo(
      deltaE(ROBE, [ROBE[0] + 6, ROBE[1], ROBE[2]]),
      9,
    );
    expect(verdictOf(BARS, { ...ALL_PASS, 'colour-step': samples }).passed).toBe(BARS.length - 1);
  });

  test("over generated layouts (stripes and checks one to six px wide, scattered patches, ink between), shifts and counts: the worst ΔE between each paint's median over every pixel drawn in it", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const draw = rng(seed);
      const int = (a: number, b: number) => a + Math.floor(draw() * (b - a + 1));
      const layout = int(0, 4);
      const shift: Rgb = [int(-4, 4), int(-4, 4), int(-4, 4)];
      const rows = int(2, 20);
      const band = int(1, 6);
      const inked = draw() < 0.5;
      const patches = new Set(
        Array.from({ length: int(120, 220) }, () => int(0, 39) * 40 + int(0, 39)),
      );
      const size = 40;
      const paintAt = (x: number, y: number): 0 | 1 | 2 => {
        if (inked && (x + 2 * y) % 7 === 0) return 0;
        if (layout === 0 && (Math.floor(x / band) + Math.floor(y / band)) % 2 === 0) return 1;
        if (layout === 1 && Math.floor(y / band) % 2 === 0) return 1;
        if (layout === 2 && y < rows) return 1;
        if (layout === 3 && Math.floor(x / band) % 2 === 0) return 1;
        if (layout === 4 && !patches.has(y * size + x)) return 1;
        return 2;
      };
      const frameOf = (k: 0 | 1) => {
        const truth = new Map<0 | 1 | 2, Array<Rgb>>([
          [0, []],
          [1, []],
          [2, []],
        ]);
        const raster = pictureOf(size, size, (x, y) => {
          const p = paintAt(x, y);
          const base = [INK, SKIN, ROBE][p] ?? INK;
          const wobble = ((x * 7 + y * 3 + k) % 5) - 2;
          const c: Rgb = [
            base[0] + shift[0] * k + wobble,
            base[1] + shift[1] * k,
            base[2] + shift[2] * k,
          ];
          truth.get(p)?.push(c);
          return Option.some(c);
        });
        return { raster, truth };
      };
      const [a, b] = [frameOf(0), frameOf(1)];
      const channel = (cs: ReadonlyArray<Rgb>, ch: 0 | 1 | 2): number =>
        cs.map((c) => c[ch]).toSorted((u, v) => u - v)[cs.length >> 1] ?? 0;
      const median = (cs: ReadonlyArray<Rgb>): Rgb => [
        channel(cs, 0),
        channel(cs, 1),
        channel(cs, 2),
      ];
      const steps = ([1, 2] as const).flatMap((p) => {
        const [pa, pb] = [a.truth.get(p) ?? [], b.truth.get(p) ?? []];
        if (pa.length < 150 || pb.length < 150) return [];
        return [deltaE(median(pa), median(pb))];
      });
      const oracle = Math.max(-1, ...steps);
      const got = colourStep(paintMedians(a.raster, PAINTS), paintMedians(b.raster, PAINTS));
      expect([seed, Number(Option.getOrElse(got, () => -1).toFixed(9))]).toEqual([
        seed,
        Number(oracle.toFixed(9)),
      ]);
    }
  });

  test('reads none when the cells share no paint of 150 px', () => {
    const small = paintMedians(figureIn(frame, { x0: 10, y0: 5, w: 8, h: 9 }), PAINTS);
    expect(colourStep(small, small)).toEqual(Option.none());
  });
});

const linesOfHeight = (crown: number, bottom: number, head: number): Lines => ({
  top: crown,
  bottom,
  headColumn: 0,
  centreColumn: 0,
  crown,
  head: Option.some(head),
  hem: Option.some(bottom - 10),
  sashTop: Option.none(),
});

/** A cell's lines as its sheet reads them: `height` rows crown to soles, and its head when it reads one. */
const cellLines = (height: number, head: Option.Option<number>): Option.Option<Lines> =>
  Option.some({ ...linesOfHeight(0, height - 1, 0), head });

/** A cell whose head reads `head`, `height` rows crown to soles. */
const headed = (head: number, height = 100): Option.Option<Lines> =>
  cellLines(height, Option.some(head));

/** A cell whose head column reads none, `height` rows crown to soles. */
const unheaded = (height: number): Option.Option<Lines> => cellLines(height, Option.none());

const readOf = (lines: Lines, whole = true): FigureRead => ({
  whole,
  lines: Option.some(lines),
  interior: 10,
  litInterior: 10,
});

const frameRead = (
  r: Partial<FrameRead> & Pick<FrameRead, 'name' | 'frame' | 'read'>,
): FrameRead => ({
  cell: 'a',
  zoom: 1,
  squashed: false,
  ...r,
});

/** One figure of a planned frame, at rest with its cell's own eyes unless named otherwise. */
const posed = (
  f: Partial<FigureFrame> & Pick<FigureFrame, 'name' | 'cell' | 'scale'>,
): FigureFrame => ({
  layer: f.name,
  eyes: f.cell,
  x: 0,
  y: 0,
  sx: 1,
  sy: 1,
  breath: 1,
  ...f,
});

/** A planned frame: its index, the camera's zoom and its figures. */
const plannedAt = (index: number, zoom: number, figures: ReadonlyArray<FigureFrame>) => ({
  index,
  frame: { t: index / 24, camera: { t: index / 24, x: 0, y: 0, zoom }, figures },
});

/**
 * The lead and a guest over generated frames: the guest's depth, each
 * frame's zoom, each figure's draw scale, squash and cell, each cell's head
 * at its sheet's size, and the share of the bar's wanted head the guest is
 * drawn at. The guest's cell head is made from the share by the head each
 * figure is drawn at brought to the focal plane (cell head × draw scale ×
 * squash up × depth), not by the bar's own formula.
 */
const scaleCase = (seed: number) => {
  const draw = rng(seed);
  const z = 0.6 + draw() * 1.4;
  const frames = Array.from({ length: 2 + Math.floor(draw() * 6) }, (_, index) => {
    const zoom = 1 + draw() * 0.12;
    const lead = { head: 60 + draw() * 300, scale: 0.2 + draw(), sy: 1 + (draw() - 0.5) * 0.06 };
    const guest = { scale: 0.2 + draw(), sy: 1 + (draw() - 0.5) * 0.06 };
    const share = [0.94, 0.951, 1, 1.049, 1.06][Math.floor(draw() * 5)] ?? 1;
    const head = (share * lead.head * lead.scale * lead.sy) / (guest.scale * guest.sy * z);
    return { index, zoom, lead, guest, head, share };
  });
  return {
    planned: frames.map((f) =>
      plannedAt(f.index, f.zoom, [
        posed({ name: 'lead', cell: `l${f.index}`, scale: f.lead.scale, sy: f.lead.sy }),
        posed({ name: 'guest', cell: `g${f.index}`, scale: f.guest.scale, sy: f.guest.sy }),
      ]),
    ),
    figures: [
      {
        name: 'lead',
        z: 1,
        lines: new Map(frames.map((f) => [`l${f.index}`, headed(f.lead.head)] as const)),
      },
      {
        name: 'guest',
        z,
        lines: new Map(frames.map((f) => [`g${f.index}`, headed(f.head)] as const)),
      },
    ],
    shares: frames.map((f) => f.share),
  };
};

describe('scaleSamples', () => {
  test("judges each figure's head as the plan draws it (its cell's head at its sheet's size × draw scale × plane zoom × squash) against the same frame's lead: head ÷ (the lead's × 1/z × zoom^(1/z) ÷ zoom), over generated depths, zooms, scales, squashes and heads", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { planned, figures, shares } = scaleCase(seed);
      const { samples, fallbacks } = scaleSamples(planned, figures, 'lead');
      expect(samples.map((s) => Number(Option.getOrElse(s.value, () => -1).toFixed(9)))).toEqual(
        shares.map((s) => Number(s.toFixed(9))),
      );
      expect(fallbacks).toEqual([]);
      expect(verdictOf(BARS, { ...ALL_PASS, scale: samples }).checks[4]?.pass).toBe(
        shares.every((s) => Math.abs(s - 1) <= 0.05),
      );
    }
  });

  test("reads every planned frame, a figure cut off by the frame's edge or turning included, and fails a guest steady against the lead's median head but off the same frame's lead (round 1, M1)", () => {
    const lead = {
      name: 'lead',
      z: 1,
      lines: new Map([
        ['a', headed(95.1)],
        ['b', headed(100)],
      ]),
    };
    const guest = { name: 'guest', z: 1, lines: new Map([['n', headed(104.9)]]) };
    const planned = ['a', 'b', 'b'].map((cell, index) =>
      plannedAt(index, 1, [
        posed({ name: 'lead', cell, scale: 1, x: -400 }),
        posed({ name: 'guest', cell: 'n', scale: 1 }),
      ]),
    );
    const { samples } = scaleSamples(planned, [lead, guest], 'lead');
    expect(
      samples.map((s) => [s.at, Number(Option.getOrElse(s.value, () => -1).toFixed(9))]),
    ).toEqual([
      ['guest frame 0 (n; lead a)', Number((104.9 / 95.1).toFixed(9))],
      ['guest frame 1 (n; lead b)', 1.049],
      ['guest frame 2 (n; lead b)', 1.049],
    ]);
    expect(verdictOf(BARS, { ...ALL_PASS, scale: samples }).passed).toBe(BARS.length - 1);
  });

  test("reads unread where a cell's head was not read at its sheet's size and its crown and soles were not either, the guest's or the lead's, where a figure's sheet has no such cell, and where its sheet reads no head to scale from", () => {
    const lead = {
      name: 'lead',
      z: 1,
      lines: new Map([
        ['a', headed(100)],
        ['x', Option.none()],
      ]),
    };
    const guest = {
      name: 'g',
      z: 1,
      lines: new Map([
        ['a', headed(100)],
        ['x', Option.none()],
      ]),
    };
    const headless = { name: 'h', z: 1, lines: new Map([['u', unheaded(100)]]) };
    const planned = [
      ['a', 'x', 'u'],
      ['x', 'a', 'u'],
      ['a', 'missing', 'u'],
      ['a', 'a', 'u'],
    ].map(([l = '', g = '', h = ''], index) =>
      plannedAt(index, 1, [
        posed({ name: 'lead', cell: l, scale: 1 }),
        posed({ name: 'g', cell: g, scale: 1 }),
        posed({ name: 'h', cell: h, scale: 1 }),
      ]),
    );
    const none = (at: string) => ({
      at: `${at}: no head read, nor one from crown-to-soles, in its cell or the lead's`,
      value: Option.none(),
    });
    expect(scaleSamples(planned, [lead, guest, headless], 'lead')).toEqual({
      samples: [
        none('g frame 0 (x; lead a)'),
        none('h frame 0 (u; lead a)'),
        none('g frame 1 (a; lead x)'),
        none('h frame 1 (u; lead x)'),
        none('g frame 2 (missing; lead a)'),
        none('h frame 2 (u; lead a)'),
        { at: 'g frame 3 (a; lead a)', value: Option.some(1) },
        none('h frame 3 (u; lead a)'),
      ],
      fallbacks: [],
    });
  });

  /**
   * A sheet of read cells round a chosen median head and median
   * crown-to-soles (as many above each median as below), and one cell whose
   * head reads none, drawn at `ratio` of the median crown-to-soles.
   */
  const sheetCase = (draw: () => number) => {
    const head = 80 + draw() * 220;
    const height = 400 + draw() * 400;
    const side = 1 + Math.floor(draw() * 3);
    const around = (median: number) => [
      ...Array.from({ length: side }, () => median * (1 - 0.01 - draw() * 0.3)),
      median,
      ...Array.from({ length: side }, () => median * (1 + 0.01 + draw() * 0.3)),
    ];
    const heights = around(height).toSorted(() => draw() - 0.5);
    const ratio = 0.8 + draw() * 0.4;
    const lines = new Map([
      ...around(head).map((h, i) => [`c${i}`, headed(h, heights[i] ?? height)] as const),
      ['u', unheaded(height * ratio)] as const,
    ]);
    return { head, ratio, lines };
  };

  test("reads a cell whose head column is ambiguous at its sheet's head × the cell's own crown-to-soles over the sheet's median crown-to-soles (over the cells that read a head), the guest's or the lead's, and names each such frame in its sample and its fallbacks", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const draw = rng(seed);
      const g = sheetCase(draw);
      const l = sheetCase(draw);
      const lead = { name: 'lead', z: 1, lines: l.lines };
      const guest = { name: 'guest', z: 1, lines: g.lines };
      const planned = [
        ['c0', 'u'],
        ['u', 'c0'],
        ['u', 'u'],
      ].map(([lc = '', gc = ''], index) =>
        plannedAt(index, 1, [
          posed({ name: 'lead', cell: lc, scale: 1 }),
          posed({ name: 'guest', cell: gc, scale: 1 }),
        ]),
      );
      const [lc0, gc0] = [l, g].map((s) =>
        Option.getOrElse(
          Option.flatMap(Option.flatten(Option.fromUndefinedOr(s.lines.get('c0'))), (x) => x.head),
          () => -1,
        ),
      );
      const from = 'head unread, from crown-to-soles';
      const read = scaleSamples(planned, [lead, guest], 'lead');
      expect(
        read.samples.map((s) => [s.at, Number(Option.getOrElse(s.value, () => -1).toFixed(9))]),
      ).toEqual([
        [
          `guest frame 0 (u: ${from}; lead c0)`,
          Number(((g.head * g.ratio) / (lc0 ?? 1)).toFixed(9)),
        ],
        [
          `guest frame 1 (c0; lead u: ${from})`,
          Number(((gc0 ?? 1) / (l.head * l.ratio)).toFixed(9)),
        ],
        [
          `guest frame 2 (u: ${from}; lead u: ${from})`,
          Number(((g.head * g.ratio) / (l.head * l.ratio)).toFixed(9)),
        ],
      ]);
      expect(read.fallbacks).toEqual(read.samples.map((s) => s.at));
    }
  });

  test("names every frame the scale bar read from crown-to-soles in verdict.md, one INFO line each, and none for a frame read at its cell's head", () => {
    const lead = { name: 'lead', z: 1, lines: new Map([['a', headed(100, 500)]]) };
    const man = {
      name: 'man',
      z: 1,
      lines: new Map([
        ['neutral', headed(100, 500)],
        ['turn', unheaded(500)],
      ]),
    };
    const planned = ['neutral', 'turn', 'turn'].map((cell, index) =>
      plannedAt(index, 1, [
        posed({ name: 'lead', cell: 'a', scale: 1 }),
        posed({ name: 'man', cell, scale: 1 }),
      ]),
    );
    const read = scaleSamples(planned, [lead, man], 'lead');
    const text = verdictText(verdictOf(BARS, { ...ALL_PASS, scale: read.samples }), [
      ...scaleInfo(read),
    ]);
    expect(text.split('\n').filter((line) => line.startsWith('INFO'))).toEqual([
      'INFO scale fallback: man frame 1 (turn: head unread, from crown-to-soles; lead a)',
      'INFO scale fallback: man frame 2 (turn: head unread, from crown-to-soles; lead a)',
    ]);
    expect(text).toContain('PASS scale 1 ');
  });
});

describe('heightSamples', () => {
  test('reads 0 for a figure that holds its size while the camera zooms, and its own change over generated heights and zooms otherwise', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const draw = rng(seed);
      const z = 0.6 + draw() * 1.4;
      const height = 200 + draw() * 300;
      const frames = Array.from({ length: 2 + Math.floor(draw() * 8) }, (_, frame) => ({
        frame,
        plane: (1 + draw() * 0.12) ** (1 / z),
        own: 1 + (draw() - 0.5) * 0.06 * Number(seed % 2 === 0),
      }));
      const reads = frames.map((f) =>
        frameRead({
          name: 'f',
          frame: f.frame,
          zoom: f.plane,
          read: readOf(linesOfHeight(0, Math.round(height * f.own * f.plane) - 1, 20)),
        }),
      );
      const own = frames.map((f) => Math.round(height * f.own * f.plane) / f.plane);
      const median = own.toSorted((a, b) => a - b)[own.length >> 1] ?? 1;
      const value = Option.getOrElse(heightSamples(reads)[0]?.value ?? Option.none(), () => -1);
      expect(value).toBeCloseTo((Math.max(...own) - Math.min(...own)) / median, 9);
      if (seed % 2 === 1) expect(value).toBeLessThan(0.006);
    }
  });

  test("spreads each figure's crown-to-soles over its plane zoom across its whole unsquashed frames", () => {
    const reads = [
      frameRead({ name: 'f', frame: 0, read: readOf(linesOfHeight(0, 99, 20)) }),
      frameRead({ name: 'f', frame: 1, zoom: 1.07, read: readOf(linesOfHeight(0, 106, 20)) }),
      frameRead({ name: 'f', frame: 2, read: readOf(linesOfHeight(0, 101, 20)) }),
      frameRead({ name: 'f', frame: 3, squashed: true, read: readOf(linesOfHeight(0, 50, 20)) }),
    ];
    const values = heightSamples(reads).map((s) => Option.getOrElse(s.value, () => -1));
    expect(values).toHaveLength(1);
    expect(values[0] ?? -1).toBeCloseTo(0.02, 9);
  });
});

describe('lightSamples', () => {
  test('reads a figure whose whole frames hold no interior pixel as unread, though another figure is lit (round 1, M3)', () => {
    const read = readOf(linesOfHeight(0, 9, 3));
    const samples = lightSamples([
      frameRead({ name: 'lead', frame: 0, read }),
      frameRead({ name: 'guest', frame: 0, read: { ...read, interior: 0, litInterior: 0 } }),
    ]);
    expect(samples).toEqual([
      { at: 'lead frame 0', value: Option.some(1) },
      { at: 'guest frame 0: no interior pixel', value: Option.none() },
    ]);
    expect(verdictOf(BARS, { ...ALL_PASS, light: samples }).passed).toBe(BARS.length - 1);
  });

  test('skips a cut-off frame with no interior and a frame the figure is not in, and reads unread a figure with no frame at all', () => {
    const read = readOf(linesOfHeight(0, 9, 3));
    const gone: FigureRead = {
      ...read,
      lines: Option.none(),
      whole: false,
      interior: 0,
      litInterior: 0,
    };
    expect(
      lightSamples([
        frameRead({ name: 'lead', frame: 0, read }),
        frameRead({
          name: 'lead',
          frame: 1,
          read: { ...read, whole: false, interior: 0, litInterior: 0 },
        }),
        frameRead({ name: 'lead', frame: 2, read: gone }),
        frameRead({ name: 'guest', frame: 0, read: gone }),
      ]),
    ).toEqual([
      { at: 'lead frame 0', value: Option.some(1) },
      { at: 'guest: no frame with an interior pixel', value: Option.none() },
    ]);
  });
});

describe('stepSamples', () => {
  test("reads a step only where the drawn key changes, a new cell or a blink's eyes coming and going, each figure apart, and unread where a key has no lit cell read", () => {
    const skin = new Map([[1, { rgb: SKIN, count: 500 }]]);
    const darker = new Map([[1, { rgb: [SKIN[0] - 9, SKIN[1], SKIN[2]] as const, count: 500 }]]);
    const frames = [
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'b', 'b'],
      ['b', 'b', 'c'],
      ['b', 'b', 'b'],
    ] as const;
    const planned = frames.map(([cell, eyes, other], index) =>
      plannedAt(index, 1, [
        posed({ name: 'f', cell, eyes, scale: 1 }),
        posed({ name: 'g', cell: other, scale: 1 }),
      ]),
    );
    const medians = new Map([
      [
        'f',
        new Map([
          ['a', skin],
          ['a~b', darker],
          ['b', skin],
        ]),
      ],
      [
        'g',
        new Map([
          ['a', skin],
          ['b', skin],
        ]),
      ],
    ]);
    const step = deltaE(SKIN, [SKIN[0] - 9, SKIN[1], SKIN[2]]);
    expect(stepSamples(planned, medians)).toEqual([
      { at: 'f a -> a~b frame 2', value: Option.some(step) },
      { at: 'f a~b -> b frame 3', value: Option.some(step) },
      { at: 'g a -> b frame 2', value: Option.some(0) },
      { at: 'g b -> c frame 3: a key with no lit cell read', value: Option.none() },
      { at: 'g c -> b frame 4: a key with no lit cell read', value: Option.none() },
    ]);
  });
});

describe('lightSamples over frames', () => {
  test('reads the light share of every frame a figure shows in', () => {
    const read = readOf(linesOfHeight(0, 9, 3));
    const reads = [
      frameRead({ name: 'f', frame: 0, cell: 'a', read }),
      frameRead({ name: 'f', frame: 1, cell: 'a', read }),
      frameRead({ name: 'f', frame: 2, cell: 'b', read: { ...read, litInterior: 9 } }),
    ];
    expect(lightSamples(reads).map((s) => s.value)).toEqual([
      Option.some(1),
      Option.some(1),
      Option.some(0.9),
    ]);
  });
});

describe('proportionSamples', () => {
  const cell = (key: string, l: Lines) => ({ key, lines: Option.some(l) });

  test('spreads each line the palette has roles for over the median height, skipping a line no cell reads', () => {
    const samples = proportionSamples(
      'm',
      [
        cell('a', linesOfHeight(0, 99, 20)),
        cell('b', linesOfHeight(0, 99, 22)),
        cell('c', linesOfHeight(1, 100, 20)),
      ],
      PAINTS,
    );
    expect(samples.map((s) => [s.at, Option.getOrElse(s.value, () => -1)])).toEqual([
      ['m soles', 0.01],
      ['m hem', 0.01],
      ['m head', 0.02],
    ]);
  });

  test('reads a line its palette has the roles for as unread when no cell reads it, and skips a line it has no role for (round 1, M3)', () => {
    const sashed = paintsOf({
      ...PALETTE,
      parts: [...PALETTE.parts, { name: 'sash', base: '#eadcc2', role: 'sash' }],
    });
    const cells = [cell('a', linesOfHeight(0, 99, 20)), cell('b', linesOfHeight(0, 99, 20))];
    const samples = proportionSamples('m', cells, sashed);
    expect(samples.find((s) => Option.isNone(s.value))?.at).toBe(
      'm sash top: unread in every cell',
    );
    expect(verdictOf(BARS, { ...ALL_PASS, proportions: samples }).passed).toBe(BARS.length - 1);
    expect(proportionSamples('m', cells, PAINTS).every((s) => Option.isSome(s.value))).toBe(true);
  });

  test('over generated palettes and cells: unread exactly when a line its roles ask for is missing from any cell', () => {
    const lines = ['hem', 'sashTop'] as const;
    for (let seed = 1; seed <= 60; seed++) {
      const draw = rng(seed);
      const sash = draw() < 0.5;
      const paints = paintsOf({
        ...PALETTE,
        parts: [
          ...PALETTE.parts,
          ...[{ name: 'sash', base: '#eadcc2', role: 'sash' as const }].filter(() => sash),
        ],
      });
      const cells = Array.from({ length: 1 + Math.floor(draw() * 6) }, (_, i) => {
        const missing = lines.filter(() => draw() < 0.2);
        const l: Lines = {
          ...linesOfHeight(0, 99, 20),
          sashTop: Option.some(40),
          ...Object.fromEntries(missing.map((k) => [k, Option.none()])),
        };
        return { key: `c${i}`, lines: Option.some(l), missing };
      });
      const asked = cells.some(
        (c) => c.missing.includes('hem') || (sash && c.missing.includes('sashTop')),
      );
      const samples = proportionSamples('m', cells, paints);
      expect([seed, samples.some((s) => Option.isNone(s.value))]).toEqual([seed, asked]);
    }
  });

  test('reads a line read in some cells and not others as unread', () => {
    const noHem: Lines = { ...linesOfHeight(0, 100, 20), hem: Option.none() };
    const samples = proportionSamples(
      'm',
      [cell('a', linesOfHeight(0, 100, 20)), cell('b', noHem)],
      PAINTS,
    );
    expect(samples.find((s) => Option.isNone(s.value))?.at).toBe('m hem: unread in b');
  });
});
