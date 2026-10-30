import { describe, expect, test } from 'bun:test';
import type { Rgb } from './cast-sheet-pixels.ts';
import { unmatte } from './unmatte.ts';

const [W, H] = [16, 8];
const PAPER: Rgb = [250, 240, 220];
const INK: Rgb = [20, 12, 8];
const FILL: Rgb = [240, 230, 205];

/** Each column's colour from 3 on: a 40 % ink mix, a px bluer than the paper, ink (5..6), then a light fill (7..15). */
const COLUMNS: ReadonlyArray<Rgb> = [
  [20 * 0.4 + 250 * 0.6, 12 * 0.4 + 240 * 0.6, 8 * 0.4 + 220 * 0.6].map(
    Math.round,
  ) as unknown as Rgb,
  [250, 244, 236],
  INK,
  INK,
  ...Array.from({ length: W - 7 }, () => FILL),
];

/** A row-banded part: columns 0..2 ground, then `COLUMNS`. */
const part = () => {
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 3; x < W; x++) rgba.set([...COLUMNS[x - 3]!, 255], (y * W + x) * 4);
  return rgba;
};

const at = (r: Uint8Array, x: number, y = 4) => [
  ...r.subarray((y * W + x) * 4, (y * W + x) * 4 + 4),
];
const over = (px: number[]) =>
  [0, 1, 2].map((c) => (px[c]! * px[3]!) / 255 + PAPER[c]! * (1 - px[3]! / 255));

