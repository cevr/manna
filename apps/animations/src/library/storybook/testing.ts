import { rng } from '@manna/film/core';
import type { Raster } from '@manna/film/tools';
import { Option } from 'effect';
import { hexOf, type Palette, rgbAt, type Rgb } from './sheet.ts';

export const INK: Rgb = [30, 20, 15];
export const GROUND: Rgb = [240, 236, 220];
export const FOREIGN: Rgb = [0, 200, 0];

/** A picture drawn by rows of letters: `.` clear, every other letter the colour `key` gives it, opaque. */
export const art = (rows: ReadonlyArray<string>, key: Readonly<Record<string, Rgb>>): Raster => {
  const width = rows[0]?.length ?? 0;
  const rgba = new Uint8Array(width * rows.length * 4);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      rgba.set([...(key[ch] ?? FOREIGN), 255], (y * width + x) * 4);
    }),
  );
  return { width, height: rows.length, rgba };
};

export const SKIN: Rgb = [230, 180, 140];
export const ROBE: Rgb = [120, 60, 40];
export const SASH: Rgb = [200, 190, 220];
export const SANDAL: Rgb = [90, 60, 40];

export const DRESSED: Palette = {
  ink: hexOf(INK),
  parts: [
    { name: 'skin', base: hexOf(SKIN), role: 'skin' },
    { name: 'robe', base: hexOf(ROBE), role: 'garment' },
    { name: 'sash', base: hexOf(SASH), role: 'sash' },
    { name: 'sandals', base: hexOf(SANDAL), role: 'footwear' },
  ],
};

export const HAIR: Rgb = [60, 90, 150];

/** `DRESSED` with hair: the paints a face mark is drawn in. */
export const MARKED: Palette = {
  ink: DRESSED.ink,
  parts: [...DRESSED.parts, { name: 'hair', base: hexOf(HAIR), role: 'hair' }],
};

export const FIGURE_KEY = { k: INK, s: SKIN, r: ROBE, h: SASH, f: SANDAL };

/** The columns a band covers, inclusive, in its figure's own px: a mark drawn on part of the face, skin either side of it. */
type Span = readonly [number, number];

/** Every column inside the outline. */
export const WHOLE: Span = [0, Number.POSITIVE_INFINITY];

/** One band of a figure's head column, crown to soles: the row its paint ends at (a fraction of a row allowed), the paint, and the columns it covers (`WHOLE` when not given). */
export type Band = readonly [number, Rgb, Span?];

/** Where a figure is drawn: its width, outline to outline, and the clear columns left and right of it. */
interface Placing {
  readonly width: number;
  readonly left: number;
  readonly right: number;
}

/** A figure `width` px wide (15 unless placed) and `height` rows tall, outlined in ink at its sides, painted in `bands` moved `dy` of a row down, skin beside a band in the columns its span leaves: a row two bands share is their blend by cover, as drawing at a fraction of a pixel paints it. */
export const banded = (
  bands: ReadonlyArray<Band>,
  height: number,
  dy: number,
  placing: Placing = { width: 15, left: 0, right: 0 },
): Raster => {
  const { width, left, right } = placing;
  const across = left + width + right;
  const rgba = new Uint8Array(across * height * 4);
  const soles: Band = [Number.POSITIVE_INFINITY, SANDAL];
  const paintOf = (band: Band, x: number): Rgb => {
    const [x0, x1] = band[2] ?? WHOLE;
    if (x < x0 || x > x1) return SKIN;
    return band[1];
  };
  for (let y = 0; y < height; y++) {
    const edge = bands.map(([end]) => end + dy).find((e) => e > y && e < y + 1) ?? y;
    const cover = edge - y;
    const bandAt = (v: number): Band => bands.find(([end]) => v < end + dy) ?? soles;
    const [above, below] = [bandAt(y), bandAt(y + 0.999)];
    for (let x = 0; x < width; x++) {
      const [a, b] = [paintOf(above, x), paintOf(below, x)];
      const row = [0, 1, 2].map((k) => Math.round((a[k] ?? 0) * cover + (b[k] ?? 0) * (1 - cover)));
      const mixed = [a, [row[0] ?? 0, row[1] ?? 0, row[2] ?? 0] as const][Number(a !== b)] ?? a;
      const outline = x === 0 || x === width - 1;
      rgba.set([...([mixed, INK][Number(outline)] ?? mixed), 255], (y * across + left + x) * 4);
    }
  }
  return { width: across, height, rgba };
};

