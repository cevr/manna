import { describe, expect, test } from 'bun:test';
import { Boolean as Bool, Option, Result } from 'effect';
import { type PartCut, cutParts } from '../core/part-sheet.ts';
import type { Raster } from '../core/raster.ts';
import {
  type HiddenMeasures,
  domainOf,
  hiddenOf,
  layAnswer,
  missedBars,
  rankOrder,
} from './part-sheet-lay.ts';

type Rgb = readonly [number, number, number];
type Box = { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };

const W = 48;
const PAPER: Rgb = [244, 232, 212];
const OLIVE: Rgb = [150, 140, 100];
/** The sleeve's cream: what a speck of the kept arm left in the paint shows. */
const CREAM: Rgb = [217, 191, 165];
/** A grey of the olive's lightness: shade with no colour. */
const GREY: Rgb = [138, 138, 138];
/** The ink of an outline drawn in the paint. */
const INK: Rgb = [70, 58, 46];
/** A skin beside the olive: a second material of the torso. */
const SKIN: Rgb = [214, 160, 128];
/** A light tunic: the cloth the robe and most of the torso keep. */
const TUNIC: Rgb = [225, 215, 190];
/** The olive 5.3 L* lighter: a fleck of fine grain, under the speck's 12 L* and over the grain's 4. */
const FLECK: Rgb = [164, 154, 114];

const TORSO: Box = { x0: 6, y0: 4, x1: 42, y1: 44 };
const ARM: Box = { x0: 18, y0: 8, x1: 30, y1: 40 };
const inside = (b: Box, x: number, y: number) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1;

const rasterOf = (colour: (x: number, y: number) => Rgb): Raster => {
  const rgba = new Uint8Array(W * W * 4);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) rgba.set([...colour(x, y), 255], (y * W + x) * 4);
  return { width: W, height: W, rgba };
};

const FIGURE = Uint8Array.from({ length: W * W }, (_, i) =>
  Number(inside(TORSO, i % W, Math.floor(i / W))),
);
const corners = (b: Box): ReadonlyArray<readonly [number, number]> => [
  [b.x0, b.y0],
  [b.x1, b.y0],
  [b.x1, b.y1],
  [b.x0, b.y1],
];

type Paint = (x: number, y: number) => Rgb;
type Still = { readonly name: string; readonly polygon: ReadonlyArray<readonly [number, number]> };

/**
 * A torso of `cloth` (flat olive unless given), cut into the `still` parts
 * (one torso unless given), with a cream arm in `arm` in front of it that
 * moves, and okra's answer laid on it: the view with the arm's place
 * painted, the cloth at its edge and `inner` more than `margin` px in from
 * it (2 unless given, where the seam never reads).
 */
const layOn =
  (
    arm: Box,
    {
      cloth = (): Rgb => OLIVE,
      margin = 2,
      still = [{ name: 'torso', polygon: corners(TORSO) }],
    }: { cloth?: Paint; margin?: number; still?: ReadonlyArray<Still> } = {},
  ) =>
  (inner: Paint) => {
    const torso = (x: number, y: number) =>
      Bool.match(inside(TORSO, x, y), { onTrue: () => cloth(x, y), onFalse: () => PAPER });
    const view = rasterOf((x, y) =>
      Bool.match(inside(arm, x, y), { onTrue: () => CREAM, onFalse: () => torso(x, y) }),
    );
    const cut: PartCut = {
      parts: [
        { name: 'arm', take: [{ polygon: corners(arm) }] },
        ...still.map(({ name, polygon }) => ({ name, take: [{ polygon }] })),
      ],
    };
    const m = margin;
    const within = { x0: arm.x0 + m, y0: arm.y0 + m, x1: arm.x1 - m, y1: arm.y1 - m };
    const answer = rasterOf((x, y) =>
      Bool.match(inside(within, x, y), { onTrue: () => inner(x, y), onFalse: () => torso(x, y) }),
    );
    const sheet = Result.getOrThrow(cutParts(view, cut, { figure: FIGURE }));
    const hidden = hiddenOf(sheet, ['arm']);
    const target = {
      view,
      sheet,
      hidden,
      domain: domainOf(sheet, hidden),
      moving: ['arm'],
      pad: { s: 1, dx: 0, dy: 0 },
      portrait: { width: W, height: W },
    };
    return Result.getOrThrow(layAnswer(target, answer)).measures;
  };

