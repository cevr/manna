import { describe, expect, test } from 'bun:test';
import { type PartCut, cutFigureOf, cutParts } from '@manna/film/tools';
import { Match, Result } from 'effect';
import { grain, shade, sides } from './prompts.ts';
import { FAR, box } from './rules.ts';
import { type CutFrame, bustFigure, cutTable, framedFigure, padded } from './table.ts';

type Rgba = readonly [number, number, number, number];

const PAPER: Rgba = [236, 226, 204, 255];
const INK: Rgba = [42, 30, 24, 255];

/** A synthetic view, each pixel the colour `paint` gives it. */
const raster = (width: number, height: number, paint: (x: number, y: number) => Rgba) => {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) rgba.set(paint(x, y), (y * width + x) * 4);
  return { width, height, rgba };
};

/** Paper, with a block from (x0, y0) to (x1, y1) inclusive: ringed in ink and filled with paper (a gap narrower than the cut's least enclosed paper); `open` leaves its bottom row unringed. */
const ringed =
  (x0: number, y0: number, x1: number, y1: number, open: boolean) =>
  (x: number, y: number): Rgba => {
    const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1;
    const edge = x === x0 || x === x1 || y === y0 || (y === y1 && !open);
    return Match.value({ inside, edge }).pipe(
      Match.when({ inside: true, edge: true }, () => INK),
      Match.orElse(() => PAPER),
    );
  };

const frame: CutFrame = { sheet: 'turnaround', kept: [10, 10, 34, 40], pad: [3, 5, 3, 2] };

const cut: PartCut = {
  parts: [
    {
      name: 'arm',
      take: [
        {
          polygon: [
            [-1, 4],
            [6, 4],
            [6, 9],
          ],
        },
        { disc: { c: [8, 2], r: 3 } },
      ],
      unless: [
        {
          polygon: [
            [2, -1],
            [FAR, -1],
            [FAR, 3],
          ],
        },
      ],
      pivot: [5, 6],
    },
    { name: 'torso', take: [box(-1, -1, FAR, FAR * 2)] },
  ],
};

describe('padded', () => {
  test('moves every point, disc and pivot by the pad, and keeps a point past the view past the padded sheet', () => {
    const [arm, torso] = padded(cut, frame).parts;
    expect(arm).toEqual({
      name: 'arm',
      take: [
        {
          polygon: [
            [-FAR, 9],
            [9, 9],
            [9, 14],
          ],
        },
        { disc: { c: [11, 7], r: 3 } },
      ],
      unless: [
        {
          polygon: [
            [5, -FAR],
            [FAR + 3, -FAR],
            [FAR + 3, 8],
          ],
        },
      ],
      pivot: [8, 11],
    });
    expect(torso).toEqual({
      name: 'torso',
      take: [
        {
          polygon: [
            [-FAR, -FAR],
            [FAR + 3, -FAR],
            [FAR + 3, FAR * 2 + 5],
            [-FAR, FAR * 2 + 5],
          ],
        },
      ],
      unless: [],
    });
  });

  test('moves a disc centre and a pivot left of the kept box by the pad, so a cropped hand keeps its visible pixels', () => {
    const hand: PartCut = {
      parts: [
        { name: 'hand', take: [{ disc: { c: [-2, 10], r: 4 } }], pivot: [-3, 5] },
        { name: 'rest', take: [box(-1, -1, FAR, FAR)] },
      ],
    };
    const square: CutFrame = { sheet: 'turnaround', kept: [0, 0, 20, 20], pad: [3, 3, 3, 3] };
    const laid = padded(hand, square);
    expect(laid.parts[0]?.take).toEqual([{ disc: { c: [1, 13], r: 4 } }]);
    expect(laid.parts[0]?.pivot).toEqual([0, 8]);
    const owner = Result.match(
      cutParts(
        raster(26, 26, () => INK),
        laid,
        { figure: new Uint8Array(26 * 26).fill(1) },
      ),
      { onSuccess: (sheet) => sheet.owner[13 * 26 + 1] ?? -1, onFailure: () => -1 },
    );
    expect(owner).toBe(1);
  });
});