/** The paints a mark on a generated face is drawn in: either cloth, the ink, the sandals' paint, the hair. */
const MARK_PAINTS: ReadonlyArray<Rgb> = [ROBE, SASH, INK, SANDAL, HAIR];

/** The paints an edge below a mark is drawn in: mostly the ink, else the hair's or the sandals' paint. */
const EDGE_PAINTS: ReadonlyArray<Rgb> = [INK, INK, HAIR, SANDAL];

/** Whether `paint` is cloth, a paint a collar is drawn in. */
const isCloth = (paint: Rgb): boolean => paint === ROBE || paint === SASH;

/** The colour half `a` and half `b`: a blend no paint is exactly. */
const halfOf = (a: Rgb, b: Rgb): Rgb => [
  Math.round((a[0] + b[0]) / 2),
  Math.round((a[1] + b[1]) / 2),
  Math.round((a[2] + b[2]) / 2),
];

/**
 * A generated figure, the row its collar starts at, and whether its head
 * column can tell that collar from a mark: an ink crown; the face in skin
 * with up to three marks drawn on it, each in a cloth, the ink, the
 * sandals' or the hair's paint, from one row to six hundredths of the
 * figure deep (a jaw line as deep as a collar or deeper), across the face
 * or across the head column and part of the face with skin beside it, half
 * of them edged below in the ink, the hair's or the sandals' paint, a row
 * to a hundredth deep, with a blend row before or after it or none; skin
 * above and below; a collar band in a cloth from two rows to eight
 * hundredths deep; then the clothes, run on or broken by an ink line, a
 * sash, or a hand in skin right under the collar, ringed in ink, edged in
 * ink above and its sleeve joining its lower edge, or drawn straight on the
 * collar; the soles in sandals. A tenth of the figures wear no clothes
 * below the face. The figure is 15 to 40 px wide with up to 6 clear
 * columns either side of it.
 *
 * A mark across the whole face cuts the skin below it off from the face's
 * own skin. A cloth mark read in the head column at or below such a cut
 * leaves skin below it the face cannot reach, as a hand right under the
 * collar does: the column cannot tell the collar from the mark, so neither
 * is told.
 */