describe('unmatte', () => {
  test("solves a rim px's alpha along the line to the ink, so it is the kept px over the paper within 1", () => {
    const src = part();
    const [out] = unmatte([src], W, H, PAPER);
    const px = at(out!, 3);
    expect(Math.abs(px[3]! - 0.4 * 255)).toBeLessThanOrEqual(2);
    over(px).forEach((v, c) => expect(Math.abs(v - at(src, 3)[c]!)).toBeLessThanOrEqual(1));
  });

  test('drops a rim px the line to the ink does not reach (paper lighter or bluer than the flat paper) where it joins the ground', () => {
    const [out] = unmatte([partWith(3, [250, 244, 236])], W, H, PAPER);
    for (const x of [3, 4]) expect(at(out!, x)[3]).toBe(0);
  });

  test('drops a rim px the line to the ink does not reach (paper lighter or bluer than the flat paper), though his ink walls it in, since it runs to the frame', () => {
    const [out] = unmatte([part()], W, H, PAPER);
    expect(at(out!, 4)[3]).toBe(0);
  });

  test('keeps the ink, and the fill inside it, byte for byte', () => {
    const src = part();
    const [out] = unmatte([src], W, H, PAPER);
    for (const x of [5, 6, 7, 10, 15]) expect(at(out!, x)).toEqual(at(src, x));
  });

  test('clears the paint behind a rim px it un-mattes, light or ink, so the rest over the paper is the view', () => {
    const front = part();
    const inked = part();
    for (let y = 0; y < H; y++) inked.set([...INK, 255], (y * W + 3) * 4);
    for (const behind of [part(), inked]) {
      const [out, back] = unmatte([front, behind], W, H, PAPER);
      expect(Math.abs(at(out!, 3)[3]! - 0.4 * 255)).toBeLessThanOrEqual(2);
      expect(at(back!, 3)[3]).toBe(0);
      // the ink past the rim's first ink px, held by both, is kept in both
      expect(at(back!, 6)).toEqual(at(behind, 6));
    }
  });

  test('clears a pocket of paper the box cuts off from the ground at its corners, to its ink', () => {
    // columns 0..2 the sheet's paper on the frame's left border, 3 ink, then fill: no ground anywhere
    const cols: ReadonlyArray<Rgb> = [
      ...Array.from({ length: 3 }, (): Rgb => [250, 244, 236]),
      INK,
      ...Array.from({ length: W - 4 }, () => FILL),
    ];
    const src = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) src.set([...cols[x]!, 255], (y * W + x) * 4);
    const [out] = unmatte([src], W, H, PAPER);
    for (const x of [0, 1, 2]) expect(at(out!, x)[3]).toBe(0);
    for (const x of [3, 4, 10]) expect(at(out!, x)).toEqual(at(src, x));
  });

  test('un-matte keeps paper on a non-corner box edge', () => {
    // a fill to every edge of the box, and on its bottom edge (x 6..9) a highlight of the sheet's paper inked round above and beside it: no ground, and no corner the paper joins
    const src = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const highlight = y === H - 1 && x >= 6 && x < 10;
        const inked = !highlight && x >= 5 && x < 11 && y >= H - 2;
        let c: Rgb = FILL;
        if (inked) c = INK;
        if (highlight) c = [250, 244, 236];
        src.set([...c, 255], (y * W + x) * 4);
      }
    const [out] = unmatte([src], W, H, PAPER);
    for (const x of [6, 7, 8, 9]) expect(at(out!, x, H - 1)).toEqual(at(src, x, H - 1));
    for (const x of [0, 15]) expect(at(out!, x, 0)).toEqual(at(src, x, 0));
  });

  test('un-matte clears paper that touches a frame edge between the corners', () => {
    // ink to every edge and corner of the box, and a pocket of the paper itself (x 0..1, y 3..4) on its left edge: no ground, and no corner the paper joins
    const src = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) src.set([...INK, 255], (y * W + x) * 4);
    for (const y of [3, 4]) for (const x of [0, 1]) src.set([...PAPER, 255], (y * W + x) * 4);
    const [closed] = unmatte([src], W, H, PAPER, { open: [] });
    for (const [x, y] of [
      [0, 3],
      [1, 3],
      [0, 4],
      [1, 4],
    ] as const)
      expect(at(closed!, x, y)[3]).toBe(0);
    expect(at(closed!, 2, 3)).toEqual(at(src, 2, 3));
    const [open] = unmatte([src], W, H, PAPER, { open: ['left'] });
    for (const [x, y] of [
      [0, 3],
      [1, 3],
      [0, 4],
      [1, 4],
    ] as const)
      expect(at(open!, x, y)).toEqual(at(src, x, y));
  });

  test('clears paper a part holds 6 px deep outside its ink, and still un-mattes the ink edge past it', () => {
    // columns 0..2 ground, 3..8 the sheet's paper (bluer than its flat colour), then the 40 % mix, ink and fill
    const [w, h] = [32, 8];
    const cols: ReadonlyArray<Rgb> = [
      ...Array.from({ length: 6 }, (): Rgb => [250, 244, 236]),
      ...COLUMNS.slice(0, 1),
      ...COLUMNS.slice(2),
    ];
    const src = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 3; x < w; x++)
        src.set([...cols[Math.min(x - 3, cols.length - 1)]!, 255], (y * w + x) * 4);
    const [out] = unmatte([src], w, h, PAPER);
    const px = (x: number) => [...out!.subarray((4 * w + x) * 4, (4 * w + x) * 4 + 4)];
    for (let x = 3; x <= 8; x++) expect(px(x)[3]).toBe(0);
    expect(Math.abs(px(9)[3]! - 0.4 * 255)).toBeLessThanOrEqual(2);
    for (const x of [10, 11, 12, 20])
      expect(px(x)).toEqual([...src.subarray((4 * w + x) * 4, (4 * w + x) * 4 + 4)]);
  });

  /** `part()` with column `x` painted `colour`. */
  const partWith = (x: number, colour: Rgb) => {
    const rgba = part();
    for (let y = 0; y < H; y++) rgba.set([...colour, 255], (y * W + x) * 4);
    return rgba;
  };

  test('keeps a light cloth px the line does not reach whole when it lies nearer a kept cloth colour than the paper', () => {
    const [out] = unmatte([part()], W, H, PAPER, { keep: [[252, 246, 238]] });
    expect(at(out!, 4)).toEqual([250, 244, 236, 255]);
  });

  test('still clears the paper itself when cloth colours are kept', () => {
    const [out] = unmatte([partWith(4, PAPER)], W, H, PAPER, { keep: [[252, 246, 238]] });
    expect(at(out!, 4)[3]).toBe(0);
  });

  test("raises a thin part's rim alpha until its colour is in range, so a saturated speck keeps its hue", () => {
    const OCHRE: Rgb = [216, 171, 112];
    const src = partWith(3, OCHRE);
    const [thin] = unmatte([src], W, H, PAPER, { thin: [0] });
    const [plain] = unmatte([src], W, H, PAPER, { thin: [1] });
    over(at(thin!, 3)).forEach((v, c) => expect(Math.abs(v - OCHRE[c]!)).toBeLessThanOrEqual(1));
    // the least alpha that solves every channel in 0..255, in closed form: a channel darker than the paper needs (paper − c) / paper of it, a lighter one (c − paper) / (255 − paper); the other form is negative
    const least = Math.ceil(
      255 *
        Math.max(
          ...OCHRE.flatMap((v, c) => [
            (PAPER[c]! - v) / PAPER[c]!,
            (v - PAPER[c]!) / (255 - PAPER[c]!),
          ]),
        ),
    );
    expect(least).toBe(126);
    expect(at(thin!, 3)[3]).toBe(least);
    // one step less, the blue channel solves below 0
    const solved = (a: number) => OCHRE.map((v, c) => (v * 255 - PAPER[c]! * (255 - a)) / a);
    expect(Math.min(...solved(least - 1))).toBeLessThan(0);
    expect(Math.min(...solved(least))).toBeGreaterThanOrEqual(0);
    // a part not named thin keeps the line's alpha, its blue clamped: over the paper it goes grey
    expect(over(at(plain!, 3))[2]! - OCHRE[2]).toBeGreaterThan(10);
  });

  // a cool grey cloth px 3.46 luma darker than the paper, which the line to the ink barely reaches
  const GREY: Rgb = [244, 236, 226];

  test('keeps a rim px darker than the paper by more than its grain whole, colour and alpha', () => {
    const [out] = unmatte([partWith(3, GREY)], W, H, PAPER, { grain: 2 });
    expect(at(out!, 3)).toEqual([...GREY, 255]);
  });

  test('solves that px along the line to the ink when no grain is given', () => {
    const [out] = unmatte([partWith(3, GREY)], W, H, PAPER);
    expect(at(out!, 3)[3]).toBeLessThan(10);
  });

  test('still solves a px within the grain, and clears the paper itself, when a grain is given', () => {
    const NEAR: Rgb = [249, 239, 220];
    const [near] = unmatte([partWith(4, NEAR)], W, H, PAPER, { grain: 2 });
    const [solved] = unmatte([partWith(4, NEAR)], W, H, PAPER);
    expect(at(near!, 4)).toEqual(at(solved!, 4));
    const [paper] = unmatte([partWith(4, PAPER)], W, H, PAPER, { grain: 2 });
    expect(at(paper!, 4)[3]).toBe(0);
  });
});