const laid = layOn(ARM);
const olive = () => OLIVE;

describe('the part sheet lay', () => {
  test('paint flecked with the kept sleeve misses the speck bar; smooth paint meets it', () => {
    // a cream pixel every 3 px across the paint: the sleeve's colour left in the torso
    const flecked = laid((x, y) =>
      Bool.match((x - ARM.x0) % 3 === 2 && (y - ARM.y0) % 3 === 2, {
        onTrue: () => CREAM,
        onFalse: () => OLIVE,
      }),
    );
    const smooth = laid(olive);
    expect(flecked.speck).toEqual([
      expect.objectContaining({ part: 'torso', under: 'arm', verdict: 'outside' }),
    ]);
    expect(missedBars(flecked)).toContain('speck');
    expect(smooth.speck).toEqual([
      expect.objectContaining({ part: 'torso', under: 'arm', verdict: 'within' }),
    ]);
    expect(missedBars(smooth)).not.toContain('speck');
  });

  test('paint clumped with the kept sleeve, 2 px across every 5 px, misses the speck bar', () => {
    const clumped = laid((x, y) =>
      Bool.match((x - ARM.x0) % 5 < 2 && (y - ARM.y0) % 5 < 2, {
        onTrue: () => CREAM,
        onFalse: () => OLIVE,
      }),
    );
    expect(clumped.speck).toEqual([expect.objectContaining({ verdict: 'outside' })]);
    expect(missedBars(clumped)).toContain('speck');
  });

  test('a thin outline in the paint, dotted along its edge or drawn across it, is not speckle', () => {
    const edge = (x: number, y: number) =>
      (x === ARM.x0 || x === ARM.x1 - 1 || y === ARM.y0 || y === ARM.y1 - 1) && (x + y) % 2 === 0;
    // a steep line, one step across for every four down, from the top of the arm to its foot
    const across = (x: number, y: number) => x === ARM.x0 + 2 + Math.floor((y - ARM.y0) / 4);
    const outlined = layOn(ARM, { margin: 0 })((x, y) =>
      Bool.match(edge(x, y) || across(x, y), { onTrue: () => INK, onFalse: () => OLIVE }),
    );
    expect(outlined.speck).toEqual([expect.objectContaining({ verdict: 'within' })]);
    expect(missedBars(outlined)).not.toContain('speck');
  });

  test('paint of two materials, each matching its cloth, with a cell too sparse to read, meets the speck and drift bars', () => {
    // the olive gives way to skin inside the first chroma cell; the arm's cells below y 24 hold 2 rows
    const cloth = (x: number): Rgb =>
      Bool.match(x < 21, { onTrue: () => OLIVE, onFalse: () => SKIN });
    const mixed = layOn({ x0: 18, y0: 8, x1: 30, y1: 26 }, { cloth })((x) => cloth(x));
    expect(mixed.speck).toEqual([expect.objectContaining({ verdict: 'within' })]);
    expect(mixed.drift.chroma).toEqual([expect.objectContaining({ cells: 2, verdict: 'within' })]);
    expect(missedBars(mixed)).not.toContain('speck');
    expect(missedBars(mixed)).not.toContain('drift');
  });

  test('paint with fine grain in a cell misses the grain bar over smooth cloth; paint as grainy as its cloth meets it', () => {
    // one pixel in 14, 5.3 L* lighter than the olive: fine grain the part's pooled grain reads as smooth;
    // the arm lies in the 24 px cells x 24..47, y 0..23 and y 24..47, 150 read pixels each
    const fleck = (x: number, y: number): Rgb =>
      Bool.match((x + 5 * y) % 14 === 0, { onTrue: () => FLECK, onFalse: () => OLIVE });
    const arm = { x0: 24, y0: 8, x1: 36, y1: 40 };
    const grainy = layOn(arm, { margin: 0 })(fleck);
    const asCloth = layOn(arm, { margin: 0, cloth: fleck })(fleck);
    expect(grainy.grain).toEqual([expect.objectContaining({ part: 'torso', verdict: 'outside' })]);
    expect(missedBars(grainy)).toContain('grain');
    expect(asCloth.grain).toEqual([expect.objectContaining({ part: 'torso', verdict: 'within' })]);
    expect(missedBars(asCloth)).not.toContain('grain');
  });

  test('paint greyer than the cloth beside it misses the drift bar, though its seam matches', () => {
    const grey = laid(() => GREY);
    const kept = laid(olive);
    expect(grey.seam.deltaE._tag === 'Some' && grey.seam.deltaE.value).toBe(0);
    expect(grey.drift.chroma).toEqual([
      expect.objectContaining({ part: 'torso', under: 'arm', verdict: 'outside' }),
    ]);
    expect(missedBars(grey)).toContain('drift');
    expect(kept.drift.chroma).toEqual([
      expect.objectContaining({ part: 'torso', under: 'arm', verdict: 'within' }),
    ]);
    expect(missedBars(kept)).not.toContain('drift');
  });

  test('a region with one pixel fewer than the speck floor misses the speck bar and ranks below one at the floor', () => {
    // the speck is read inside the region's edge ring: 10 × 10 px of a 12 × 12 region, 9 × 11 of 11 × 13
    const atFloor = layOn({ x0: 8, y0: 8, x1: 20, y1: 20 })(olive);
    const under = layOn({ x0: 8, y0: 8, x1: 19, y1: 21 })(olive);
    expect(atFloor.speck).toEqual([
      expect.objectContaining({ painted: { share: 0, px: 100 }, verdict: 'within' }),
    ]);
    expect(missedBars(atFloor)).not.toContain('speck');
    expect(under.speck).toEqual([
      expect.objectContaining({ painted: { share: 0, px: 99 }, verdict: 'unverified' }),
    ]);
    expect(missedBars(under)).toContain('speck');
    expect(rankOrder(under, atFloor)).toBe(1);
  });

  test('a region whose cells hold one pixel fewer than the chroma floor misses the drift bar and ranks below one at the floor', () => {
    const atFloor = layOn({ x0: 8, y0: 8, x1: 13, y1: 16 })(olive);
    const under = layOn({ x0: 8, y0: 8, x1: 11, y1: 21 })(olive);
    expect(atFloor.drift.chroma).toEqual([
      expect.objectContaining({ painted: expect.objectContaining({ px: 40 }), verdict: 'within' }),
    ]);
    expect(missedBars(atFloor)).not.toContain('drift');
    expect(under.drift.chroma).toEqual([
      expect.objectContaining({ cells: 0, verdict: 'unverified' }),
    ]);
    expect(missedBars(under)).toContain('drift');
    expect(rankOrder(under, atFloor)).toBe(1);
  });

  // a torso over a robe that meets it at y 26 behind the arm; the torso keeps an olive vest right of the arm, past the line
  const torsoOverRobe: ReadonlyArray<Still> = [
    {
      name: 'torso',
      polygon: [
        [6, 4],
        [42, 4],
        [42, 44],
        [30, 44],
        [30, 26],
        [6, 26],
      ],
    },
    { name: 'robe', polygon: corners({ x0: 6, y0: 26, x1: 30, y1: 44 }) },
  ];

  test('paint toned into a step across a part line the answer paints flat misses the step bar', () => {
    // the torso's paint takes the vest beside it into its tone, the robe's does not
    const cloth = (x: number): Rgb =>
      Bool.match(x >= 30, { onTrue: () => OLIVE, onFalse: () => TUNIC });
    const stepped = layOn(ARM, { cloth, still: torsoOverRobe })(() => TUNIC);
    expect(stepped.step).toEqual([
      expect.objectContaining({
        part: 'torso',
        meets: 'robe',
        under: 'arm',
        answer: 0,
        verdict: 'outside',
      }),
    ]);
    expect(missedBars(stepped)).toContain('step');
  });

  test('paint that steps across a part line as the answer does meets the step bar', () => {
    const cloth = (_: number, y: number): Rgb =>
      Bool.match(y < 26, { onTrue: () => OLIVE, onFalse: () => TUNIC });
    const kept = layOn(ARM, { cloth, still: torsoOverRobe })(cloth);
    expect(kept.step).toEqual([
      expect.objectContaining({ part: 'torso', meets: 'robe', under: 'arm', verdict: 'within' }),
    ]);
    expect(missedBars(kept)).not.toContain('step');
  });

  /** A part's fine grain read in two cells, its paint as grainy as its cloth. */
  const fineWithin = {
    painted: { share: 0.01, px: 300 },
    kept: { share: 0.01, px: 900 },
    cells: 2,
  };
  /** A measure that meets every bar, with the reads `over` names. */
  const measured = (over: Partial<HiddenMeasures>): HiddenMeasures => ({
    seam: { deltaE: Option.some(4), pairs: 80 },
    drift: { deltaE: 3, px: 900, chroma: [] },
    grain: [
      {
        part: 'robe',
        painted: { robust: 1.5, plain: 2, n: 200 },
        kept: { robust: 1.6, plain: 2, n: 200 },
        fine: fineWithin,
        verdict: 'within',
      },
    ],
    speck: [],
    step: [],
    paintUnder: [{ part: 'armRight', px: 900 }],
    paintedPx: 900,
    visibleAtRest: 0,
    recomposeByteEqual: true,
    ...over,
  });
  const robeChroma = (painted: number, kept: number) => ({
    part: 'robe',
    under: 'armRight',
    painted: { chroma: painted, px: 300 },
    kept: { chroma: kept, px: 300 },
    cells: 2,
    verdict: 'outside' as const,
  });
  const robeStep = (laid: number, answer: number) => ({
    part: 'robe',
    meets: 'torso',
    under: 'armRight',
    laid,
    answer,
    pairs: 27,
    verdict: 'outside' as const,
  });

  test('paint far greyer than its cloth ranks below paint that misses two bars by a little', () => {
    // sower threeQuarterRight, measured: white robe paint (chroma 0.01 against 22.11) against a greyer torso and a step of -7.15 against -0.2
    const far = measured({ drift: { deltaE: 3, px: 900, chroma: [robeChroma(0.01, 22.11)] } });
    const near = measured({
      drift: { deltaE: 3, px: 900, chroma: [robeChroma(7.43, 13.81)] },
      step: [robeStep(-7.15, -0.2)],
    });
    expect(missedBars(far)).toEqual(['drift']);
    expect(missedBars(near)).toEqual(['drift', 'step']);
    expect(rankOrder(near, far)).toBe(-1);
  });

  test('an answer whose step went unread ranks below one whose step misses by a little', () => {
    // feast-mother back, measured: a line read on 3 pairs against a line read on 9, stepping -7.87 against -0.57
    const unread = measured({
      step: [{ ...robeStep(-8.81, -0.13), pairs: 3, verdict: 'unverified' }],
    });
    const near = measured({ step: [robeStep(-7.87, -0.57)] });
    expect(missedBars(unread)).toEqual(['step']);
    expect(missedBars(near)).toEqual(['step']);
    expect(rankOrder(near, unread)).toBe(-1);
  });

  test('of two answers whose misses are the same size, the one that misses one bar more ranks below', () => {
    // the step 2.5 past its bar of 5 and the grain 0.25 past its bar of 0.5: each half its bar again
    const step = measured({ step: [robeStep(7.5, 0)] });
    const both = measured({
      step: [robeStep(7.5, 0)],
      grain: [
        {
          part: 'robe',
          painted: { robust: 0.56, plain: 1, n: 200 },
          kept: { robust: 1.31, plain: 2, n: 200 },
          fine: fineWithin,
          verdict: 'outside',
        },
      ],
    });
    expect(missedBars(both)).toEqual(['grain', 'step']);
    expect(rankOrder(both, step)).toBe(1);
  });
});