describe('cutTable', () => {
  const classes = { cloth: ['blue'] };
  const labels = {};
  const table = cutTable({
    frames: {
      standing: frame,
      bust: { sheet: 'heads', kept: [0, 0, 24, 24], pad: [0, 0, 0, 0] },
    },
    views: {
      standing: { cut, figure: 'framed', reads: { classes, labels } },
      bust: { cut, figure: 'bust' },
    },
    hidden: {
      standing: { moving: ['arm'], prompt: 'standing' },
      bust: { moving: ['arm'], prompt: 'bust' },
    },
    ink: INK,
  });

  test('lays each view’s cut in its own frame and hands back the hidden entries and frames as given', () => {
    expect(table.CUTS.standing).toEqual(padded(cut, frame));
    expect(table.CUTS.bust.parts[0]?.pivot).toEqual([5, 6]);
    expect(table.HIDDEN.bust.prompt).toBe('bust');
    expect(table.FRAMES.standing).toBe(frame);
  });

  test('a view with reads hands them to the cut beside its figure; one without hands its figure alone', () => {
    const standing = table.cutOptionsFor('standing', raster(30, 37, ringed(8, 2, 14, 30, false)));
    expect(Object.keys(standing).sort()).toEqual(['classes', 'figure', 'labels']);
    expect(standing.classes).toBe(classes);
    const view = raster(24, 24, ringed(8, 6, 14, 23, true));
    const bust = table.cutOptionsFor('bust', view);
    expect(Object.keys(bust)).toEqual(['figure']);
    expect(bust.figure).toEqual(bustFigure(view, INK));
  });
});

describe('framedFigure', () => {
  test('reads the kept box as the kept view alone and the pad on the padded view', () => {
    const [w, h] = [frame.kept[2] - frame.kept[0], frame.kept[3] - frame.kept[1]];
    const [pw, ph] = [w + frame.pad[0] + frame.pad[2], h + frame.pad[1] + frame.pad[3]];
    // a ringed gap whose top row lies in the pad: closed on the padded view, open on the kept view
    const paint = ringed(8, 2, 14, 30, false);
    const view = raster(pw, ph, paint);
    const kept = raster(w, h, (x, y) => paint(x + frame.pad[0], y + frame.pad[1]));
    const figure = framedFigure(frame, view);
    const [inner, whole] = [cutFigureOf(kept), cutFigureOf(view)];
    const at = (x: number, y: number) => y * pw + x;
    // the gap in the kept box: the padded view encloses it, the kept view alone does not
    expect(whole[at(11, 20)]).toBe(1);
    expect(inner[(20 - frame.pad[1]) * w + 11 - frame.pad[0]]).toBe(0);
    expect(figure[at(11, 20)]).toBe(0);
    // the gap in the pad: the padded view's reading
    expect(whole[at(11, 3)]).toBe(1);
    expect(figure[at(11, 3)]).toBe(1);
  });
});

describe('bustFigure', () => {
  test('closes the foot, so a gap that runs off the view’s bottom is the figure’s', () => {
    const view = raster(24, 24, ringed(8, 6, 14, 23, true));
    const inside = 20 * 24 + 11;
    expect(cutFigureOf(view)[inside]).toBe(0);
    const figure = bustFigure(view, INK);
    expect(figure.length).toBe(24 * 24);
    expect(figure[inside]).toBe(1);
    expect(figure[2 * 24 + 2]).toBe(0);
  });
});

describe('prompts', () => {
  test('a member’s clothes fill the sides and grain fragments', () => {
    expect(sides({ pronoun: 'his', lower: 'robe', cloth: 'the tunic and mantle' })).toBe(
      'Each side of his body runs straight down from the outer end of his shoulder to the outer edge of his robe below, so his body under the arms is as wide as his shoulders and his robe, and the tunic and mantle fill everything inside that line with the same soft shade and fine paper grain the sheet paints beside each arm.',
    );
    expect(sides({ pronoun: 'her', lower: 'skirt', cloth: 'the dress' })).not.toContain('his');
    expect(shade('their')).toContain('on their body');
    expect(shade('her')).toBe(
      'Keep the soft shade each arm casts on her body beside it exactly as it is, and carry that same shade on under where the arm was.',
    );
    expect(grain('the white sash and the tunic and mantle of his body')).toBe(
      'Paint the white sash and the tunic and mantle of his body with the same fine paper grain the sheet shows on them beside the arms: a fine, even speckle through every flat area of colour, never smooth flat colour.',
    );
  });
});
