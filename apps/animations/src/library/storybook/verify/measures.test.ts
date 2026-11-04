import type { Raster } from '@manna/film/tools';
import { Option } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { hexOf, type Lines, type Palette, paintsOf, type Rgb } from '../sheet.ts';
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

  test('takes each median over the interior only, so a one-pixel outline in a paint never counts toward it', () => {
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

describe('scaleSamples', () => {
  test("brings each head to the focal plane (over its plane zoom, times its depth) and divides by the lead's median head", () => {
    const reads = [
      frameRead({ name: 'lead', frame: 0, read: readOf(linesOfHeight(0, 400, 100)) }),
      frameRead({ name: 'lead', frame: 1, read: readOf(linesOfHeight(0, 400, 104)), zoom: 1.04 }),
      frameRead({
        name: 'guest',
        frame: 0,
        z: 2,
        zoom: 1,
        read: readOf(linesOfHeight(0, 200, 46)),
      }),
      frameRead({
        name: 'guest',
        frame: 1,
        z: 2,
        zoom: 1.04 ** 0.5,
        read: readOf(linesOfHeight(0, 200, 50 * 1.04 ** 0.5)),
      }),
    ];
    const values = scaleSamples(reads, 'lead').map((s) => Option.getOrElse(s.value, () => -1));
    expect(values.map((v) => Number(v.toFixed(6)))).toEqual([1, 1, 0.92, 1]);
  });

  test('skips a squashed or cut-off frame, and reads unread where a whole head is not read', () => {
    const noHead: Lines = { ...linesOfHeight(0, 400, 100), head: Option.none() };
    const reads = [
      frameRead({ name: 'lead', frame: 0, read: readOf(linesOfHeight(0, 400, 100)) }),
      frameRead({ name: 'lead', frame: 1, squashed: true, read: readOf(linesOfHeight(0, 400, 1)) }),
      frameRead({ name: 'g', frame: 0, read: readOf(linesOfHeight(0, 400, 1), false) }),
      frameRead({ name: 'g', frame: 1, read: readOf(noHead) }),
    ];
    expect(scaleSamples(reads, 'lead')).toEqual([
      { at: 'lead frame 0', value: Option.some(1) },
      { at: 'g frame 1: no head read', value: Option.none() },
    ]);
  });
});

describe('heightSamples', () => {
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
