// The match's hair/beard rule on measures made by hand, each side's edge and
// value step taken from a measured crop of RBF's (`PARTED` in match.ts): the
// rule flags a scene that runs together what its concept parts, never the
// other way, parts by the edge or by the step alone, and says a side with no
// beard without flagging it. A cast member's concept image names a file its
// record keeps: a sheet by its kind, a single drawing by its view.

import { describe, expect, test } from 'bun:test';
import { Array as Arr, Option, Result, Schema } from 'effect';
import type { SheetKind } from './cast-sheet.ts';
import type { FigureMeasure, HairBeard } from './figure.ts';
import { castConceptImage, compareFigures, ConceptImage, conceptImageName } from './match.ts';

describe("a cast member's concept image", () => {
  const decoded = Schema.decodeUnknownResult(ConceptImage);

  test('a single drawing is named by its view, a sheet by its kind', () => {
    const single = Result.getOrThrow(
      decoded({ cast: 'lead-feast', sheet: 'single', view: 'single-1' }),
    );
    const poses = Result.getOrThrow(decoded({ cast: 'lead-feast', sheet: 'poses' }));
    expect([conceptImageName(single), conceptImageName(poses)]).toEqual([
      'cast/lead-feast/kept/single-1.png',
      'cast/lead-feast/kept/poses.png',
    ]);
  });

  test("a kept view's image, as a render's match table names it, is its own kept file", () => {
    const named = (kind: SheetKind, view: string) =>
      conceptImageName(castConceptImage('lead-feast', kind, view));
    expect([named('single', 'single-1'), named('poses', 'poses-3')]).toEqual([
      'cast/lead-feast/kept/single-1.png',
      'cast/lead-feast/kept/poses.png',
    ]);
  });

  test.each([
    ['a view of a sheet, which keeps one file', { sheet: 'poses', view: 'poses-1' }],
    ['a single drawing with no view, which has no file of its kind', { sheet: 'single' }],
    ['a single drawing by a view of another kind', { sheet: 'single', view: 'poses-1' }],
  ])('refuses %s', (_, image) => {
    expect(Result.isFailure(decoded({ cast: 'lead-feast', ...image }))).toBe(true);
  });
});

/** A figure measured with nothing to compare: no ratio, outline, artifact or beard. */
const BARE: FigureMeasure = {
  head: [0, 0, 100, 100],
  ink: [0, 0, 0],
  ratios: [],
  silhouette: { head: [], body: [] },
  facing: { turn: 0, roll: 0, eyes: 1 },
  artifacts: [],
  missing: [],
};

/** A figure measured with nothing but where its hair meets its beard: hair at value `hair`, beard at `beard`. */
const bearded = (hair: number, beard: number, edge: number): FigureMeasure => ({
  ...BARE,
  hairBeard: {
    hair: { hue: 27, saturation: 0.6, value: hair },
    beard: { hue: 27, saturation: 0.6, value: beard },
    edge,
  } satisfies HairBeard,
});

/** Christ's concept (court.12): parted by a dark band, edge 0.146, step 0.020. */
const CHRIST_CONCEPT = bearded(0.4, 0.38, 0.146);
/** Christ at court 16.51 s: the beard run into the hair, edge 0.063, step 0.004. */
const CHRIST_MERGED = bearded(0.4, 0.396, 0.063);
/** The farmer's concept (rain.rain): edge 0.257, step 0.200. */
const FARMER_CONCEPT = bearded(0.6, 0.4, 0.257);
/** The farmer at rain 14.19 s: no band (edge 0.019), a cream headcloth over a dark beard (step 0.494). */
const FARMER_GREY = bearded(0.2, 0.694, 0.019);

const ruleOf = (concept: FigureMeasure, scene: FigureMeasure) =>
  Option.getOrThrow(
    Arr.findFirst(compareFigures(concept, scene), (row) => row.name === 'hair/beard: parted'),
  );

describe('the hair/beard rule', () => {
  test('flags a scene that runs together what its concept parts', () => {
    expect(ruleOf(CHRIST_CONCEPT, CHRIST_MERGED)).toMatchObject({
      flagged: true,
      note: 'concept parted (edge 0.146, step 0.020), scene merged (edge 0.063, step 0.004)',
    });
  });

  test('never flags a scene that parts what its concept runs together', () => {
    expect(ruleOf(CHRIST_MERGED, CHRIST_CONCEPT)).toMatchObject({
      flagged: false,
      note: 'concept merged (edge 0.063, step 0.004), scene parted (edge 0.146, step 0.020)',
    });
  });

  test('reads a side parted by its value step alone, with no band', () => {
    expect(ruleOf(FARMER_CONCEPT, FARMER_GREY)).toMatchObject({
      flagged: false,
      note: 'concept parted (edge 0.257, step 0.200), scene parted (edge 0.019, step 0.494)',
    });
  });

  test('says a side with no beard, and flags neither way', () => {
    expect(ruleOf(CHRIST_CONCEPT, BARE)).toMatchObject({
      flagged: false,
      note: 'concept parted (edge 0.146, step 0.020), scene no beard',
    });
    expect(ruleOf(BARE, CHRIST_MERGED).flagged).toBe(false);
  });
});
