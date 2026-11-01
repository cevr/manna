import { describe, expect, test } from 'bun:test';
import { Array as Arr, Boolean as Bool, Option, Result } from 'effect';
import { type PartCut, cutParts } from '../core/part-sheet.ts';
import type { Raster } from '../core/raster.ts';
import { domainOf, hiddenOf, layAnswer, missedBars, rankOf } from './part-sheet-lay.ts';

type Rgb = readonly [number, number, number];
type Box = { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };

const W = 48;
const PAPER: Rgb = [244, 232, 212];
const OLIVE: Rgb = [150, 140, 100];
/** The sleeve's cream: what a speck of the kept arm left in the paint shows. */
const CREAM: Rgb = [217, 191, 165];
/** A grey of the olive's lightness: shade with no colour. */
const GREY: Rgb = [138, 138, 138];

const TORSO: Box = { x0: 6, y0: 4, x1: 42, y1: 44 };
const ARM: Box = { x0: 18, y0: 8, x1: 30, y1: 40 };
const inside = (b: Box, x: number, y: number) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1;

/** The colour of the first box that holds the pixel, front to back; paper outside them all. */
const colourAt = (x: number, y: number, boxes: ReadonlyArray<readonly [Box, Rgb]>) =>
  Option.match(
    Arr.findFirst(boxes, ([b]) => inside(b, x, y)),
    { onNone: () => PAPER, onSome: ([, c]) => c },
  );

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

/**
 * A flat olive torso with a cream arm in `arm` in front of it that moves, and
 * okra's answer laid on it: the view with the arm's place painted, olive at
 * its edge and `inner` more than 2 px in from it, where the seam never reads.
 */
const layOn = (arm: Box) => (inner: (x: number, y: number) => Rgb) => {
  const view = rasterOf((x, y) =>
    colourAt(x, y, [
      [arm, CREAM],
      [TORSO, OLIVE],
    ]),
  );
  const cut: PartCut = {
    parts: [
      { name: 'arm', take: [{ polygon: corners(arm) }] },
      { name: 'torso', take: [{ polygon: corners(TORSO) }] },
    ],
  };
  const within = { x0: arm.x0 + 2, y0: arm.y0 + 2, x1: arm.x1 - 2, y1: arm.y1 - 2 };
  const answer = rasterOf((x, y) =>
    Bool.match(inside(within, x, y), {
      onTrue: () => inner(x, y),
      onFalse: () => colourAt(x, y, [[TORSO, OLIVE]]),
    }),
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
    const atFloor = layOn({ x0: 8, y0: 8, x1: 18, y1: 18 })(olive);
    const under = layOn({ x0: 8, y0: 8, x1: 17, y1: 19 })(olive);
    expect(atFloor.speck).toEqual([
      expect.objectContaining({ painted: { share: 0, px: 100 }, verdict: 'within' }),
    ]);
    expect(missedBars(atFloor)).not.toContain('speck');
    expect(under.speck).toEqual([
      expect.objectContaining({ painted: { share: 0, px: 99 }, verdict: 'unverified' }),
    ]);
    expect(missedBars(under)).toContain('speck');
    expect(rankOf(under)[1]).toBe(rankOf(atFloor)[1] + 1);
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
    expect(rankOf(under)[1]).toBe(rankOf(atFloor)[1] + 1);
  });
});
