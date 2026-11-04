import { labOf } from '@manna/film/core';
import type { Raster } from '@manna/film/tools';
import { Option, Result, Schema } from 'effect';

/** A colour: red, green, blue, 0..255 each. */
export type Rgb = readonly [number, number, number];

/** A box in a sheet's pixels: its left and top edges, its width and height. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** How near (ΔE76) a drawn pixel must lie to a palette colour to take it exactly. */
export const SNAP_RADIUS = 30;

/** How near the ground a pixel lies, as the sum of its three channels' differences, to be ground: the background's flood and a pocket's test. */
export const POCKET_SUM = 30;

/** What each part of a figure is, so a measure knows which lines a palette draws. */
export const ROLES = ['skin', 'hair', 'garment', 'sash', 'footwear', 'other'] as const;

export type Role = (typeof ROLES)[number];

const Hex = Schema.String.check(
  Schema.isPattern(/^#[0-9a-fA-F]{6}$/, { message: 'a colour as #rrggbb' }),
);

/** One part of a member's palette: its base paint, its shade paint when its look names one, and what it is. */
const PalettePart = Schema.Struct({
  name: Schema.String,
  base: Hex,
  shade: Schema.optionalKey(Hex),
  role: Schema.optionalKey(Schema.Literals(ROLES)),
});

/** A member's palette, `cast/<member>/cast-sheet/palette.json`: the ink and every part's paints. */
export const Palette = Schema.Struct({ ink: Hex, parts: Schema.Array(PalettePart) });

export type Palette = typeof Palette.Type;

export const PaletteJson = Schema.fromJsonString(Palette);

/** `#rrggbb` as a colour. */
export const rgbOfHex = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

/** A colour as `#rrggbb`, lowercase. */
export const hexOf = (c: Rgb): string =>
  `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** The sum of the three channels' differences of two colours. */
export const rgbSum = (a: Rgb, b: Rgb): number =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

/** ΔE76 between two colours. */
export const deltaE = (a: Rgb, b: Rgb): number => {
  const p = labOf(a);
  const q = labOf(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

/** One colour a palette paints: which part it belongs to, base or shade (or the ink), and its role. */
export interface Paint {
  readonly rgb: Rgb;
  readonly lab: Rgb;
  readonly part: string;
  readonly tone: 'base' | 'shade' | 'ink';
  readonly role: Role | 'ink';
}

/** Every colour of `palette`: the ink first, then each part's base and its shade, in the file's order. */
export const paintsOf = (palette: Palette): ReadonlyArray<Paint> => {
  const paint = (hex: string, part: string, tone: Paint['tone'], role: Paint['role']): Paint => ({
    rgb: rgbOfHex(hex),
    lab: labOf(rgbOfHex(hex)),
    part,
    tone,
    role,
  });
  return [
    paint(palette.ink, 'ink', 'ink', 'ink'),
    ...palette.parts.flatMap((p) => [
      paint(p.base, p.name, 'base', p.role ?? 'other'),
      ...Option.toArray(
        Option.map(Option.fromUndefinedOr(p.shade), (s) =>
          paint(s, p.name, 'shade', p.role ?? 'other'),
        ),
      ),
    ]),
  ];
};

/** The nearest paint to a colour, by its index in `paintsOf`, and how far (ΔE76) it lies. */
export interface Nearest {
  readonly index: number;
  readonly distance: number;
}

/** A lookup of the nearest paint to any colour, each colour worked out once. */
export const nearestOf = (paints: ReadonlyArray<Paint>): ((c: Rgb) => Nearest) => {
  const known = new Map<number, Nearest>();
  const find = (key: number, c: Rgb): Nearest => {
    const lab = labOf(c);
    let best: Nearest = { index: 0, distance: Number.POSITIVE_INFINITY };
    for (const [index, p] of paints.entries()) {
      const distance = Math.hypot(lab[0] - p.lab[0], lab[1] - p.lab[1], lab[2] - p.lab[2]);
      if (distance < best.distance) best = { index, distance };
    }
    known.set(key, best);
    return best;
  };
  return (c) => {
    const key = (c[0] << 16) | (c[1] << 8) | c[2];
    return known.get(key) ?? find(key, c);
  };
};

/** The colour of pixel `q` of `r`. */
export const rgbAt = (r: Raster, q: number): Rgb => [
  r.rgba[q * 4] ?? 0,
  r.rgba[q * 4 + 1] ?? 0,
  r.rgba[q * 4 + 2] ?? 0,
];

/** The alpha of pixel `q` of `r`. */
export const alphaAt = (r: Raster, q: number): number => r.rgba[q * 4 + 3] ?? 0;

/** Each pixel on the picture's edge, once. */
const borderOf = (width: number, height: number): ReadonlyArray<number> => {
  const border = new Set<number>();
  for (let x = 0; x < width; x++) border.add(x).add((height - 1) * width + x);
  for (let y = 0; y < height; y++) border.add(y * width).add(y * width + width - 1);
  return [...border];
};

/** The 4-neighbours of pixel `q` inside a `width` × `height` picture. */
const around4 = (q: number, width: number, height: number): ReadonlyArray<number> => {
  const x = q % width;
  const out: Array<number> = [];
  if (x > 0) out.push(q - 1);
  if (x < width - 1) out.push(q + 1);
  if (q >= width) out.push(q - width);
  if (q < (height - 1) * width) out.push(q + width);
  return out;
};

/** The 8-neighbours of pixel `q` inside a `width` × `height` picture. */
const around8 = (q: number, width: number, height: number): ReadonlyArray<number> => {
  const x = q % width;
  const y = (q - x) / width;
  const out: Array<number> = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx !== 0 || dy !== 0) && nx >= 0 && ny >= 0 && nx < width && ny < height)
        out.push(ny * width + nx);
    }
  return out;
};

/** The ground: the median of each channel over the sheet's border pixels. */
export const groundOf = (r: Raster): Rgb => {
  const border = borderOf(r.width, r.height);
  const median = (k: number) =>
    border.map((q) => r.rgba[q * 4 + k] ?? 0).sort((a, b) => a - b)[border.length >> 1] ?? 0;
  return [median(0), median(1), median(2)];
};

/** The sheet with its background cleared: every pixel joined to the border (4-connected) through pixels within `POCKET_SUM` of the ground, alpha 0. */
export const clearBackground = (r: Raster, ground: Rgb): Raster => {
  const rgba = r.rgba.slice();
  const seen = new Uint8Array(r.width * r.height);
  const stack = [...borderOf(r.width, r.height)];
  while (stack.length > 0) {
    const q = stack.pop() ?? 0;
    if (seen[q] === 1 || rgbSum(rgbAt(r, q), ground) > POCKET_SUM) continue;
    seen[q] = 1;
    rgba[q * 4 + 3] = 0;
    stack.push(...around4(q, r.width, r.height));
  }
  return { width: r.width, height: r.height, rgba };
};

/** How many opaque pixels each column of `r` holds. */
const occupancyOf = (r: Raster): ReadonlyArray<number> => {
  const occupancy = Array.from({ length: r.width }, () => 0);
  for (let y = 0; y < r.height; y++)
    for (let x = 0; x < r.width; x++)
      if (alphaAt(r, y * r.width + x) > 0) occupancy[x] = (occupancy[x] ?? 0) + 1;
  return occupancy;
};

/** A run of columns, first and last inside it. */
type Run = readonly [number, number];

/** The runs of columns strictly between `first` and `last` whose occupancy is at most `level`. */
const runsAtMost = (
  occupancy: ReadonlyArray<number>,
  first: number,
  last: number,
  level: number,
): ReadonlyArray<Run> => {
  const runs: Array<Run> = [];
  let start = -1;
  for (let x = first + 1; x < last; x++) {
    const low = (occupancy[x] ?? 0) <= level;
    if (low && start < 0) start = x;
    if (!low && start >= 0) {
      runs.push([start, x - 1]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, last - 1]);
  return runs;
};

/** The first and last occupied columns of `r`, none when it holds no opaque pixel. */
const spanOf = (occupancy: ReadonlyArray<number>): Option.Option<Run> => {
  const first = occupancy.findIndex((n) => n > 0);
  const last = occupancy.findLastIndex((n) => n > 0);
  return Option.some<Run>([first, last]).pipe(Option.filter(() => first >= 0));
};

/** The runs at the lowest of `levels` that has at least `count` of them. */
const lowestRuns = (
  occupancy: ReadonlyArray<number>,
  first: number,
  last: number,
  levels: ReadonlyArray<number>,
  count: number,
): Option.Option<ReadonlyArray<Run>> => {
  for (const level of levels) {
    const runs = runsAtMost(occupancy, first, last, level);
    if (runs.length >= count) return Option.some(runs);
  }
  return Option.none();
};

/** A sheet the split cannot cut as asked, and why. */
export class SplitRefused extends Schema.TaggedError<SplitRefused>()('SplitRefused', {
  reason: Schema.String,
}) {
  override get message() {
    return `the sheet does not split: ${this.reason}`;
  }
}

/**
 * The `n` cells of a cleared sheet, left to right: the `n` − 1 cuts lie in
 * the `n` − 1 widest runs of the lowest occupancy between the first and last
 * occupied columns (the next level up when the lowest has too few runs), each
 * at its run's centre; each cell spans cut to cut and the sheet's full height.
 */
export const cellsOf = (r: Raster, n: number): Result.Result<ReadonlyArray<Box>, SplitRefused> => {
  const occupancy = occupancyOf(r);
  const span = spanOf(occupancy);
  if (Option.isNone(span)) return Result.fail(SplitRefused.make({ reason: 'it holds no figure' }));
  const [first, last] = span.value;
  const levels = [...new Set(occupancy.slice(first, last + 1))].sort((a, b) => a - b);
  const runs = lowestRuns(occupancy, first, last, levels, n - 1);
  if (Option.isNone(runs))
    return Result.fail(SplitRefused.make({ reason: `it holds no ${n - 1} gaps to cut in` }));
  const cuts = runs.value
    .toSorted((a, b) => b[1] - b[0] - (a[1] - a[0]) || a[0] - b[0])
    .slice(0, n - 1)
    .map(([a, b]) => Math.floor((a + b) / 2))
    .sort((a, b) => a - b);
  const edges = [first, ...cuts, last + 1];
  return Result.succeed(
    Array.from({ length: n }, (_, i) => {
      const x = edges[i] ?? 0;
      return { x, y: 0, width: (edges[i + 1] ?? x) - x, height: r.height };
    }),
  );
};

/** How many figures a cleared sheet holds: one more than its runs of empty columns between its first and last occupied ones. */
export const figuresIn = (r: Raster): number => {
  const occupancy = occupancyOf(r);
  return Option.match(spanOf(occupancy), {
    onNone: () => 0,
    onSome: ([first, last]) => runsAtMost(occupancy, first, last, 0).length + 1,
  });
};

/** The part of `r` inside `box`, pixel (u, v) the sheet's (x + u, y + v). */
export const cropOf = (r: Raster, box: Box): Raster => {
  const rgba = new Uint8Array(box.width * box.height * 4);
  for (let v = 0; v < box.height; v++)
    rgba.set(
      r.rgba.subarray(
        ((box.y + v) * r.width + box.x) * 4,
        ((box.y + v) * r.width + box.x + box.width) * 4,
      ),
      v * box.width * 4,
    );
  return { width: box.width, height: box.height, rgba };
};

/** The pixels of each connected region of `r` that `member` admits, found by `around`, in scan order of their first pixel. */
const regionsOf = (
  r: Raster,
  member: (q: number) => boolean,
  around: (q: number, width: number, height: number) => ReadonlyArray<number>,
): ReadonlyArray<ReadonlyArray<number>> => {
  const seen = new Uint8Array(r.width * r.height);
  const regions: Array<Array<number>> = [];
  for (let q0 = 0; q0 < r.width * r.height; q0++) {
    if (seen[q0] === 1 || !member(q0)) continue;
    const region: Array<number> = [];
    const stack = [q0];
    seen[q0] = 1;
    while (stack.length > 0) {
      const q = stack.pop() ?? 0;
      region.push(q);
      for (const m of around(q, r.width, r.height)) {
        if (seen[m] === 1 || !member(m)) continue;
        seen[m] = 1;
        stack.push(m);
      }
    }
    regions.push(region);
  }
  return regions;
};

/** `r` with only its largest 8-connected opaque piece left (the first found of equal ones). */
export const largestPiece = (r: Raster): Raster => {
  const pieces = regionsOf(r, (q) => alphaAt(r, q) > 0, around8);
  const keep = new Set(
    pieces.reduce<ReadonlyArray<number>>((best, p) => {
      if (p.length > best.length) return p;
      return best;
    }, []),
  );
  const rgba = r.rgba.slice();
  for (let q = 0; q < r.width * r.height; q++) if (!keep.has(q)) rgba[q * 4 + 3] = 0;
  return { width: r.width, height: r.height, rgba };
};

/** The paint most of a pocket's non-ink rim pixels lie nearest, none when its rim is all ink (or it has none). */
const rimPaint = (
  r: Raster,
  pocket: ReadonlyArray<number>,
  nearest: (c: Rgb) => Nearest,
): Option.Option<number> => {
  const inside = new Set(pocket);
  const votes = new Map<number, number>();
  for (const q of pocket)
    for (const m of around4(q, r.width, r.height)) {
      if (inside.has(m) || alphaAt(r, m) === 0) continue;
      const { index } = nearest(rgbAt(r, m));
      if (index !== 0) votes.set(index, (votes.get(index) ?? 0) + 1);
    }
  return Option.fromUndefinedOr(
    [...votes].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([index]) => index)[0],
  );
};

/**
 * `r` with its pockets mended (owner, take 3: a raised sleeve painted the
 * paper's colour keyed out): each 4-connected region of opaque pixels within
 * `POCKET_SUM` of the ground is a true gap, cleared, when every opaque
 * 4-neighbour round it is ink, and else a garment painted the paper's
 * colour, refilled with the paint most of its non-ink rim lies nearest.
 */
export const mendPockets = (r: Raster, ground: Rgb, paints: ReadonlyArray<Paint>): Raster => {
  const nearest = nearestOf(paints);
  const pockets = regionsOf(
    r,
    (q) => alphaAt(r, q) > 0 && rgbSum(rgbAt(r, q), ground) <= POCKET_SUM,
    around4,
  );
  const rgba = r.rgba.slice();
  for (const pocket of pockets)
    Option.match(rimPaint(r, pocket, nearest), {
      onNone: () => {
        for (const q of pocket) rgba[q * 4 + 3] = 0;
      },
      onSome: (index) => {
        const fill = paints[index]?.rgb ?? ground;
        for (const q of pocket) rgba.set(fill, q * 4);
      },
    });
  return { width: r.width, height: r.height, rgba };
};

/** `r` snapped: every opaque pixel at alpha 255, each within `SNAP_RADIUS` of a paint taking that paint exactly, a farther one kept as drawn. */
export const snapped = (r: Raster, paints: ReadonlyArray<Paint>): Raster => {
  const nearest = nearestOf(paints);
  const rgba = r.rgba.slice();
  for (let q = 0; q < r.width * r.height; q++) {
    if (alphaAt(r, q) === 0) continue;
    rgba[q * 4 + 3] = 255;
    const { index, distance } = nearest(rgbAt(r, q));
    if (distance <= SNAP_RADIUS) rgba.set(paints[index]?.rgb ?? rgbAt(r, q), q * 4);
  }
  return { width: r.width, height: r.height, rgba };
};

/** One cell of a split sheet: its box in the sheet and its pixels. */
export interface SplitCell {
  readonly box: Box;
  readonly raster: Raster;
}

/** A split sheet: its measured ground and its cells, left to right. */
export interface Split {
  readonly ground: Rgb;
  readonly cells: ReadonlyArray<SplitCell>;
}

/** A drawn sheet split into `n` cells: the background cleared, the cells cut, each kept to its largest piece, its pockets mended and its paints snapped to `palette`. */
export const splitSheet = (
  sheet: Raster,
  n: number,
  palette: Palette,
): Result.Result<Split, SplitRefused> => {
  const ground = groundOf(sheet);
  const cleared = clearBackground(sheet, ground);
  const paints = paintsOf(palette);
  return Result.map(cellsOf(cleared, n), (boxes) => ({
    ground,
    cells: boxes.map((box) => ({
      box,
      raster: snapped(mendPockets(largestPiece(cropOf(cleared, box)), ground, paints), paints),
    })),
  }));
};

/** The share of a picture taken as its ink: its darkest 2 % of opaque pixels. */
const INK_SHARE = 0.02;

/** The ink a kept view draws: each channel's median over its darkest 2 % (by Lab lightness) of fully opaque pixels. */
export const measuredInk = (r: Raster): Rgb => {
  const opaque: Array<{ readonly rgb: Rgb; readonly l: number }> = [];
  for (let q = 0; q < r.width * r.height; q++)
    if (alphaAt(r, q) === 255) opaque.push({ rgb: rgbAt(r, q), l: labOf(rgbAt(r, q))[0] });
  const darkest = opaque
    .sort((a, b) => a.l - b.l)
    .slice(0, Math.max(1, Math.ceil(opaque.length * INK_SHARE)));
  const median = (k: 0 | 1 | 2) =>
    darkest.map((p) => p.rgb[k]).sort((a, b) => a - b)[darkest.length >> 1] ?? 0;
  return [median(0), median(1), median(2)];
};