describe('unmatte, a light px the figure encloses', () => {
  const S = 20;
  // light cloth, ΔE 5.4 from the paper, which the line to the ink does not reach
  const CLOTH: Rgb = [248, 242, 232];
  // a tan cloth the walk solves to a partial alpha: a wall round what it encloses
  const TAN: Rgb = [200, 180, 150];
  // paper's own grain, ΔE 1.2 from the paper
  const NEAR: Rgb = [252, 243, 224];
  const MIX = COLUMNS[0]!;

  /** A square figure on x, y 3..16 of a 20 × 20 frame, its outline a 40 % ink mix round tan and ink along its foot (an inked part, not a shadow), with `paint` laid over it. */
  const figure = (paint: ReadonlyArray<readonly [number, number, Rgb]>) => {
    const rgba = new Uint8Array(S * S * 4);
    for (let y = 3; y <= 16; y++)
      for (let x = 3; x <= 16; x++) rgba.set([...MIX, 255], (y * S + x) * 4);
    for (let x = 3; x <= 16; x++) rgba.set([...INK, 255], (16 * S + x) * 4);
    for (let y = 4; y <= 15; y++)
      for (let x = 4; x <= 15; x++) rgba.set([...TAN, 255], (y * S + x) * 4);
    for (const [x, y, c] of paint) rgba.set([...c, 255], (y * S + x) * 4);
    return rgba;
  };
  const px = (r: Uint8Array, x: number, y: number) => [
    ...r.subarray((y * S + x) * 4, (y * S + x) * 4 + 4),
  ];
  const inkColumn = (x: number) => [7, 8, 9, 10, 11, 12].map((y) => [x, y, INK] as const);

  test('keeps a light cloth speck that the ink and the cloth enclose whole, alpha 255', () => {
    const src = figure([
      [6, 9, CLOTH],
      [7, 9, CLOTH],
      [6, 10, CLOTH],
      [7, 10, CLOTH],
      ...inkColumn(8),
    ]);
    const [out] = unmatte([src], S, S, PAPER);
    for (const [x, y] of [
      [6, 9],
      [7, 9],
      [6, 10],
      [7, 10],
    ] as const)
      expect(px(out!, x, y)).toEqual([...CLOTH, 255]);
  });

  test('keeps the near-clear fence round such a speck whole too', () => {
    const src = figure([
      [6, 9, CLOTH],
      [6, 10, CLOTH],
      [7, 9, FILL],
      [7, 10, FILL],
      ...inkColumn(8),
    ]);
    const [out] = unmatte([src], S, S, PAPER);
    expect(px(out!, 6, 9)).toEqual([...CLOTH, 255]);
    expect(px(out!, 7, 10)).toEqual([...FILL, 255]);
  });

  test('still clears a paper pocket the figure encloses, with the light px in it, and un-mattes the outline', () => {
    const pocket = [6, 7, 8].flatMap((x) => [8, 9, 10].map((y) => [x, y, PAPER] as const));
    const src = figure([...pocket, [9, 9, CLOTH], ...inkColumn(10)]);
    const [out] = unmatte([src], S, S, PAPER);
    for (const [x, y] of [...pocket, [9, 9] as const]) expect(px(out!, x, y)[3]).toBe(0);
    // the outline solves as it does with no pocket: partly clear, toward the ink
    const [plain] = unmatte([figure(inkColumn(10))], S, S, PAPER);
    expect(px(out!, 3, 9)).toEqual(px(plain!, 3, 9));
    expect(px(out!, 3, 9)[3]).toBeGreaterThan(0);
    expect(px(out!, 3, 9)[3]).toBeLessThan(255);
  });

  test("leaves an enclosed px within ΔE 2 of the paper cleared, so the sheet's paper shows no halo", () => {
    const src = figure([
      [6, 9, CLOTH],
      [6, 10, CLOTH],
      [7, 9, NEAR],
      [7, 10, NEAR],
      ...inkColumn(8),
    ]);
    const [out] = unmatte([src], S, S, PAPER);
    expect(px(out!, 6, 9)).toEqual([...CLOTH, 255]);
    expect(px(out!, 7, 9)[3]).toBe(0);
  });

  test('keeps a light cloth speck whole when its clear region holds a few px of paper (4, under a pocket)', () => {
    const near = [5, 6].flatMap((x) => [8, 11].map((y) => [x, y, NEAR] as const));
    const cloth = [5, 6].flatMap((x) => [9, 10].map((y) => [x, y, CLOTH] as const));
    const [out] = unmatte([figure([...near, ...cloth, ...inkColumn(8)])], S, S, PAPER);
    for (const [x, y] of cloth) expect(px(out!, x, y)).toEqual([...CLOTH, 255]);
  });

  test("clears a light px beside a pocket of the sheet's paper (9 px within ΔE 2) though the rim clears only part of the pocket", () => {
    // a paper a shade darker than the flat one (ΔE 1.05): the rim solves it near-clear but walks no further through it
    const DIM: Rgb = [247, 237, 217];
    const pocket = [6, 7, 8].flatMap((x) => [8, 9, 10].map((y) => [x, y, DIM] as const));
    const cloth = [8, 9, 10].map((y) => [5, y, CLOTH] as const);
    const [out] = unmatte([figure([...pocket, ...cloth, ...inkColumn(11)])], S, S, PAPER);
    for (const [x, y] of cloth) expect(px(out!, x, y)[3]).toBe(0);
  });

  test("clears a light px beside a pocket whose paper a band of the sheet's coarser grain (ΔE 3.7) splits in two", () => {
    const DIM: Rgb = [247, 237, 217];
    // the sheet's grain at its coarsest, ΔE 3.67 from the paper: still its ground
    const GRAIN: Rgb = [239, 230, 212];
    const pocket = [6, 7, 8].flatMap((x) => [
      [x, 8, DIM] as const,
      [x, 9, GRAIN] as const,
      [x, 10, DIM] as const,
      [x, 11, DIM] as const,
    ]);
    const cloth = [8, 9, 10, 11].map((y) => [5, y, CLOTH] as const);
    const [out] = unmatte([figure([...pocket, ...cloth, ...inkColumn(11)])], S, S, PAPER);
    for (const [x, y] of cloth) expect(px(out!, x, y)[3]).toBe(0);
  });

  // lighter than the paper, ΔE 2.35 from it: the sheet's paper past PAPER_CORE, which the line does not reach
  const LIGHT: Rgb = [252, 243, 227];
  const paint = (
    rgba: Uint8Array,
    [x0, x1]: [number, number],
    [y0, y1]: [number, number],
    c: Rgb,
  ) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) rgba.set([...c, 255], (y * S + x) * 4);
    return rgba;
  };
  /** An ink body (x 6..11, y 3..11) on two legs of the ink mix (x 6..7, 10..11) to row `bottom`, a 2 px `LIGHT` gap (x 8..9) between them. */
  const legs = (bottom: number) => {
    const rgba = paint(new Uint8Array(S * S * 4), [6, 11], [3, 11], INK);
    paint(rgba, [6, 7], [12, bottom], MIX);
    paint(rgba, [10, 11], [12, bottom], MIX);
    return paint(rgba, [8, 9], [12, bottom], LIGHT);
  };
  const gap = (bottom: number) =>
    [8, 9].flatMap((x) => Array.from({ length: bottom - 11 }, (_, k) => [x, 12 + k] as const));

  test('clears a 2 px gap of paper between his legs that opens on the ground below', () => {
    const [out] = unmatte([legs(16)], S, S, PAPER);
    for (const [x, y] of gap(16)) expect(px(out!, x, y)[3]).toBe(0);
  });

  test('clears a light gap between his legs that runs out through the crop frame', () => {
    const [out] = unmatte([legs(S - 1)], S, S, PAPER);
    for (const [x, y] of gap(S - 1)) expect(px(out!, x, y)[3]).toBe(0);
  });

  test('clears a light slit that runs diagonally from a notch in his outline, touching the ground only at corners', () => {
    const slit = [
      [8, 4],
      [9, 5],
      [10, 6],
    ] as const;
    const src = figure([...slit.map(([x, y]) => [x, y, LIGHT] as const), ...inkColumn(13)]);
    src.fill(0, (3 * S + 7) * 4, (3 * S + 7) * 4 + 4);
    const [out] = unmatte([src], S, S, PAPER);
    for (const [x, y] of slit) expect(px(out!, x, y)[3]).toBe(0);
  });

  test("clears a light slit that runs diagonally from a mouth of the sheet's grain in his outline, its px joined only at corners", () => {
    // darker than the paper by ΔE 3.67: the sheet's ground, which a 2.25 grain keeps whole
    const GRAIN: Rgb = [239, 230, 212];
    const slit = [
      [8, 4],
      [9, 5],
      [10, 6],
    ] as const;
    const src = figure([
      [8, 3, GRAIN],
      ...slit.map(([x, y]) => [x, y, LIGHT] as const),
      ...inkColumn(13),
    ]);
    const [out] = unmatte([src], S, S, PAPER, { grain: 2.25 });
    expect(slit.map(([x, y]) => px(out!, x, y)[3])).toEqual([0, 0, 0]);
  });

  test("clears light cloth that a hard 1-px diagonal ink stroke parts from a mouth of the sheet's grain, since the open paper steps across the stroke's corners", () => {
    const GRAIN: Rgb = [239, 230, 212];
    // the stroke (9,4)-(8,5) parts the open px (8,4) from the patch, whose corner (9,5) meets it across the stroke
    const patch = [9, 10, 11].flatMap((x) => [5, 6, 7].map((y) => [x, y, LIGHT] as const));
    const src = figure([
      [8, 3, GRAIN],
      [8, 4, LIGHT],
      [9, 4, INK],
      [8, 5, INK],
      ...patch,
      ...inkColumn(13),
    ]);
    const [out] = unmatte([src], S, S, PAPER, { grain: 2.25 });
    expect(patch.map(([x, y]) => px(out!, x, y)[3])).toEqual(Array(9).fill(0));
  });

  test("keeps a light gap between his legs whole when a seam past the sheet's ground closes its mouth", () => {
    // ΔE 6.3 from the paper, darker by more than a 2.25 grain: kept whole, and no ground of the sheet's
    const SEAM: Rgb = [233, 222, 202];
    const src = paint(legs(16), [8, 9], [16, 16], SEAM);
    const [out] = unmatte([src], S, S, PAPER, { grain: 2.25 });
    for (const [x, y] of gap(15)) expect(px(out!, x, y)).toEqual([...LIGHT, 255]);
  });

  test("keeps an enclosed speck lighter than the paper by more than the paper's core (ΔE 2) whole", () => {
    const speck = [6, 7].flatMap((x) => [9, 10].map((y) => [x, y, LIGHT] as const));
    const [out] = unmatte([figure([...speck, ...inkColumn(8)])], S, S, PAPER);
    for (const [x, y] of speck) expect(px(out!, x, y)).toEqual([...LIGHT, 255]);
  });

  test('clears light cloth whose clear region holds a pocket of paper px, though the cloth splits them into runs too small to be a sheet pocket', () => {
    const row = (y: number, c: Rgb) => [4, 5, 6].map((x) => [x, y, c] as const);
    const near = [7, 9, 11].flatMap((y) => row(y, NEAR));
    const cloth = [8, 10].flatMap((y) => row(y, CLOTH));
    const [out] = unmatte([figure([...near, ...cloth, ...inkColumn(8)])], S, S, PAPER);
    for (const [x, y] of cloth) expect(px(out!, x, y)[3]).toBe(0);
  });

  test("clears a light gap between his legs that the crop frame cuts through a row of the sheet's grain", () => {
    const GRAIN: Rgb = [239, 230, 212];
    const src = paint(legs(S - 1), [8, 9], [S - 1, S - 1], GRAIN);
    const [out] = unmatte([src], S, S, PAPER, { grain: 2.25 });
    for (const [x, y] of gap(S - 2)) expect(px(out!, x, y)[3]).toBe(0);
  });

  test('clears a light gap between his feet that only an inkless part (his shadow) closes below', () => {
    const body = paint(new Uint8Array(S * S * 4), [5, 12], [3, 14], INK);
    paint(body, [8, 9], [8, 14], LIGHT);
    const shadow = paint(new Uint8Array(S * S * 4), [1, 18], [15, 18], [215, 205, 190]);
    const [out] = unmatte([body, shadow], S, S, PAPER);
    for (const [x, y] of [
      [8, 13],
      [9, 13],
      [8, 14],
      [9, 14],
    ] as const)
      expect(px(out!, x, y)[3]).toBe(0);
  });

  test("clears a light gap between his legs whose mouth row is the sheet's grain, which a grain keeps whole", () => {
    // the sheet's grain at its coarsest (ΔE 3.67): darker than the paper by more than a 2.25 grain, so kept whole
    const GRAIN: Rgb = [239, 230, 212];
    const src = paint(legs(16), [8, 9], [16, 16], GRAIN);
    const [out] = unmatte([src], S, S, PAPER, { grain: 2.25 });
    for (const [x, y] of gap(15)) expect(px(out!, x, y)[3]).toBe(0);
  });

  test('clears a light gap between his feet that a shadow closes below, though one shadow px is as dark as ink', () => {
    const body = paint(new Uint8Array(S * S * 4), [5, 12], [3, 14], INK);
    paint(body, [8, 9], [8, 14], LIGHT);
    const shadow = paint(new Uint8Array(S * S * 4), [1, 18], [15, 18], [215, 205, 190]);
    paint(shadow, [3, 3], [16, 16], [90, 85, 80]);
    const [out] = unmatte([body, shadow], S, S, PAPER);
    for (const x of [8, 9]) for (const y of [13, 14]) expect(px(out!, x, y)[3]).toBe(0);
  });

  /** His feet (an ink body on x 5..12, y 3..14, a 2 px `LIGHT` gap at x 8..9, y 8..14), and below them a 72 px part of the shadow's paint with ink at the px `inks`. */
  const feetOver = (inks: ReadonlyArray<readonly [number, number]>) => {
    const body = paint(new Uint8Array(S * S * 4), [5, 12], [3, 14], INK);
    paint(body, [8, 9], [8, 14], LIGHT);
    const below = paint(new Uint8Array(S * S * 4), [1, 18], [15, 18], [215, 205, 190]);
    for (const [x, y] of inks) paint(below, [x, x], [y, y], INK);
    return unmatte([body, below], S, S, PAPER)[0]!;
  };

  test('clears a light gap between his feet that a shadow closes below, though 2 of its 72 px (2.8 %) are ink', () => {
    const out = feetOver([
      [3, 16],
      [16, 16],
    ]);
    for (const x of [8, 9]) for (const y of [13, 14]) expect(px(out, x, y)[3]).toBe(0);
  });

  test('keeps a light gap between his feet whole when the part that closes it below has 3 of its 72 px (4.2 %) ink, an outline and not a shadow', () => {
    const out = feetOver([
      [2, 16],
      [3, 16],
      [16, 16],
    ]);
    for (const x of [8, 9])
      for (const y of [13, 14]) expect(px(out, x, y)).toEqual([...LIGHT, 255]);
  });

  test('clears a light px that opens on ground the figure holds inside his outline', () => {
    const src = figure([[8, 9, CLOTH], [8, 10, CLOTH], ...inkColumn(13)]);
    for (let y = 8; y <= 11; y++) src.fill(0, (y * S + 9) * 4, (y * S + 12) * 4);
    const [out] = unmatte([src], S, S, PAPER);
    expect(px(out!, 8, 9)[3]).toBe(0);
    expect(px(out!, 8, 10)[3]).toBe(0);
  });

  test('keeps light cloth whole inside a faint outline (a 15 % ink mix, alpha about 38), which still walls it in', () => {
    // 15 % of the ink over the paper
    const FAINT: Rgb = [216, 206, 188];
    const src = paint(new Uint8Array(S * S * 4), [3, 4], [3, 16], INK);
    paint(src, [13, 14], [3, 16], INK);
    paint(src, [7, 11], [7, 11], FAINT);
    paint(src, [8, 10], [8, 10], CLOTH);
    const [out] = unmatte([src], S, S, PAPER);
    for (const x of [8, 9, 10])
      for (const y of [8, 9, 10]) expect(px(out!, x, y)).toEqual([...CLOTH, 255]);
  });
});
