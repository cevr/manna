import { rng } from '@manna/film/core';
import type { Raster } from '@manna/film/tools';
import { Option } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { deltaE, hexOf, type Lines, type Palette, paintsOf, type Rgb } from '../sheet.ts';
import { BARS } from './bars.ts';
import {
  colourStep,
  type FigureRead,
  type FrameRead,
  heightSamples,
  lightSamples,
  paletteShare,
  pocketCount,
  proportionSamples,
  readFigure,
  scaleSamples,
  stepSamples,
} from './measures.ts';
import { type Measured, one, verdictOf } from './verdict.ts';

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

  test("takes each paint's median over its area, the pixels whose four neighbours are that paint too: a one-pixel outline has none", () => {
    const read = readFigure(figureIn(frame, { x0: 10, y0: 5, w: 30, h: 60 }), PAINTS);
    expect(read.medians.has(0)).toBe(false);
    expect(Option.map(Option.fromUndefinedOr(read.medians.get(1)), (m) => m.rgb)).toEqual(
      Option.some(SKIN),
    );
  });
});

describe('colourStep', () => {
  const frame = { width: 60, height: 80 };
  const box = { x0: 10, y0: 5, w: 30, h: 60 };

  test('is 0 between two renders of the same paints, and the shift of a paint that drifts', () => {
    const a = readFigure(figureIn(frame, box), PAINTS).medians;
    const b = readFigure(figureIn(frame, { ...box, x0: 20 }), PAINTS).medians;
    const drifted: Rgb = [ROBE[0] + 4, ROBE[1], ROBE[2]];
    const c = readFigure(figureIn(frame, box, drifted), PAINTS).medians;
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
    const step = colourStep(
      readFigure(checker(0), PAINTS).medians,
      readFigure(checker(6), PAINTS).medians,
    );
    expect(Option.getOrElse(step, () => -1)).toBeCloseTo(
      deltaE([ROBE[0] + 6, ROBE[1], ROBE[2]], [ROBE[0] + 12, ROBE[1], ROBE[2]]),
      9,
    );
  });

  test("over generated paint regions, layouts and shifts: the worst ΔE between each paint's median over its area", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const draw = rng(seed);
      const int = (a: number, b: number) => a + Math.floor(draw() * (b - a + 1));
      const layout = int(0, 2);
      const shift: Rgb = [int(-4, 4), int(-4, 4), int(-4, 4)];
      const rows = int(8, 20);
      const band = int(3, 6);
      const size = 40;
      const paintAt = (x: number, y: number): 1 | 2 => {
        if (layout === 0 && (Math.floor(x / band) + Math.floor(y / band)) % 2 === 0) return 1;
        if (layout === 1 && Math.floor(y / band) % 2 === 0) return 1;
        if (layout === 2 && y < rows) return 1;
        return 2;
      };
      const inArea = (x: number, y: number): boolean =>
        x > 0 &&
        y > 0 &&
        x < size - 1 &&
        y < size - 1 &&
        [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ].every(([u = 0, v = 0]) => paintAt(u, v) === paintAt(x, y));
      const frameOf = (k: 0 | 1) => {
        const truth = new Map<1 | 2, Array<Rgb>>([
          [1, []],
          [2, []],
        ]);
        const raster = pictureOf(size, size, (x, y) => {
          const p = paintAt(x, y);
          const base = [SKIN, ROBE][p - 1] ?? SKIN;
          const wobble = ((x * 7 + y * 3 + k) % 5) - 2;
          const c: Rgb = [
            base[0] + shift[0] * k + wobble,
            base[1] + shift[1] * k,
            base[2] + shift[2] * k,
          ];
          if (inArea(x, y)) truth.get(p)?.push(c);
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
      const got = colourStep(
        readFigure(a.raster, PAINTS).medians,
        readFigure(b.raster, PAINTS).medians,
      );
      expect([seed, Number(Option.getOrElse(got, () => -1).toFixed(9))]).toEqual([
        seed,
        Number(oracle.toFixed(9)),
      ]);
    }
  });

  test('reads none when the renders share no paint of 150 px', () => {
    const small = readFigure(figureIn(frame, { x0: 10, y0: 5, w: 8, h: 9 }), PAINTS).medians;
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

const readOf = (lines: Lines, whole = true): FigureRead => ({
  whole,
  lines: Option.some(lines),
  medians: new Map(),
  interior: 10,
  litInterior: 10,
});

const frameRead = (
  r: Partial<FrameRead> & Pick<FrameRead, 'name' | 'frame' | 'read'>,
): FrameRead => ({
  cell: 'a',
  z: 1,
  zoom: 1,
  squashed: false,
  ...r,
});

/** A guest and the lead in generated frames: the camera's zoom, the guest's depth, the lead's head and the guest's head as a share of what the bar wants, each frame. */
const scaleCase = (seed: number) => {
  const draw = rng(seed);
  const z = 0.6 + draw() * 1.4;
  return Array.from({ length: 2 + Math.floor(draw() * 6) }, (_, frame) => {
    const camera = 1 + draw() * 0.12;
    const leadHead = 60 + draw() * 80;
    const share = [0.94, 0.951, 1, 1.049, 1.06][Math.floor(draw() * 5)] ?? 1;
    const wanted = leadHead * (1 / z) * (camera ** (1 / z) / camera);
    return { frame, z, camera, leadHead, guestHead: wanted * share, share };
  });
};

describe('scaleSamples', () => {
  test("judges each figure against the same frame's lead: head ÷ (the lead's head × 1/z × zoom^(1/z) ÷ zoom), over generated depths, zooms and heads", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const frames = scaleCase(seed);
      const reads = frames.flatMap((f) => [
        frameRead({
          name: 'lead',
          frame: f.frame,
          zoom: f.camera,
          read: readOf(linesOfHeight(0, 400, f.leadHead)),
        }),
        frameRead({
          name: 'guest',
          frame: f.frame,
          z: f.z,
          zoom: f.camera ** (1 / f.z),
          read: readOf(linesOfHeight(0, 400, f.guestHead)),
        }),
      ]);
      const values = scaleSamples(reads, 'lead').map((s) => Option.getOrElse(s.value, () => -1));
      expect(values.map((v) => Number(v.toFixed(9)))).toEqual(
        frames.map((f) =>
          Number(
            (f.guestHead / (f.leadHead * (1 / f.z) * (f.camera ** (1 / f.z) / f.camera))).toFixed(
              9,
            ),
          ),
        ),
      );
      const verdict = verdictOf(BARS, { ...ALL_PASS, scale: scaleSamples(reads, 'lead') });
      expect(verdict.checks.find((c) => c.id === 'scale')?.pass).toBe(
        frames.every((f) => Math.abs(f.share - 1) <= 0.05),
      );
    }
  });

  test("fails a guest steady against the lead's median but off the same frame's lead (round 1, M1)", () => {
    const reads = [95.1, 100, 100].flatMap((lead, frame) => [
      frameRead({ name: 'lead', frame, read: readOf(linesOfHeight(0, 400, lead)) }),
      frameRead({ name: 'guest', frame, read: readOf(linesOfHeight(0, 400, 104.9)) }),
    ]);
    const samples = scaleSamples(reads, 'lead');
    expect(samples[0]).toEqual({ at: 'guest frame 0', value: Option.some(104.9 / 95.1) });
    expect(verdictOf(BARS, { ...ALL_PASS, scale: samples }).passed).toBe(BARS.length - 1);
  });

  test('skips a frame where the guest or the lead is squashed or cut off, and reads unread where either head is not read or a guest has no such frame', () => {
    const noHead: Lines = { ...linesOfHeight(0, 400, 100), head: Option.none() };
    const reads = [
      frameRead({ name: 'lead', frame: 0, read: readOf(linesOfHeight(0, 400, 100)) }),
      frameRead({ name: 'g', frame: 0, read: readOf(linesOfHeight(0, 400, 1), false) }),
      frameRead({ name: 'lead', frame: 1, squashed: true, read: readOf(linesOfHeight(0, 400, 1)) }),
      frameRead({ name: 'g', frame: 1, read: readOf(linesOfHeight(0, 400, 1)) }),
      frameRead({ name: 'lead', frame: 2, read: readOf(linesOfHeight(0, 400, 100)) }),
      frameRead({ name: 'g', frame: 2, read: readOf(noHead) }),
      frameRead({ name: 'lead', frame: 3, read: readOf(noHead) }),
      frameRead({ name: 'g', frame: 3, read: readOf(linesOfHeight(0, 400, 100)) }),
      frameRead({ name: 'lead', frame: 4, read: readOf(linesOfHeight(0, 400, 100)) }),
      frameRead({ name: 'h', frame: 4, squashed: true, read: readOf(linesOfHeight(0, 400, 100)) }),
    ];
    expect(scaleSamples(reads, 'lead')).toEqual([
      { at: 'g frame 2: no head read, or no head of lead', value: Option.none() },
      { at: 'g frame 3: no head read, or no head of lead', value: Option.none() },
      { at: 'h: no frame where it and lead lie whole and unsquashed', value: Option.none() },
    ]);
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
          z,
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

describe('stepSamples and lightSamples', () => {
  test('reads a step only where the drawn cell changes, and the light share of every frame a figure shows in', () => {
    const medians = new Map([[1, { rgb: SKIN, count: 500 }]]);
    const read: FigureRead = { ...readOf(linesOfHeight(0, 9, 3)), medians };
    const reads = [
      frameRead({ name: 'f', frame: 0, cell: 'a', read }),
      frameRead({ name: 'f', frame: 1, cell: 'a', read }),
      frameRead({ name: 'f', frame: 2, cell: 'b', read: { ...read, litInterior: 9 } }),
    ];
    expect(stepSamples(reads)).toEqual([{ at: 'f a -> b frame 2', value: Option.some(0) }]);
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
