import type { PartSheet, SheetClean } from '@manna/film/tools';
import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { RIM_LEFT, clearPaperRim, clearSpecks, cuffsToArms, paperRimLeftOf } from './clean.ts';

const PAPER = [253, 240, 215] as const;
const NEAR_PAPER = [251, 243, 226, 255] as const;
const INK = [20, 4, 0, 255] as const;
const CLOTH = NEAR_PAPER;
const CLEAR = [0, 0, 0, 0] as const;

/** A one-row sheet of one part, `row` its pixels left to right, every opaque pixel the part's own. */
const sheetOf = (row: ReadonlyArray<readonly [number, number, number, number]>): PartSheet => {
  const rgba = new Uint8Array(row.flat());
  return {
    width: row.length,
    height: 1,
    parts: [{ name: 'torso', pixels: { width: row.length, height: 1, rgba }, kept: 0, painted: 0 }],
    owner: Uint8Array.from(row, (px) => {
      if (px[3] > 0) return 1;
      return 0;
    }),
  };
};

/** The sheet `rule` leaves, or the reason it refuses. */
const ran = (rule: SheetClean, sheet: PartSheet) =>
  Result.match(rule(sheet), { onFailure: (e) => e.message, onSuccess: (s) => s });

/** The sheet `rule` leaves; a refusal throws. */
const cleaned = (rule: SheetClean, sheet: PartSheet) => Result.getOrThrow(rule(sheet));

const RIM = clearPaperRim({ paper: PAPER, band: 24, near: 12 });

describe('clearPaperRim', () => {
  test('clears the paper-coloured band the clear ground reaches and gives it to the ground, but not the cloth her ink walls in', () => {
    const out = cleaned(RIM, sheetOf([CLEAR, NEAR_PAPER, NEAR_PAPER, INK, CLOTH, INK, NEAR_PAPER]));
    expect(Array.from(out.parts[0]?.pixels.rgba ?? [])).toEqual(
      [CLEAR, CLEAR, CLEAR, INK, CLOTH, INK, NEAR_PAPER].flat(),
    );
    expect(Array.from(out.owner)).toEqual([0, 0, 0, 1, 1, 1, 1]);
  });

  test('reaches no farther than its band from the clear ground', () => {
    const rim = clearPaperRim({ paper: PAPER, band: 1, near: 12 });
    const out = cleaned(rim, sheetOf([CLEAR, NEAR_PAPER, NEAR_PAPER, INK]));
    expect(Array.from(out.owner)).toEqual([0, 0, 1, 1]);
  });

  test('clears nothing more when run on its own answer', () => {
    const once = cleaned(RIM, sheetOf([CLEAR, NEAR_PAPER, INK, CLOTH, INK]));
    const twice = cleaned(RIM, once);
    expect(twice.parts[0]?.pixels.rgba).toEqual(once.parts[0]?.pixels.rgba);
    expect(twice.owner).toEqual(once.owner);
  });
});

/** A one-row raster, `row` its pixels left to right. */
const rowOf = (row: ReadonlyArray<readonly [number, number, number, number]>) => ({
  width: row.length,
  height: 1,
  rgba: new Uint8Array(row.flat()),
});

/** `paperRimLeftOf` with the guard's own reading, on one cut part and its un-matted pixels. */
const rimLeft = (
  cut: ReadonlyArray<readonly [number, number, number, number]>,
  unmatted: ReadonlyArray<readonly [number, number, number, number]>,
  band: number = RIM_LEFT.band,
) =>
  Array.from(
    paperRimLeftOf([rowOf(cut)], [rowOf(unmatted)], {
      ...RIM_LEFT,
      paper: PAPER,
      shadow: [],
      band,
    }),
  );

const HALF_PAPER = [251, 243, 226, 120] as const;
const PALE_ROBE = [200, 180, 150, 255] as const;

describe('paperRimLeftOf', () => {
  test("holds no pixel his ground shadow's part draws in front, however near the paper its paint lies", () => {
    const figure = rowOf([CLEAR, NEAR_PAPER, INK, CLEAR, CLEAR]);
    const shadow = rowOf([CLEAR, CLEAR, CLEAR, NEAR_PAPER, CLEAR]);
    const rim = (parts: ReadonlyArray<number>) =>
      Array.from(
        paperRimLeftOf([figure, shadow], [figure, shadow], {
          ...RIM_LEFT,
          paper: PAPER,
          shadow: parts,
        }),
      );
    expect(rim([1])).toEqual([0, 1, 0, 0, 0]);
    expect(rim([])).toEqual([0, 1, 0, 1, 0]);
  });

  test('holds the paper-coloured pixels the un-matte keeps whole outside the ink, not the cloth the ink walls in', () => {
    expect(
      rimLeft(
        [CLEAR, NEAR_PAPER, NEAR_PAPER, INK, CLOTH, INK],
        [CLEAR, NEAR_PAPER, NEAR_PAPER, INK, CLOTH, INK],
      ),
    ).toEqual([0, 1, 1, 0, 0, 0]);
  });

  test('holds no pixel the un-matte cleared, left under alpha 200, or coloured other than the paper', () => {
    expect(
      rimLeft(
        [CLEAR, NEAR_PAPER, NEAR_PAPER, NEAR_PAPER, INK],
        [CLEAR, CLEAR, HALF_PAPER, PALE_ROBE, INK],
      ),
    ).toEqual([0, 0, 0, 0, 0]);
  });

  test('reads its band from the clear ground through the cut pixels lighter than ink, whatever the un-matte made of them', () => {
    expect(
      rimLeft(
        [CLEAR, PALE_ROBE, NEAR_PAPER, NEAR_PAPER],
        [CLEAR, CLEAR, NEAR_PAPER, NEAR_PAPER],
        2,
      ),
    ).toEqual([0, 0, 1, 0]);
  });
});

describe('a rule naming a part the sheet lacks', () => {
  const sheet = sheetOf([CLEAR, INK, CLOTH, INK]);

  test('cuffsToArms refuses the sheet, naming the arm, and moves no pixel to the ground', () => {
    const rule = cuffsToArms({
      arms: [{ name: 'armX', hand: { c: [1, 0], r: 1 } }],
      body: ['torso'],
      loose: 'torso',
    });
    expect(ran(rule, sheet)).toBe(
      "the view's rule cannot run: the sheet has no part armX (its parts: torso)",
    );
  });

  test('cuffsToArms refuses a body or loose part the sheet lacks', () => {
    const hand = { c: [1, 0] as const, r: 1 };
    const arms = [{ name: 'torso', hand }];
    expect(ran(cuffsToArms({ arms, body: ['robe'], loose: 'torso' }), sheet)).toContain(
      'no part robe',
    );
    expect(ran(cuffsToArms({ arms, body: ['torso'], loose: 'robe' }), sheet)).toContain(
      'no part robe',
    );
  });

  test('clearSpecks refuses the sheet, naming the part', () => {
    expect(ran(clearSpecks('armRight', 50), sheet)).toBe(
      "the view's rule cannot run: the sheet has no part armRight (its parts: torso)",
    );
  });
});
