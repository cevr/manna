import { describe, expect, test } from 'bun:test';
import { Array as Arr, Boolean as Bool, Option, Result } from 'effect';
import { type PartCut, cutParts } from '../core/part-sheet.ts';
import type { Raster } from '../core/raster.ts';
import { domainOf, hiddenOf, layAnswer, missedBars } from './part-sheet-lay.ts';

type Rgb = readonly [number, number, number];

const W = 48;
const PAPER: Rgb = [244, 232, 212];
const OLIVE: Rgb = [150, 140, 100];
/** The sleeve's cream: what a speck of the kept arm left in the paint shows. */
const CREAM: Rgb = [217, 191, 165];
/** A grey of the olive's lightness: shade with no colour. */
const GREY: Rgb = [138, 138, 138];

const TORSO = { x0: 6, y0: 4, x1: 42, y1: 44 };
const ARM = { x0: 18, y0: 8, x1: 30, y1: 40 };
const inside = (b: typeof TORSO, x: number, y: number) =>
  x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1;

/** The colour of the first box that holds the pixel, front to back; paper outside them all. */
const colourAt = (x: number, y: number, boxes: ReadonlyArray<readonly [typeof TORSO, Rgb]>) =>
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

/** A flat olive torso, a cream arm in front of it that moves. */
const VIEW = rasterOf((x, y) =>
  colourAt(x, y, [
    [ARM, CREAM],
    [TORSO, OLIVE],
  ]),
);
const FIGURE = Uint8Array.from({ length: W * W }, (_, i) =>
  Number(inside(TORSO, i % W, Math.floor(i / W))),
);
const box = (b: typeof TORSO): ReadonlyArray<readonly [number, number]> => [
  [b.x0, b.y0],
  [b.x1, b.y0],
  [b.x1, b.y1],
  [b.x0, b.y1],
];
const CUT: PartCut = {
  parts: [
    { name: 'arm', take: [{ polygon: box(ARM) }] },
    { name: 'torso', take: [{ polygon: box(TORSO) }] },
  ],
};

/** The arm's place more than 2 px in from its edge: paint the seam never reads. */
const INNER = { x0: ARM.x0 + 2, y0: ARM.y0 + 2, x1: ARM.x1 - 2, y1: ARM.y1 - 2 };

/** okra's answer: the view with the arm's place painted, olive at its edge and `inner` within. */
const answerOf = (inner: (x: number, y: number) => Rgb) =>
  rasterOf((x, y) =>
    Bool.match(inside(INNER, x, y), {
      onTrue: () => inner(x, y),
      onFalse: () => colourAt(x, y, [[TORSO, OLIVE]]),
    }),
  );

const laid = (answer: Raster) => {
  const sheet = Result.getOrThrow(cutParts(VIEW, CUT, { figure: FIGURE }));
  const hidden = hiddenOf(sheet, ['arm']);
  const target = {
    view: VIEW,
    sheet,
    hidden,
    domain: domainOf(sheet, hidden),
    moving: ['arm'],
    pad: { s: 1, dx: 0, dy: 0 },
    portrait: { width: W, height: W },
  };
  return Result.getOrThrow(layAnswer(target, answer)).measures;
};

describe('the part sheet lay', () => {
  test('paint flecked with the kept sleeve misses the speck bar; smooth paint meets it', () => {
    // a cream pixel every 3 px across the paint: the sleeve's colour left in the torso
    const flecked = laid(
      answerOf((x, y) =>
        Bool.match((x - INNER.x0) % 3 === 0 && (y - INNER.y0) % 3 === 0, {
          onTrue: () => CREAM,
          onFalse: () => OLIVE,
        }),
      ),
    );
    const smooth = laid(answerOf(() => OLIVE));
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
    const grey = laid(answerOf(() => GREY));
    const olive = laid(answerOf(() => OLIVE));
    expect(grey.seam.deltaE._tag === 'Some' && grey.seam.deltaE.value).toBe(0);
    expect(grey.drift.chroma).toEqual([
      expect.objectContaining({ part: 'torso', under: 'arm', verdict: 'outside' }),
    ]);
    expect(missedBars(grey)).toContain('drift');
    expect(olive.drift.chroma).toEqual([
      expect.objectContaining({ part: 'torso', under: 'arm', verdict: 'within' }),
    ]);
    expect(missedBars(olive)).not.toContain('drift');
  });
});
