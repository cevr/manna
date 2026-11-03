import type { PartSheet } from '@manna/film/tools';
import { describe, expect, test } from 'bun:test';
import { clearPaperRim } from './clean.ts';

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

const RIM = clearPaperRim({ paper: PAPER, band: 24, near: 12 });

describe('clearPaperRim', () => {
  test('clears the paper-coloured band the clear ground reaches and gives it to the ground, but not the cloth her ink walls in', () => {
    const out = RIM(sheetOf([CLEAR, NEAR_PAPER, NEAR_PAPER, INK, CLOTH, INK, NEAR_PAPER]));
    expect(Array.from(out.parts[0]?.pixels.rgba ?? [])).toEqual(
      [CLEAR, CLEAR, CLEAR, INK, CLOTH, INK, NEAR_PAPER].flat(),
    );
    expect(Array.from(out.owner)).toEqual([0, 0, 0, 1, 1, 1, 1]);
  });

  test('reaches no farther than its band from the clear ground', () => {
    const rim = clearPaperRim({ paper: PAPER, band: 1, near: 12 });
    const out = rim(sheetOf([CLEAR, NEAR_PAPER, NEAR_PAPER, INK]));
    expect(Array.from(out.owner)).toEqual([0, 0, 1, 1]);
  });

  test('clears nothing more when run on its own answer', () => {
    const once = RIM(sheetOf([CLEAR, NEAR_PAPER, INK, CLOTH, INK]));
    const twice = RIM(once);
    expect(twice.parts[0]?.pixels.rgba).toEqual(once.parts[0]?.pixels.rgba);
    expect(twice.owner).toEqual(once.owner);
  });
});
