import { Option, Result } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { paintsOf } from '../sheet.ts';
import type { FigureFrame } from '../shot.ts';
import { BARS } from './bars.ts';
import {
  analysedOn,
  bodyCell,
  clipped,
  domainMisses,
  FRAME,
  spreadOf,
  viewOf,
} from './height.testing.ts';
import {
  type FrameRead,
  heightSamples,
  observeHeight,
  readFigure,
  scaleSamples,
} from './measures.ts';
import { ANALYSIS_MARGIN, analysisBoxOf } from './rows.ts';
import { verdictOf } from './verdict.ts';

describe('the iio-b diagnosis oracle (diagnosis-height.test.ts), on the complete observation', () => {
  const paints = paintsOf({
    ink: '#140a05',
    parts: [{ name: 'robe', base: '#6e827d', role: 'garment' }],
  });
  const raster = (width: number, height: number, inside: (x: number, y: number) => boolean) => {
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        if (inside(x, y)) rgba.set([110, 130, 125, 255], (y * width + x) * 4);
      }
    return { width, height, rgba };
  };
  const spread = (reads: ReadonlyArray<FrameRead>) =>
    Option.getOrElse(heightSamples(reads)[0]?.value ?? Option.none(), () => -1);

  test('appending a steady side-cut cannot erase observed whole-frame growth', () => {
    const read = (frame: number, height: number, x0: number, y0 = 10): FrameRead => {
      const render = raster(
        100,
        260,
        (x, y) => x >= x0 && x < x0 + 60 && y >= y0 && y < y0 + height,
      );
      const drawn = {
        raster: raster(62, height + 2, (x, y) => x >= 1 && x <= 60 && y >= 1 && y <= height),
        ax: 30.5,
        ay: 201,
      };
      const complete = analysedOn(drawn, { x: x0 + 29.5, y: y0 + 200, sx: 1, sy: 1 }).raster;
      return {
        name: 'f',
        cell: 'a',
        frame,
        zoom: 1,
        squashed: false,
        read: readFigure(render, paints),
        height: observeHeight(complete),
      };
    };
    const a = read(0, 200, 10);
    const b = read(1, 208, 10);
    const cut = read(2, 200, -20);
    expect(cut.read.whole).toBe(false);
    expect(spread([a, b])).toBeGreaterThan(0.02);
    expect(spread([a, b, cut])).toBeGreaterThan(0.02);
    expect(spread([a, read(1, 208, 10, -50)])).toBeGreaterThan(0.02);
  });

  test('an unchanged top-cut silhouette cannot turn feet into the original crown', () => {
    const inside = (x: number, y: number) => {
      if (y < 1 || y > 200) return false;
      if (y <= 40) return x >= 10 && x <= 50;
      if (y < 180) return x >= 20 && x <= 40;
      return (x >= 8 && x <= 28) || (x >= 32 && x <= 52);
    };
    const cell = raster(62, 202, inside);
    const render = raster(100, 260, (x, y) => inside(x - 10, y + 160));
    expect(readFigure(render, paints).whole).toBe(false);
    const value = Result.getSuccess(
      observeHeight(
        analysedOn({ raster: cell, ax: 30.5, ay: 201 }, { x: 40.5, y: 41, sx: 1, sy: 1 }).raster,
      ),
    );
    expect(
      Option.isNone(value) || Math.abs(Option.getOrElse(value, () => 0) / 200 - 1) <= 0.02,
    ).toBe(true);
  });
});

describe('observeHeight', () => {
  test('reads the crown in the head column, never a raised arm above it, and the soles below two feet apart', () => {
    const body = { top: 30, bottom: 529, lean: 0, arm: Option.some(18) };
    const cell = bodyCell(body, 44, 560, 22.5, 530);
    expect(
      Result.getSuccess(observeHeight(analysedOn(cell, { x: 100, y: 600, sx: 1, sy: 1 }).raster)),
    ).toEqual(Option.some(500));
  });

  test('reads unread a render that holds none of the figure, one its surface cut at any edge, or one whose edges never reach whole coverage', () => {
    const cell = bodyCell(
      { top: 30, bottom: 529, lean: 0, arm: Option.none() },
      44,
      560,
      22.5,
      530,
    );
    const { raster } = analysedOn(cell, { x: 100.3, y: 600.7, sx: 1.2, sy: 1.2 });
    expect(
      Result.isFailure(observeHeight({ ...raster, rgba: new Uint8Array(raster.rgba.length) })),
    ).toBe(true);
    for (let edge = 0; edge < 4; edge++)
      expect(Result.getFailure(observeHeight(clipped(raster, edge)))).toEqual(
        Option.some('its analysis render reaches the surface edge'),
      );
    const faint = (alpha: number) => {
      const rgba = raster.rgba.slice();
      for (let q = 3; q < rgba.length; q += 4) rgba[q] = Math.min(rgba[q] ?? 0, alpha);
      return observeHeight({ ...raster, rgba });
    };
    for (const alpha of [100, 200])
      expect(Result.getFailure(faint(alpha))).toEqual(
        Option.some('no crown or soles both half and wholly covered on its analysis render'),
      );
  });
});

