import { describe, expect, it } from 'bun:test';
import type { Raster } from '@manna/film/tools';
import { cellPaintsOf, chainOf, ownersOf, partsOfKey, type RigSheet } from './parts.ts';

/** A raster `width` wide of RGBA pixels, row by row. */
const rasterOf = (
  width: number,
  px: ReadonlyArray<readonly [number, number, number, number]>,
): Raster => ({
  width,
  height: px.length / width,
  rgba: Uint8Array.from(px.flat()),
});

const [INK, SKIN, CLOTH, CLEAR] = [
  [20, 10, 5, 255],
  [240, 180, 130, 255],
  [90, 120, 120, 255],
  [0, 0, 0, 0],
] as const;

/** A 4 × 2 key: its top row the head (skin, ink), its bottom row the body (cloth), its first column clear. */
const KEY = rasterOf(4, [CLEAR, SKIN, SKIN, INK, CLEAR, CLOTH, CLOTH, CLOTH]);

/** The key's own colours, each held often enough (40 px) to be one of its paints, and the ink once, too seldom. */
const PAINTS = cellPaintsOf(
  rasterOf(1, [
    ...Array.from({ length: 40 }, () => SKIN),
    ...Array.from({ length: 40 }, () => CLOTH),
    INK,
  ]),
);

/** The part sheet cut from columns 1 to 3 (its top-left at the key's x 1): the head owns the top row, the body owns the bottom row and holds okra's paint under the head, a greyer cloth. */
const SHEET: RigSheet = {
  at: [1, 0],
  pivots: {
    body: [2, 2],
    head: [2, 1],
    armLeft: [0, 0],
    armRight: [0, 0],
    clothSash: [0, 0],
  },
  parts: [
    { name: 'head', png: rasterOf(3, [SKIN, SKIN, INK, CLEAR, CLEAR, CLEAR]) },
    {
      name: 'body',
      png: rasterOf(3, [
        [100, 118, 121, 255],
        [96, 125, 117, 255],
        [100, 118, 121, 255],
        CLOTH,
        CLOTH,
        CLOTH,
      ]),
    },
  ],
};

const pixel = (r: Raster, i: number) => [...r.rgba.subarray(i * 4, i * 4 + 4)];

describe('a key cut into its parts', () => {
  const owners = ownersOf(SHEET, KEY.width, KEY.height);
  const parts = partsOfKey(SHEET, KEY, owners, PAINTS);

  it("reads the cell's paints as its colours held 40 times or more", () => {
    expect(PAINTS.map((p) => p.rgb)).toEqual([
      [240, 180, 130],
      [90, 120, 120],
    ]);
  });

  it('gives each pixel to the first moving part whose sheet holds it, else to the body', () => {
    expect([...owners]).toEqual([1, 0, 0, 0, 1, 1, 1, 1]);
  });

  it('draws each moving part from the key itself, so a blink key keeps its own eyes', () => {
    const head = parts.get('head');
    expect(head && pixel(head, 1)).toEqual([...SKIN]);
    expect(head && pixel(head, 0)).toEqual([...CLEAR]);
  });

  it("carries the key's own pixels 2 px past a moving part's cut, never past the key's edge", () => {
    const column = rasterOf(1, [SKIN, CLOTH, CLOTH, CLOTH, CLOTH, CLEAR]);
    const sheet: RigSheet = {
      ...SHEET,
      at: [0, 0],
      parts: [
        { name: 'head', png: rasterOf(1, [SKIN, CLEAR, CLEAR, CLEAR, CLEAR, CLEAR]) },
        { name: 'body', png: rasterOf(1, [CLOTH, CLOTH, CLOTH, CLOTH, CLOTH, CLEAR]) },
      ],
    };
    const head = partsOfKey(sheet, column, ownersOf(sheet, 1, 6), PAINTS).get('head');
    expect([0, 1, 2, 3, 4, 5].map((i) => head && pixel(head, i)[3])).toEqual([
      255, 255, 255, 0, 0, 0,
    ]);
    expect(head && pixel(head, 2)).toEqual([...CLOTH]);
  });

  it("lays okra's paint under the moving parts on the body, snapped to the cell's own paints and opaque", () => {
    const body = parts.get('body');
    expect(body && pixel(body, 1)).toEqual([90, 120, 120, 255]);
    expect(body && pixel(body, 5)).toEqual([...CLOTH]);
  });

  it('at rest lays back, front over back, into the key wherever the key is drawn', () => {
    const order = ['head', 'body'] as const;
    for (let i = 0; i < 8; i++) {
      const top = order.map((n) => parts.get(n)).find((r) => r && (r.rgba[i * 4 + 3] ?? 0) > 0);
      if ((KEY.rgba[i * 4 + 3] ?? 0) > 0) expect(top && pixel(top, i)).toEqual(pixel(KEY, i));
    }
  });

  it('chains a part to its parent, the body first', () => {
    expect(chainOf('head')).toEqual(['body', 'head']);
    expect(chainOf('body')).toEqual(['body']);
  });
});