export const generatedFigure = (seed: number) => {
  const draw = rng(seed);
  const pick = <A>(xs: ReadonlyArray<A>, fallback: A): A =>
    xs[Math.floor(draw() * xs.length)] ?? fallback;
  const int = (a: number, b: number) => a + Math.floor(draw() * (b - a + 1));
  const height = 120 + Math.floor(draw() * 900);
  const dy = draw();
  const placing = { width: int(15, 40), left: int(0, 6), right: int(0, 6) };
  const column = Math.round(placing.left + (placing.width - 1) / 2) - placing.left;
  const bands: Array<Band> = [];
  const starts: Array<number> = [];
  const halves = new Set<Rgb>();
  const marks: Array<{ readonly mark: number; readonly part: boolean }> = [];
  const hands: Array<number> = [];
  let y = 0;
  const add = (depth: number, paint: Rgb, span: Span = WHOLE) => {
    starts.push(y);
    y += depth;
    bands.push([y, paint, span]);
    return bands.length - 1;
  };
  add(2 + draw() * height * 0.12, INK);
  add(4 + draw() * height * 0.06, SKIN);
  for (let k = Math.floor(draw() * 4); k > 0; k--) {
    const paint = pick(MARK_PAINTS, ROBE);
    const part = draw() < 0.5;
    const left = draw() < 0.5;
    const span: Span = [
      [1, [int(3, column - 1), 1][Number(left)] ?? 1][Number(part)] ?? 1,
      [
        placing.width - 2,
        [placing.width - 2, int(column + 1, placing.width - 4)][Number(left)] ?? placing.width - 2,
      ][Number(part)] ?? placing.width - 2,
    ];
    const mark = add(1 + draw() * height * 0.06, paint, span);
    const blend = int(0, 2);
    const half = (a: Rgb, b: Rgb) => {
      const c = halfOf(a, b);
      halves.add(c);
      add(1 + draw(), c, span);
    };
    if (draw() < 0.5) {
      const paintOfEdge = pick(EDGE_PAINTS, INK);
      if (blend === 1) half(paint, paintOfEdge);
      add(1 + draw() * height * 0.01, paintOfEdge, span);
      if (blend === 2) half(paintOfEdge, SKIN);
    }
    add(2 + draw() * height * 0.04, SKIN);
    marks.push({ mark, part });
  }
  const bare = draw() < 0.1;
  const collar = y + dy;
  const clothes: ReadonlyArray<ReadonlyArray<Rgb>> = [
    [ROBE],
    [INK, ROBE],
    [SASH, ROBE],
    [INK, ROBE, INK, SKIN, INK, ROBE],
    [INK, SKIN, INK, ROBE],
    [INK, SKIN, ROBE],
    [SKIN, ROBE],
  ];
  if (bare) add(Math.max(2, height * 0.92 - y), INK);
  else {
    add(2 + draw() * height * 0.08, pick([ROBE, SASH], ROBE));
    const below = pick(clothes, [ROBE]);
    const room = Math.max(0, height * 0.92 - y);
    const drawn = below.map((paint) =>
      add(Math.max(1, (room / below.length) * (0.5 + draw())), paint),
    );
    const hand = below.indexOf(SKIN);
    if (hand === 0 || hand === 1) hands.push(drawn[hand] ?? -1);
  }
  add(Math.max(2, height - y), SANDAL);
  const raster = banded(bands, Math.ceil(y), dy, placing);
  const shown = (band: number): boolean => {
    const paint = bands[band]?.[1] ?? SKIN;
    const [from, to] = [
      Math.floor((starts[band] ?? 0) + dy),
      Math.ceil((bands[band]?.[0] ?? 0) + dy),
    ];
    if (band < 0 || halves.has(paint)) return false;
    for (let row = from; row < Math.min(to, raster.height); row++)
      if (hexOf(rgbAt(raster, row * raster.width + placing.left + column)) === hexOf(paint))
        return true;
    return false;
  };
  const cut = marks.findIndex(({ part }) => !part);
  const cutOff = marks.some(
    ({ mark }, i) => cut >= 0 && i >= cut && isCloth(bands[mark]?.[1] ?? SKIN) && shown(mark),
  );
  return {
    raster,
    collar: Option.some(collar).pipe(Option.filter(() => !bare)),
    untold: cutOff || hands.some(shown),
  };
};

export const ANATOMY_INK: Rgb = [20, 10, 5];
export const ANATOMY_SKIN: Rgb = [240, 180, 130];
export const ANATOMY_ROBE: Rgb = [110, 130, 125];
export const ANATOMY_HAIR: Rgb = [90, 50, 20];
export const ANATOMY_SASH: Rgb = [150, 60, 80];
export const ANATOMY_SHOE: Rgb = [70, 50, 60];

/** The round-4 verifier's palette: ink, skin, a robe, hair, a sash and shoes. */
export const ANATOMY: Palette = {
  ink: hexOf(ANATOMY_INK),
  parts: [
    { name: 'skin', role: 'skin', base: hexOf(ANATOMY_SKIN) },
    { name: 'robe', role: 'garment', base: hexOf(ANATOMY_ROBE) },
    { name: 'hair', role: 'hair', base: hexOf(ANATOMY_HAIR) },
    { name: 'shoe', role: 'footwear', base: hexOf(ANATOMY_SHOE) },
    { name: 'sash', role: 'sash', base: hexOf(ANATOMY_SASH) },
  ],
};

/**
 * The round-4 verifier's figure (M1), 81 by 240, its body 41 px wide in ink
 * at its sides: hair to row 36, skin to 80, the collar in the robe from 80,
 * an ink line in rows 87 to 94, the robe on down. `paint` draws over it.
 */
export const anatomyFigure = (paint: (x: number, y: number) => Option.Option<Rgb>): Raster => {
  const [width, height] = [81, 240];
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 20; x <= 60; x++) {
      const drawn = [
        [y < 36, ANATOMY_HAIR],
        [y < 80, ANATOMY_SKIN],
        [y >= 87 && y < 95, ANATOMY_INK],
        [true, ANATOMY_ROBE],
      ] as const;
      const base = drawn.find(([at]) => at)?.[1] ?? ANATOMY_ROBE;
      const c = [base, ANATOMY_INK][Number(x === 20 || x === 60)] ?? base;
      rgba.set([...Option.getOrElse(paint(x, y), () => c), 255], (y * width + x) * 4);
    }
  return { width, height, rgba };
};