describe('analysisBoxOf', () => {
  test('holds the whole placed cell, its margin and three times its blur clear, in whole px, wherever its anchor and extent lie', () => {
    const box = analysisBoxOf(
      { x: 10.25, y: -40.5, sx: 2, sy: -1.5 },
      { width: 30, height: 100, ax: 31, ay: -5 },
      1.5,
    );
    const m = ANALYSIS_MARGIN + 5;
    expect(box).toEqual({
      x: Math.floor(10.25 - 31 * 2) - m,
      y: Math.floor(-40.5 + 105 * -1.5) - m,
      width: Math.ceil(10.25 + (30 - 31) * 2) + m - (Math.floor(10.25 - 31 * 2) - m),
      height: Math.ceil(-40.5 - 5 * 1.5) + m - (Math.floor(-40.5 + 105 * -1.5) - m),
    });
  });
});

describe('render-height over the rule’s domain', () => {
  test('every path through the view (whole, each edge and the corner throughout, whole into and out of each edge, leaving and re-entering), grown by the plan or by its drawing’s soles or crown apart from its anchor, 3–4 %, at depths 1–3, pushes and pulls, draw scales, breaths and subpixel places: steady reads within 0.8 %, growth fails, a steady cut frame added never passes it, and one surface that cut the figure reads unread (shrinking: height-shrink.test.ts)', () => {
    expect(domainMisses(false)).toEqual([]);
  });

  test('names a view by the frame edges its extent crosses', () => {
    expect(
      [
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 0, y: -1, width: 10, height: 10 },
        { x: -1, y: -1, width: 10, height: 10 },
        { x: FRAME.width - 5, y: 0, width: 10, height: 10 },
        { x: 0, y: FRAME.height - 5, width: 10, height: 10 },
        { x: FRAME.width, y: 0, width: 10, height: 10 },
      ].map(viewOf),
    ).toEqual(['whole', 'top', 'corner', 'right', 'bottom', 'out']);
  });
});

describe('render-height keys, names and the scale bar', () => {
  const body = { top: 30, bottom: 529, lean: 0, arm: Option.none() };
  const frame = (
    name: string,
    frame: number,
    cell: string,
    bottom: number,
    x: number,
  ): FrameRead => {
    const drawn = bodyCell({ ...body, bottom }, 44, 600, 22.5, 530);
    const raster = analysedOn(drawn, { x, y: 700.4, sx: 1.25, sy: 1.25 }).raster;
    return {
      name,
      cell,
      frame,
      zoom: 1,
      squashed: false,
      read: { whole: true, lines: Option.none(), interior: 0, litInterior: 0 },
      height: observeHeight(raster),
    };
  };

  test('passes two keys of one sheet drawn 3 % apart, each held steady, and fails one key that grows 3 % (round 1, cold-letter)', () => {
    const keys = [
      frame('f', 0, 'front', 529, 50),
      frame('f', 1, 'front', 529, 80.5),
      frame('f', 2, 'down', 514, 50),
      frame('f', 3, 'down', 514, -20.3),
    ];
    expect(spreadOf(keys)).toBeLessThanOrEqual(0.004);
    const grows = [...keys, frame('f', 4, 'down', 529, 50)];
    expect(verdictOf(BARS, passingWith(heightSamples(grows))).passed).toBe(BARS.length - 1);
  });

  test('judges two figures of one member apart by name: the one that grows fails, the steady one passes', () => {
    const reads = [0, 1].flatMap((k) => [
      frame('man', k, 'a', 529, 50),
      frame('man-2', k, 'a', 529 + 16 * k, 50),
    ]);
    expect(
      heightSamples(reads).map((s) => [s.at, Option.getOrElse(s.value, () => -1) > 0.02]),
    ).toEqual([
      ['man/a over 2 frames', false],
      ['man-2/a over 2 frames', true],
    ]);
  });

  test('passes a figure held steadily twice too large, which the scale bar still fails: neither bar stands for the other', () => {
    const reads = [frame('big', 0, 'a', 529, 50), frame('big', 1, 'a', 529, 60.5)];
    expect(spreadOf(reads)).toBeLessThanOrEqual(0.004);
    const posed: FigureFrame = {
      name: 'big',
      layer: 'big',
      cell: 'a',
      eyes: 'a',
      zoom: 1,
      x: 0,
      y: 0,
      sx: 1,
      sy: 1,
      breath: 1,
      scale: 2,
    };
    const scale = scaleSamples(
      [{ index: 0, frame: { t: 0, camera: { t: 0, x: 0, y: 0, zoom: 1 }, figures: [posed] } }],
      [
        {
          name: 'big',
          z: 1,
          share: 1,
          lines: new Map([
            [
              'a',
              Option.some({
                top: 0,
                bottom: 499,
                headColumn: 0,
                centreColumn: 0,
                crown: 0,
                head: Option.some(100),
                hem: Option.none(),
                sashTop: Option.none(),
              }),
            ],
          ]),
        },
      ],
      100,
    );
    expect(scale.samples.map((s) => Option.getOrElse(s.value, () => -1))).toEqual([2]);
    expect(
      verdictOf(BARS, { ...passingWith(heightSamples(reads)), scale: scale.samples }).passed,
    ).toBe(BARS.length - 1);
  });
});

/** A run where every check but the height bar reads one passing value, and the height bar reads `samples`. */
const passingWith = (samples: ReturnType<typeof heightSamples>) => ({
  palette: [{ at: 'x', value: Option.some(1) }],
  pockets: [{ at: 'x', value: Option.some(0) }],
  'colour-step': [{ at: 'x', value: Option.some(0) }],
  proportions: [{ at: 'x', value: Option.some(0) }],
  scale: [{ at: 'x', value: Option.some(1) }],
  'one-sheet': [{ at: 'x', value: Option.some(0) }],
  light: [{ at: 'x', value: Option.some(1) }],
  'render-height': samples,
  determinism: [{ at: 'x', value: Option.some(0) }],
});
