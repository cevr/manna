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

/** How near (ΔE76) a drawn colour lies to the paint it snaps to for the snap to read it as that paint drawn plain; a farther one, up to `SNAP_RADIUS`, is a blend or a thin line. Ground drawn this near the ground's colour, lighter or darker inside a ring of outline, is ground too. */
export const PLAIN_RADIUS = 12;

/** What each part of a figure is, so a measure knows which lines a palette draws; a `prop` is a thing a sheet's figure holds (`SheetRecord.props`), whose paint a pixel takes only by its own drawn colour, never as a rule's stand-in for another paint. */
export const ROLES = ['skin', 'hair', 'garment', 'sash', 'footwear', 'other', 'prop'] as const;

export type Role = (typeof ROLES)[number];

const Hex = Schema.String.check(
  Schema.isPattern(/^#[0-9a-fA-F]{6}$/, { message: 'a colour as #rrggbb' }),
);

/** One part of a member's palette: its base paint, its shade paint when its look names one, and what it is. */
export const PalettePart = Schema.Struct({
  name: Schema.String,
  base: Hex,
  shade: Schema.optionalKey(Hex),
  role: Schema.optionalKey(Schema.Literals(ROLES)),
});

export type PalettePart = typeof PalettePart.Type;

/** A member's palette, `cast/<member>/cast-sheet/palette.json`: the ink and every part's paints. */
export const Palette = Schema.Struct({
  ink: Hex,
  parts: Schema.Array(PalettePart),
  /** The member's head (crown to collar) as a share of a grown adult's, measured on the kept lineup: 1 when it names none. */
  head: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThan(0))),
  /** A head share by sheet id, for a sheet that draws another of the member's people (a member that holds a grown villager and a baby): it wins over `head` on that sheet. */
  heads: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Finite.check(Schema.isGreaterThan(0))),
  ),
});

export type Palette = typeof Palette.Type;

export const PaletteJson = Schema.fromJsonString(Palette);

/** A member's palette as one sheet splits with it: its parts, then the props that sheet alone adds (`SheetRecord.props`), so every paint the member has keeps its place and the member's other sheets split as before. */
export const withProps = (palette: Palette, props: ReadonlyArray<PalettePart>): Palette => ({
  ...palette,
  parts: [...palette.parts, ...props],
});

/** The head share a member's sheet draws: the sheet's own (`heads`), else the member's (`head`), else a grown adult's 1. */
export const shareOf = (palette: Palette, sheet: string): number =>
  palette.heads?.[sheet] ?? palette.head ?? 1;

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

/** `nearestOf` read at pixel `q` of a picture: the colour's key taken from its bytes, and the last colour met answered first, so a scan over a run of one paint looks nothing up and builds no colour it has met before. */
const pixelNearestOf = (paints: ReadonlyArray<Paint>): ((r: Raster, q: number) => Nearest) => {
  const nearest = nearestOf(paints);
  const known = new Map<number, Nearest>();
  let lastKey = -1;
  let last: Nearest = { index: 0, distance: Number.POSITIVE_INFINITY };
  return (r, q) => {
    const p = q * 4;
    const key = ((r.rgba[p] ?? 0) << 16) | ((r.rgba[p + 1] ?? 0) << 8) | (r.rgba[p + 2] ?? 0);
    if (key === lastKey) return last;
    const found = known.get(key) ?? nearest(rgbAt(r, q));
    known.set(key, found);
    lastKey = key;
    last = found;
    return found;
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

/** The pixels `member` admits reached from `q0` (admitted, marked seen) through `around`, every pixel reached marked in `seen`. */
const flood = (
  r: Raster,
  seen: Uint8Array,
  q0: number,
  member: (q: number) => boolean,
  around: (q: number, width: number, height: number) => ReadonlyArray<number>,
): Array<number> => {
  const region: Array<number> = [];
  const stack = [q0];
  while (stack.length > 0) {
    const q = stack.pop() ?? 0;
    region.push(q);
    for (const m of around(q, r.width, r.height)) {
      if (seen[m] === 1 || !member(m)) continue;
      seen[m] = 1;
      stack.push(m);
    }
  }
  return region;
};

/** The pixels of each connected region of `r` that `member` admits with its first pixel in `box`, found by `around`, in scan order of their first pixel. */
const regionsIn = (
  r: Raster,
  box: Box,
  member: (q: number) => boolean,
  around: (q: number, width: number, height: number) => ReadonlyArray<number>,
): ReadonlyArray<ReadonlyArray<number>> => {
  const seen = new Uint8Array(r.width * r.height);
  const regions: Array<Array<number>> = [];
  for (let y = box.y; y < box.y + box.height; y++)
    for (let q0 = y * r.width + box.x; q0 < y * r.width + box.x + box.width; q0++) {
      if (seen[q0] === 1 || !member(q0)) continue;
      seen[q0] = 1;
      regions.push(flood(r, seen, q0, member, around));
    }
  return regions;
};

/** The pixels of each connected region of `r` that `member` admits, found by `around`, in scan order of their first pixel. */
const regionsOf = (
  r: Raster,
  member: (q: number) => boolean,
  around: (q: number, width: number, height: number) => ReadonlyArray<number>,
): ReadonlyArray<ReadonlyArray<number>> =>
  regionsIn(r, { x: 0, y: 0, width: r.width, height: r.height }, member, around);

/** The pixels of the connected region of `r` that `member` admits holding `seed`, found by `around`; none when `member` does not admit `seed`. */
const regionAt = (
  r: Raster,
  seed: number,
  member: (q: number) => boolean,
  around: (q: number, width: number, height: number) => ReadonlyArray<number>,
): ReadonlyArray<number> => {
  if (!member(seed)) return [];
  const seen = new Uint8Array(r.width * r.height);
  seen[seed] = 1;
  return flood(r, seen, seed, member, around);
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

/**
 * The paint most of a pocket's plain non-ink rim pixels are, each rim pixel
 * counted once however many pocket pixels it touches; none when no rim
 * pixel is a paint other than the ink drawn plain (within `PLAIN_RADIUS`):
 * an outline's soft edge, a blend of ink and ground, casts no vote.
 */
const rimPaint = (
  r: Raster,
  pocket: ReadonlyArray<number>,
  nearest: (c: Rgb) => Nearest,
): Option.Option<number> => {
  const inside = new Set(pocket);
  const rim = new Set(
    pocket.flatMap((q) =>
      around4(q, r.width, r.height).filter((m) => !inside.has(m) && alphaAt(r, m) > 0),
    ),
  );
  const votes = new Map<number, number>();
  for (const m of rim) {
    const { index, distance } = nearest(rgbAt(r, m));
    if (index !== 0 && distance <= PLAIN_RADIUS) votes.set(index, (votes.get(index) ?? 0) + 1);
  }
  return Option.fromUndefinedOr(
    [...votes].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([index]) => index)[0],
  );
};

/**
 * `r` with its pockets mended (owner, take 3: a raised sleeve painted the
 * paper's colour keyed out): each 4-connected region of opaque pixels of
 * the ground (within `POCKET_SUM` of it, or within `PLAIN_RADIUS` ΔE: the
 * ground a drawing paints a little lighter inside a ring of outline) is a
 * true gap, cleared, when no plain paint but the ink lies round it, and
 * else a garment painted the paper's colour, refilled with the paint most
 * of its plain rim is, by `nearest` (`rimPaint`).
 */
export const mendPockets = (
  r: Raster,
  ground: Rgb,
  paints: ReadonlyArray<Paint>,
  nearest: (c: Rgb) => Nearest,
): Raster => {
  const groundLab = labOf(ground);
  const known = new Map<number, boolean>();
  const fresh = (key: number, c: Rgb): boolean => {
    const lab = labOf(c);
    const near = Math.hypot(lab[0] - groundLab[0], lab[1] - groundLab[1], lab[2] - groundLab[2]);
    const answer = rgbSum(c, ground) <= POCKET_SUM || near <= PLAIN_RADIUS;
    known.set(key, answer);
    return answer;
  };
  const isGround = (c: Rgb): boolean => {
    const key = (c[0] << 16) | (c[1] << 8) | c[2];
    return known.get(key) ?? fresh(key, c);
  };
  const pockets = regionsOf(r, (q) => alphaAt(r, q) > 0 && isGround(rgbAt(r, q)), around4);
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

/** How many rounds the drawn paints are read again from the colours they gather: a fixed count, so two splits of one sheet agree. */
const DRAWN_ROUNDS = 8;

/** One drawn colour of a sheet: its Lab and how many opaque pixels are drawn in it. */
interface DrawnColour {
  readonly rgb: Rgb;
  readonly lab: Rgb;
  readonly count: number;
}

/** The weighted median of each Lab channel of `colours`. */
const medianLab = (colours: ReadonlyArray<DrawnColour>): Rgb => {
  const total = colours.reduce((sum, c) => sum + c.count, 0);
  const channel = (k: 0 | 1 | 2): number => {
    const sorted = colours.toSorted((a, b) => a.lab[k] - b.lab[k]);
    let seen = 0;
    for (const c of sorted) {
      seen += c.count;
      if (seen * 2 >= total) return c.lab[k];
    }
    return 0;
  };
  return [channel(0), channel(1), channel(2)];
};

/** How much nearer its nearest paint than its second a colour must lie for its offset from that paint to count toward the sheet's cast. */
const PLAIN_SHARE = 0.5;

/**
 * The sheet's cast: the per-channel weighted median, in Lab, of each plain
 * colour's offset from its nearest paint, a plain colour being one within
 * `SNAP_RADIUS` of a paint and at most `PLAIN_SHARE` as far from it as from
 * any other; none (0, 0, 0) when no colour is plain.
 */
const castOf = (colours: ReadonlyArray<DrawnColour>, paints: ReadonlyArray<Paint>): Rgb => {
  const offsets = colours.flatMap((c): ReadonlyArray<DrawnColour> => {
    const [first, second] = paints
      .map((p) => ({
        p,
        distance: Math.hypot(c.lab[0] - p.lab[0], c.lab[1] - p.lab[1], c.lab[2] - p.lab[2]),
      }))
      .toSorted((a, b) => a.distance - b.distance);
    if (!first || first.distance > SNAP_RADIUS) return [];
    if (second && first.distance > second.distance * PLAIN_SHARE) return [];
    const lab: Rgb = [
      c.lab[0] - first.p.lab[0],
      c.lab[1] - first.p.lab[1],
      c.lab[2] - first.p.lab[2],
    ];
    return [{ rgb: c.rgb, lab, count: c.count }];
  });
  if (offsets.length === 0) return [0, 0, 0];
  return medianLab(offsets);
};

/** ΔE76 between two Lab colours. */
const labDistance = (a: Rgb, b: Rgb): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The difference (ΔE76) below which two paints are one colour to the eye: no drawing tells them apart. */
const ONE_TO_THE_EYE = 2.3;

/** Each paint's leader: the first paint, in palette order, its own leader and less than `ONE_TO_THE_EYE` from it; the drawn snap tells leaders apart, and a leader's paints by their hexes. */
const leadersOf = (paints: ReadonlyArray<Paint>): ReadonlyArray<number> => {
  const leaders: Array<number> = [];
  for (const [i, p] of paints.entries()) {
    const leader = paints.findIndex(
      (o, j) => j < i && leaders[j] === j && labDistance(o.lab, p.lab) < ONE_TO_THE_EYE,
    );
    if (leader < 0) leaders.push(i);
    else leaders.push(leader);
  }
  return leaders;
};

/** The index of the paint among `candidates` whose Lab in `labs` lies nearest `lab`, the first of equals. */
const nearestAmong = (
  lab: Rgb,
  candidates: ReadonlyArray<number>,
  labs: ReadonlyArray<Rgb>,
): number => {
  let best = candidates[0] ?? 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const i of candidates) {
    const p = labs[i] ?? lab;
    const distance = Math.hypot(lab[0] - p[0], lab[1] - p[1], lab[2] - p[2]);
    if (distance < bestDistance) [best, bestDistance] = [i, distance];
  }
  return best;
};

/**
 * The paint each colour of a drawn sheet was drawn as: of the paints within
 * `SNAP_RADIUS` of the colour, the one whose colour as this sheet draws it
 * lies nearest, and its distance from the palette's own colour; a colour no
 * paint lies within the radius of answers its nearest paint, as
 * `nearestOf`. A drawing shifts its paints off their hexes (a warm cast, a
 * paler cream), so two close paints can both lie nearer one hex; the colour
 * each is drawn in on the sheet tells them apart. Each leading paint's
 * drawn colour (`leadersOf`: paints one to the eye share one) starts at its
 * own moved by the sheet's cast (`castOf`), and is read again
 * `DRAWN_ROUNDS` times as the per-channel median, in Lab, of the sheet's
 * opaque colours it gathers; a paint that gathers none keeps its last.
 * Among a leader's paints a colour takes the nearest hex, as `nearestOf`.
 */
export const drawnNearestOf = (r: Raster, paints: ReadonlyArray<Paint>): ((c: Rgb) => Nearest) => {
  const byPalette = nearestOf(paints);
  const counts = new Map<number, number>();
  for (let q = 0; q < r.width * r.height; q++) {
    if (alphaAt(r, q) === 0) continue;
    const c = rgbAt(r, q);
    const key = (c[0] << 16) | (c[1] << 8) | c[2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const leaders = leadersOf(paints);
  const colours = [...counts]
    .map(([key, count]): DrawnColour => {
      const rgb: Rgb = [(key >> 16) & 255, (key >> 8) & 255, key & 255];
      return { rgb, lab: labOf(rgb), count };
    })
    .map((c) => {
      const within = paints.flatMap((p, i) => {
        if (labDistance(c.lab, p.lab) > SNAP_RADIUS) return [];
        return [i];
      });
      return { ...c, within, led: [...new Set(within.map((i) => leaders[i] ?? i))] };
    })
    .filter((c) => c.within.length > 0);
  const cast = castOf(colours, paints);
  let drawn: ReadonlyArray<Rgb> = paints.map((p) => [
    p.lab[0] + cast[0],
    p.lab[1] + cast[1],
    p.lab[2] + cast[2],
  ]);
  for (let round = 0; round < DRAWN_ROUNDS; round++) {
    const gathered = paints.map((): Array<DrawnColour> => []);
    for (const c of colours) gathered[nearestAmong(c.lab, c.led, drawn)]?.push(c);
    drawn = gathered.map((g, i) => {
      if (g.length === 0) return drawn[i] ?? [0, 0, 0];
      return medianLab(g);
    });
  }
  const settled = drawn;
  const hexes = paints.map((p) => p.lab);
  const known = new Map(
    colours.map((c) => {
      const leader = nearestAmong(c.lab, c.led, settled);
      const index = nearestAmong(
        c.lab,
        c.within.filter((i) => leaders[i] === leader),
        hexes,
      );
      return [
        (c.rgb[0] << 16) | (c.rgb[1] << 8) | c.rgb[2],
        { index, distance: labDistance(c.lab, hexes[index] ?? c.lab) },
      ] as const;
    }),
  );
  return (c) => known.get((c[0] << 16) | (c[1] << 8) | c[2]) ?? byPalette(c);
};

/** `r` snapped: every opaque pixel at alpha 255, each whose paint by `nearest` lies within `SNAP_RADIUS` taking that paint exactly, a farther one kept as drawn. */
export const snapped = (
  r: Raster,
  paints: ReadonlyArray<Paint>,
  nearest: (c: Rgb) => Nearest,
): Raster => {
  const rgba = r.rgba.slice();
  for (let q = 0; q < r.width * r.height; q++) {
    if (alphaAt(r, q) === 0) continue;
    rgba[q * 4 + 3] = 255;
    const { index, distance } = nearest(rgbAt(r, q));
    if (distance <= SNAP_RADIUS) rgba.set(paints[index]?.rgb ?? rgbAt(r, q), q * 4);
  }
  return { width: r.width, height: r.height, rgba };
};

/** How far (px) along a row, a column or a diagonal the line rule looks each way for the paints a thin line lies between. */
const LINE_REACH = 3;

/** How far (px, in the square round it) a pixel of a skin paint may lie from skin base: farther, it is cloth drawn in a skin colour. */
export const SKIN_REACH = 4;

/** The most pixels a 4-connected island of one paint holds for the snap to read it as a speck. */
export const SPECK_PX = 12;

/** How many pixels deep the split peels a figure's rim of everything but ink. */
export const RIM_PEEL = 2;

/** A pixel of a paint map that is clear, and one the snap kept as drawn. */
const CLEAR = -1;
const DRAWN = -2;

/** The steps of a row, a column and the two diagonals, in the order the line rule reads them. */
const AXES: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/** A colour as one number, for a lookup. */
const keyOf = (c: Rgb): number => (c[0] << 16) | (c[1] << 8) | c[2];

/** A snapped picture as a paint map: each pixel's paint index, `CLEAR` or `DRAWN`. */
const paintMapOf = (snap: Raster, paints: ReadonlyArray<Paint>): Int32Array => {
  const byColour = new Map(paints.map((p, i) => [keyOf(p.rgb), i] as const));
  const map = new Int32Array(snap.width * snap.height);
  for (let q = 0; q < map.length; q++) {
    map[q] = CLEAR;
    if (alphaAt(snap, q) > 0) map[q] = byColour.get(keyOf(rgbAt(snap, q))) ?? DRAWN;
  }
  return map;
};

/** What the tidying rules read: the drawing, its snapped paint map, the paints and how far each drawn pixel lies from its paint. */
interface Tidy {
  readonly drawn: Raster;
  readonly map: Int32Array;
  readonly paints: ReadonlyArray<Paint>;
  readonly loose: Uint8Array;
}

/** The paint a thin line meets `LINE_REACH` px or less from `q` along (`dx`, `dy`): the first plain paint other than ink, past any loose pixel; none at ink, a clear pixel or the edge. */
const sideOf = (t: Tidy, q: number, dx: number, dy: number): Option.Option<number> => {
  const { width, height } = t.drawn;
  const [x, y] = [q % width, Math.floor(q / width)];
  for (let k = 1; k <= LINE_REACH; k++) {
    const [u, v] = [x + dx * k, y + dy * k];
    if (u < 0 || v < 0 || u >= width || v >= height) return Option.none();
    const m = v * width + u;
    const index = t.map[m] ?? CLEAR;
    if (index === CLEAR || index === 0) return Option.none();
    if (index > 0 && t.loose[m] === 0) return Option.some(index);
  }
  return Option.none();
};

/**
 * What a thin line at `q` is (critique 1, item 1): a loose pixel darker
 * than the plain paints either side of it along a row, a column or a
 * diagonal (the first that has both) is a line; between two parts it is
 * the ink, inside one part that part's shade (its base when it has none).
 * None for any other pixel.
 */
const lineAt = (
  t: Tidy,
  q: number,
  shadeOf: ReadonlyMap<string, number>,
): Option.Option<number> => {
  const index = t.map[q] ?? CLEAR;
  if (index <= 0 || t.loose[q] === 0) return Option.none();
  const lightness = labOf(rgbAt(t.drawn, q))[0];
  const lighter = (i: number) => (t.paints[i]?.lab[0] ?? 0) > lightness;
  for (const [dx, dy] of AXES) {
    const sides = Option.all([sideOf(t, q, dx, dy), sideOf(t, q, -dx, -dy)]);
    if (Option.isNone(sides)) continue;
    const [a, b] = sides.value;
    if (!lighter(a) || !lighter(b)) continue;
    const [pa, pb] = [t.paints[a]?.part ?? '', t.paints[b]?.part ?? ''];
    if (pa !== pb) return Option.some(0);
    return Option.some(shadeOf.get(pa) ?? a);
  }
  return Option.none();
};

/** Each pixel's count of `mask` pixels in the square `reach` px round it, through a summed-area table. */
const nearCounts = (mask: Uint8Array, width: number, height: number, reach: number) => {
  const sums = new Int32Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      sums[(y + 1) * (width + 1) + x + 1] =
        (mask[y * width + x] ?? 0) +
        (sums[y * (width + 1) + x + 1] ?? 0) +
        (sums[(y + 1) * (width + 1) + x] ?? 0) -
        (sums[y * (width + 1) + x] ?? 0);
  return (q: number): number => {
    const [x, y] = [q % width, Math.floor(q / width)];
    const [x0, y0] = [Math.max(0, x - reach), Math.max(0, y - reach)];
    const [x1, y1] = [Math.min(width, x + reach + 1), Math.min(height, y + reach + 1)];
    return (
      (sums[y1 * (width + 1) + x1] ?? 0) -
      (sums[y0 * (width + 1) + x1] ?? 0) -
      (sums[y1 * (width + 1) + x0] ?? 0) +
      (sums[y0 * (width + 1) + x0] ?? 0)
    );
  };
};

/**
 * The map with skin only by skin (critique 1, item 1: no rose on cloth): a
 * pixel of a skin paint with no skin base within `SKIN_REACH` px takes the
 * nearest paint, to its drawn colour, that is neither skin nor a prop.
 */
const skinBySkin = (t: Tidy, map: Int32Array, feetBarred: (q: number) => boolean): Int32Array => {
  const skin = (i: number) => t.paints[i]?.role === 'skin';
  const others = t.paints.flatMap((p, i) => {
    if (p.role === 'skin' || p.role === 'prop') return [];
    return [i];
  });
  const high = others.filter((i) => t.paints[i]?.role !== 'footwear');
  const base = Uint8Array.from(map, (i) => Number(skin(i) && t.paints[i]?.tone === 'base'));
  const near = nearCounts(base, t.drawn.width, t.drawn.height, SKIN_REACH);
  const labs = t.paints.map((p) => p.lab);
  return map.map((index, q) => {
    if (index < 0 || !skin(index) || near(q) > 0) return index;
    return nearestAmong(
      labOf(rgbAt(t.drawn, q)),
      [others, high][Number(feetBarred(q))] ?? others,
      labs,
    );
  });
};

/** The pixels of the 4-connected island of `map`'s paint at `q`, `seen` marked as it goes. */
const islandAt = (map: Int32Array, width: number, q0: number, seen: Uint8Array) => {
  const index = map[q0];
  const island: Array<number> = [];
  const stack = [q0];
  seen[q0] = 1;
  while (stack.length > 0) {
    const q = stack.pop() ?? 0;
    island.push(q);
    for (const m of around4(q, width, map.length / width)) {
      if (seen[m] === 1 || map[m] !== index) continue;
      seen[m] = 1;
      stack.push(m);
    }
  }
  return island;
};

/**
 * The map with its specks gone (critique 1, item 6): each 4-connected
 * island of one paint other than ink, `SPECK_PX` pixels or fewer, takes the
 * paint most of its distinct rim pixels are (the ink, clear and drawn
 * pixels not counted; the lower index of equals); an island whose rim holds
 * no such paint stays.
 */
const despecked = (map: Int32Array, width: number): Int32Array =>
  islandsTaken(map, width, () => SPECK_PX);

/** The most pixels a 4-connected island of a prop's paint holds for the split to read it as a fleck of the figure's own colour, not the prop: a prop a figure holds is drawn far larger (the lead's bottle about 1,300 px, the diner's open mouth about 440). */
export const PROP_FLECK_PX = 60;

/**
 * The map with every fleck of a prop's paint gone (`role: 'prop'`): each
 * 4-connected island of a prop paint, `PROP_FLECK_PX` pixels or fewer,
 * takes the paint most of its rim is, as a speck does, or the ink where
 * its rim is all ink; a figure's light fringe drawn near a prop's colour
 * stays the figure's (critique 1, items 6 and 7). Then each 4-connected
 * island of a costume paint (garment, sash or other) smaller than the prop
 * whose painted rim is mostly prop paint takes the prop paint most of that
 * rim is (`withinProps`): a band drawn on
 * the prop in a shade near the costume's (the bottle's collar, near his
 * sash's cream) is the prop's, and never reads as the costume's line. A
 * palette with no prop is left as it is.
 */
const propsWhole = (map: Int32Array, width: number, paints: ReadonlyArray<Paint>): Int32Array => {
  const prop = (index: number) => paints[index]?.role === 'prop';
  const fleck = (index: number) => {
    if (prop(index)) return PROP_FLECK_PX;
    return 0;
  };
  const taken = islandsTaken(map, width, fleck);
  const seen = new Uint8Array(taken.length);
  for (let q = 0; q < taken.length; q++) {
    if (seen[q] === 1 || (taken[q] ?? CLEAR) <= 0) continue;
    const island = islandAt(taken, width, q, seen);
    if (island.length <= fleck(taken[q] ?? CLEAR)) for (const p of island) taken[p] = 0;
  }
  return withinProps(taken, width, paints);
};

/** The roles whose islands a prop may hold inside it as a band of its own drawing. */
const HELD_IN_PROP: ReadonlyArray<Role> = ['garment', 'sash', 'other'];

/** `map` with each island of a `HELD_IN_PROP` paint whose painted rim (ink and clear not counted) is more than half prop paint, and which holds fewer pixels than the cell paints in that prop's paint, repainted in the prop paint most of that rim is: a band inside the prop, never the costume round it. */
const withinProps = (map: Int32Array, width: number, paints: ReadonlyArray<Paint>): Int32Array => {
  if (!paints.some((p) => p.role === 'prop')) return map;
  const drawnPx = new Map<number, number>();
  for (const index of map) drawnPx.set(index, (drawnPx.get(index) ?? 0) + 1);
  const out = map.slice();
  const seen = new Uint8Array(map.length);
  for (let q = 0; q < map.length; q++) {
    const index = map[q] ?? CLEAR;
    if (seen[q] === 1 || index <= 0) continue;
    const island = islandAt(map, width, q, seen);
    if (!HELD_IN_PROP.some((role) => role === paints[index]?.role)) continue;
    const prop = Option.filter(
      heldBy(rimVotes(map, width, island), paints),
      (p) => island.length < (drawnPx.get(p) ?? 0),
    );
    if (Option.isSome(prop)) for (const p of island) out[p] = prop.value;
  }
  return out;
};

/** The painted pixels round an island (ink and clear not counted), by paint: how many of the island's 4-neighbours outside it each paint holds. */
const rimVotes = (
  map: Int32Array,
  width: number,
  island: ReadonlyArray<number>,
): ReadonlyArray<readonly [number, number]> => {
  const inside = new Set(island);
  const votes = new Map<number, number>();
  for (const p of island)
    for (const m of around4(p, width, map.length / width)) {
      const at = map[m] ?? CLEAR;
      if (inside.has(m) || at <= 0) continue;
      votes.set(at, (votes.get(at) ?? 0) + 1);
    }
  return [...votes];
};

/** The prop paint most of a rim is, when prop paints are more than half of it; none otherwise. */
const heldBy = (
  rim: ReadonlyArray<readonly [number, number]>,
  paints: ReadonlyArray<Paint>,
): Option.Option<number> => {
  const props = rim.filter(([i]) => paints[i]?.role === 'prop');
  const total = (of: ReadonlyArray<readonly [number, number]>) =>
    of.reduce((sum, [, n]) => sum + n, 0);
  if (total(props) * 2 <= total(rim)) return Option.none();
  return Option.map(
    Option.fromUndefinedOr(props.toSorted((a, b) => b[1] - a[1] || a[0] - b[0])[0]),
    ([i]) => i,
  );
};

/** The most pixels a 4-connected island of skin shade holds for the split to read it as a blotch of the drawing's grain on the skin, not a shading: the lead's redrawn table and close sheets draw them up to 111 px across his face (under a brow in `wince` and `lift`), his sheets before them 4 px at most. */
export const MOTTLE_PX = 111;

/**
 * The map with the skin's mottle gone (critique 1, item 16, on the redrawn
 * table sheet): each 4-connected island of a skin shade, `MOTTLE_PX` pixels
 * or fewer, takes the paint most of its rim is, as a speck does, so a
 * blotch inside the face takes the skin's base.
 */
const unmottled = (map: Int32Array, width: number, paints: ReadonlyArray<Paint>): Int32Array =>
  islandsTaken(map, width, (index) => {
    const p = paints[index];
    if (p?.role === 'skin' && p.tone === 'shade') return MOTTLE_PX;
    return 0;
  });

/** The share of a cell's largest island of a sash paint at or below which another island of that paint reads as a fleck of the drawing's light cloth, not the band: the lead's redrawn table sheet draws such flecks at his neckline at 25 to 41 px, against pieces of the band of 400 px and more. */
export const SASH_FLECK_SHARE = 0.1;

/**
 * The map with the sash's flecks gone (critique 1, items 6 and 7: a fleck
 * of his tunic's light cloth at the neckline read as the sash's top): each
 * 4-connected island of a sash paint holding `SASH_FLECK_SHARE` or less of
 * that paint's largest island in the cell takes the paint most of its rim
 * is, as a speck does.
 */
const sashBanded = (map: Int32Array, width: number, paints: ReadonlyArray<Paint>): Int32Array => {
  const largest = new Map<number, number>();
  const seen = new Uint8Array(map.length);
  for (let q = 0; q < map.length; q++) {
    const index = map[q] ?? CLEAR;
    if (seen[q] === 1 || index <= 0 || paints[index]?.role !== 'sash') continue;
    const n = islandAt(map, width, q, seen).length;
    largest.set(index, Math.max(largest.get(index) ?? 0, n));
  }
  return islandsTaken(map, width, (index) =>
    Math.floor((largest.get(index) ?? 0) * SASH_FLECK_SHARE),
  );
};

/** The map with each 4-connected island of one paint other than ink, `most(paint)` pixels or fewer, given the paint most of its distinct rim pixels are (the ink, clear and drawn pixels not counted; the lower index of equals); an island whose rim holds no such paint stays. */
const islandsTaken = (
  map: Int32Array,
  width: number,
  most: (index: number) => number,
): Int32Array => {
  const out = map.slice();
  const seen = new Uint8Array(map.length);
  for (let q = 0; q < map.length; q++) {
    if (seen[q] === 1 || (map[q] ?? CLEAR) <= 0) continue;
    const island = islandAt(map, width, q, seen);
    if (island.length > most(map[q] ?? CLEAR)) continue;
    const inside = new Set(island);
    const rim = new Set(
      island.flatMap((p) => around4(p, width, map.length / width).filter((m) => !inside.has(m))),
    );
    const votes = new Map<number, number>();
    for (const m of rim) {
      const index = map[m] ?? CLEAR;
      if (index > 0) votes.set(index, (votes.get(index) ?? 0) + 1);
    }
    const winner = [...votes].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    if (winner) for (const p of island) out[p] = winner[0];
  }
  return out;
};

/**
 * The map with the footwear paint only in the figure's lower half (critique
 * 1, item 4: no sandal brown on hair, ears or neck): a pixel of a footwear
 * paint above the middle row of the cell's opaque rows takes the nearest
 * paint, to its drawn colour, that is neither footwear nor a prop. The seat, painted the
 * footwear's hex, lies below a seated figure's middle.
 */
const feetLowOnly = (t: Tidy, map: Int32Array, barred: (q: number) => boolean): Int32Array => {
  const feet = (i: number) => t.paints[i]?.role === 'footwear';
  const others = t.paints.flatMap((p, i) => {
    if (p.role === 'footwear' || p.role === 'prop') return [];
    return [i];
  });
  const labs = t.paints.map((p) => p.lab);
  return map.map((index, q) => {
    if (index < 0 || !feet(index) || !barred(q)) return index;
    return nearestAmong(labOf(rgbAt(t.drawn, q)), others, labs);
  });
};

/** Where `rules` bar the footwear paint from a cell's map: above the middle of its opaque rows under `feetLow` (`feetLowOnly`), nowhere else. */
const feetBarOf = (map: Int32Array, width: number, rules: SplitRules) => {
  const first = map.findIndex((index) => index !== CLEAR);
  const last = map.findLastIndex((index) => index !== CLEAR);
  const middle = (Math.floor(first / width) + Math.floor(last / width)) / 2;
  return (q: number) => rules.feetLow && Math.floor(q / width) < middle;
};

/** The share of a figure's opaque rows, from its lowest, that is its soles' band: the rows `Lines.centreColumn` reads the soles on. */
export const SOLE_BAND = 0.08;

/** Whether pixel `q` of a cell's map lies in its soles' band (`SOLE_BAND` of its opaque rows, from the lowest), raised `above` rows. */
const soleBandOf = (map: Int32Array, width: number, above = 0) => {
  const first = Math.floor(map.findIndex((index) => index !== CLEAR) / width);
  const last = Math.floor(map.findLastIndex((index) => index !== CLEAR) / width);
  const top = last - Math.ceil((last - first + 1) * SOLE_BAND) + 1 - above;
  return (q: number) => Math.floor(q / width) >= top;
};

/**
 * The map with no hair paint in the soles' band (critique 2, items 10 and
 * 11: sandals drawn dark took the hair's paint): each such pixel takes the
 * footwear paint nearest its drawn colour; a member with no footwear paint
 * keeps its map. The band is raised `RIM_PEEL` rows, so the band of the
 * cell once its rim is peeled (`peeled`, at most `RIM_PEEL` rows off each
 * end) lies inside it.
 */
const solesShod = (t: Tidy, map: Int32Array): Int32Array => {
  const shoes = t.paints.flatMap((p, i) => {
    if (p.role !== 'footwear') return [];
    return [i];
  });
  if (shoes.length === 0) return map;
  const labs = t.paints.map((p) => p.lab);
  const inBand = soleBandOf(map, t.drawn.width, RIM_PEEL);
  return map.map((index, q) => {
    if (index <= 0 || t.paints[index]?.role !== 'hair' || !inBand(q)) return index;
    return nearestAmong(labOf(rgbAt(t.drawn, q)), shoes, labs);
  });
};

/** How near (CIE76) an other paint lies to a garment paint for the split to read it as that cloth wherever the other cannot be: a contact shadow drawn in the robe's shade (the guest woman's #e6d7f0 against her robe's #e7d7ef, 1.4 apart). */
export const TWIN_PAINT = 3;

/** How far (px, in the square round it) `bodyClothed` reads what a dark line lies on: the cloth or a seat's wood. */
export const EDGE_REACH = 6;

/**
 * The map with the body's cloth in the cloth's paints (critique 3, finding
 * 4: the guest woman's table sheet split her neckline, mantle and sash
 * edges in her sandals' paint and mottled her sash with the contact
 * shadow's): below the face, each 4-connected island of a footwear paint
 * that does not reach the soles' band (`SOLE_BAND`, raised `RIM_PEEL` rows,
 * as `solesShod` reads it) takes, pixel by pixel, the garment paint nearest
 * its drawn colour, and each such island of an other paint within
 * `TWIN_PAINT` of a garment paint takes that garment paint. The sandals and
 * the contact shadow (islands down at the soles), the head (a darker hair
 * drawn in the footwear's paint), the stool and its edges (a pixel with
 * more of an other paint, a garment's twin aside, than of cloth or a twin
 * within `EDGE_REACH` px) and a cell
 * that reads no face keep their paints. Below the face, the ink's specks
 * inside the cloth then take the cloth's paint (`inkSpecksClothed`).
 */
const bodyClothed = (t: Tidy, map: Int32Array, face: Option.Option<Box>): Int32Array => {
  const garments = t.paints.flatMap((p, i) => {
    if (p.role !== 'garment') return [];
    return [i];
  });
  const labs = t.paints.map((p) => p.lab);
  const twins = new Map(
    t.paints.flatMap((p, i) => {
      if (p.role !== 'other' || garments.length === 0) return [];
      const twin = nearestAmong(p.lab, garments, labs);
      if (labDistance(p.lab, labs[twin] ?? p.lab) > TWIN_PAINT) return [];
      return [[i, twin] as const];
    }),
  );
  const loose = (index: number) =>
    index > 0 &&
    ((t.paints[index]?.role === 'footwear' && garments.length > 0) || twins.has(index));
  const width = t.drawn.width;
  const inBand = soleBandOf(map, width, RIM_PEEL);
  const height = map.length / width;
  const byOther = (q: number) => {
    const [x, y] = [q % width, Math.floor(q / width)];
    const votes = { other: 0, cloth: 0 };
    for (let v = Math.max(0, y - EDGE_REACH); v <= Math.min(height - 1, y + EDGE_REACH); v++)
      for (let u = Math.max(0, x - EDGE_REACH); u <= Math.min(width - 1, x + EDGE_REACH); u++) {
        const index = map[v * width + u] ?? CLEAR;
        const role = t.paints[index]?.role;
        if (role === 'other' && !twins.has(index)) votes.other++;
        if (role === 'garment' || role === 'sash' || twins.has(index)) votes.cloth++;
      }
    return votes.other > votes.cloth;
  };
  return Option.match(face, {
    onNone: () => map,
    onSome: (box) => {
      const out = map.slice();
      const seen = new Uint8Array(map.length);
      for (let q0 = 0; q0 < map.length; q0++) {
        const index = map[q0] ?? CLEAR;
        if (seen[q0] === 1 || !loose(index)) continue;
        const island = islandAt(map, width, q0, seen);
        if (island.some(inBand)) continue;
        for (const q of island) {
          if (Math.floor(q / width) < box.y + box.height || (!twins.has(index) && byOther(q)))
            continue;
          out[q] = twins.get(index) ?? nearestAmong(labOf(rgbAt(t.drawn, q)), garments, labs);
        }
      }
      const cloth = (index: number) => {
        const role = t.paints[index]?.role;
        return role === 'garment' || role === 'sash' || twins.has(index);
      };
      return inkSpecksClothed(out, width, box.y + box.height, cloth);
    },
  });
};

/** The largest ink island (px, 8-connected) `inkSpecksClothed` reads as grain in a cloth line rather than a line of its own. */
const INK_SPECK_PX = 8;

/**
 * The map with the ink's grain inside the cloth's lines in the cloth's
 * paint (critique 4, fault 1: the drawing's near-black grain in the guest
 * woman's olive mantle edges split as ink specks): each 8-connected ink
 * island of `INK_SPECK_PX` or fewer, wholly at or below row `from`, whose
 * 8-neighbour rim is all `cloth`, takes the paint most of its rim pixels
 * are (the lower index of equals). An ink pixel touching the outline, at a
 * corner too, is part of the outline and stays.
 */
const inkSpecksClothed = (
  map: Int32Array,
  width: number,
  from: number,
  cloth: (index: number) => boolean,
): Int32Array => {
  const out = map.slice();
  const height = map.length / width;
  const seen = new Uint8Array(map.length);
  for (let q0 = from * width; q0 < map.length; q0++) {
    if (seen[q0] === 1 || map[q0] !== 0) continue;
    const island = inkIslandAt(map, width, q0, seen);
    if (island.length > INK_SPECK_PX) continue;
    const inside = new Set(island);
    const rim = [
      ...new Set(island.flatMap((p) => around8(p, width, height).filter((m) => !inside.has(m)))),
    ].map((m) => map[m] ?? CLEAR);
    if (rim.length === 0 || !rim.every(cloth)) continue;
    const winner = mostOf(rim);
    for (const p of island) out[p] = winner;
  }
  return out;
};

/** The 8-connected island of ink (index 0) holding pixel `q0` of a cell's map, each of its pixels marked in `seen`. */
const inkIslandAt = (map: Int32Array, width: number, q0: number, seen: Uint8Array) => {
  seen[q0] = 1;
  const [island, stack] = [[q0], [q0]];
  while (stack.length > 0)
    for (const m of around8(stack.pop() ?? 0, width, map.length / width)) {
      if (seen[m] === 1 || map[m] !== 0) continue;
      seen[m] = 1;
      island.push(m);
      stack.push(m);
    }
  return island;
};

/** The index most of `indices` are, the lower of equals; `CLEAR` for none. */
const mostOf = (indices: ReadonlyArray<number>): number => {
  const votes = new Map<number, number>();
  for (const index of indices) votes.set(index, (votes.get(index) ?? 0) + 1);
  return [...votes].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? CLEAR;
};

/** The pixels of a stored cell's soles' band (`SOLE_BAND`) that hold a hair paint, its paints read exactly. */
export const soleHairOf = (r: Raster, paints: ReadonlyArray<Paint>): number => {
  const map = paintMapOf(r, paints);
  const inBand = soleBandOf(map, r.width);
  return Array.from(map.keys()).filter(
    (q) => (map[q] ?? CLEAR) > 0 && paints[map[q] ?? CLEAR]?.role === 'hair' && inBand(q),
  ).length;
};

/** How far (px, in the square round it) a pixel of a hair shade may lie from its hair's base: farther, it is a stray shade along a line (critique 1, item 16). */
export const SHADE_REACH = 3;

/**
 * The pixels of `map` that are a stray hair shade: a hair part's shade with
 * no pixel of that part's base within `SHADE_REACH` px, on a thin run (no
 * 3 × 3 block of that shade within a pixel of it), as a dash along a line
 * is. A curl's shaded underside, a block of its own, stays, however its ink
 * parts it from the base; a garment's shade is left out, since a cloth's
 * whole far side may be its shade.
 */
const strayShadesOf = (
  map: Int32Array,
  width: number,
  paints: ReadonlyArray<Paint>,
): ReadonlyArray<number> => {
  const height = map.length / width;
  const of = (index: number) => Uint8Array.from(map, (i) => Number(i === index));
  const tests = new Map(
    paints.flatMap((p, i) => {
      if (p.tone !== 'shade' || p.role !== 'hair') return [];
      const base = paints.findIndex((b) => b.part === p.part && b.tone === 'base');
      const shade = of(i);
      const inBlock = nearCounts(shade, width, height, 1);
      const core = Uint8Array.from(shade, (s, q) => Number(s === 1 && inBlock(q) === 9));
      return [
        [
          i,
          {
            nearBase: nearCounts(of(base), width, height, SHADE_REACH),
            thick: nearCounts(core, width, height, 1),
          },
        ] as const,
      ];
    }),
  );
  return Array.from(map.keys()).filter((q) => {
    const t = tests.get(map[q] ?? CLEAR);
    if (!t) return false;
    return t.nearBase(q) === 0 && t.thick(q) === 0;
  });
};

/** The share of a cell's opaque pixels that are a stray hair shade (`strayShadesOf`), its paints read exactly. */
export const strayShadeShare = (r: Raster, paints: ReadonlyArray<Paint>): number => {
  const map = paintMapOf(r, paints);
  const opaque = map.filter((index) => index !== CLEAR).length;
  return strayShadesOf(map, r.width, paints).length / Math.max(1, opaque);
};

/**
 * The map with every stray shade (`strayShadesOf`) given the paint most of
 * its eight neighbours that are not a stray shade are (clear and drawn
 * pixels not counted; the lower index of equals), so a dash of shade along a
 * line takes the line's or the part's paint (critique 1, items 15 and 16);
 * a stray with no such neighbour stays.
 */
const unstrayed = (map: Int32Array, width: number, paints: ReadonlyArray<Paint>): Int32Array => {
  const height = map.length / width;
  const strays = new Set(strayShadesOf(map, width, paints));
  const out = map.slice();
  for (const q of strays) {
    const [x, y] = [q % width, Math.floor(q / width)];
    const votes = new Map<number, number>();
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const [u, v] = [x + dx, y + dy];
        if ((dx === 0 && dy === 0) || u < 0 || v < 0 || u >= width || v >= height) continue;
        const m = v * width + u;
        const index = map[m] ?? CLEAR;
        if (index < 0 || strays.has(m)) continue;
        votes.set(index, (votes.get(index) ?? 0) + 1);
      }
    const winner = [...votes].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    if (winner) out[q] = winner[0];
  }
  return out;
};

/**
 * A snapped cell tidied by the rules a drawing's own marks need, in order:
 * each thin line on cloth as ink between two parts or the part's shade
 * inside one (`lineAt`), every speck the paint round it (`despecked`), and
 * skin only by skin (`skinBySkin`), last, so no speck's vote puts skin
 * colour back on cloth; under `rules.unstray`, every stray hair shade its
 * neighbours' paint (`unstrayed`), and, under any rules, every hair paint in
 * the soles' band a footwear paint (`solesShod`), both before the skin rule,
 * the soles once more last, so no later vote gives them hair again. `drawn`
 * is the cell
 * before the snap, `snap` it after, `nearest` the snap's lookup.
 */
export const tidied = (
  drawn: Raster,
  snap: Raster,
  paints: ReadonlyArray<Paint>,
  nearest: (c: Rgb) => Nearest,
  rules: SplitRules = PLAIN_SPLIT,
): Raster => tidiedReport(drawn, snap, paints, nearest, rules).raster;

/** A tidied cell and what its skin rule could not say plainly: the pixels `skinBySkin` repainted with a paint past `SNAP_RADIUS` of their drawn colour (a colour the palette has no paint for, given the nearest one that is not skin). */
export interface Tidied {
  readonly raster: Raster;
  readonly skinFar: number;
}

/** `tidied`, with the count of its far skin repaints (`Tidied.skinFar`), so no repaint past `SNAP_RADIUS` goes unreported. */
export const tidiedReport = (
  drawn: Raster,
  snap: Raster,
  paints: ReadonlyArray<Paint>,
  nearest: (c: Rgb) => Nearest,
  rules: SplitRules = PLAIN_SPLIT,
): Tidied => {
  const map = paintMapOf(snap, paints);
  const loose = Uint8Array.from(map, (index, q) =>
    Number(index > 0 && nearest(rgbAt(drawn, q)).distance > PLAIN_RADIUS),
  );
  const t: Tidy = { drawn, map, paints, loose };
  const shadeOf = new Map(
    paints.flatMap((p, i) => {
      if (p.tone !== 'shade') return [];
      return [[p.part, i] as const];
    }),
  );
  const lined = map.map((index, q) => Option.getOrElse(lineAt(t, q, shadeOf), () => index));
  const strayed = (m: Int32Array) => {
    if (!rules.unstray) return m;
    return unstrayed(m, drawn.width, paints);
  };
  const barred = feetBarOf(map, drawn.width, rules);
  const before = solesShod(t, strayed(feetLowOnly(t, despecked(lined, drawn.width), barred)));
  const skinned = skinBySkin(t, before, barred);
  const smooth = (m: Int32Array) => {
    if (!rules.unmottle) return m;
    return unmottled(m, drawn.width, paints);
  };
  const banded = (m: Int32Array) => {
    if (!rules.sashBand) return m;
    return sashBanded(m, drawn.width, paints);
  };
  const clothed = (m: Int32Array) => {
    if (!rules.bodyCloth) return m;
    return bodyClothed(t, m, faceBoxOf(snap, paints));
  };
  const final = solesShod(t, propsWhole(banded(smooth(clothed(skinned))), drawn.width, paints));
  const rgba = snap.rgba.slice();
  let skinFar = 0;
  for (let q = 0; q < final.length; q++) {
    const paint = paints[final[q] ?? CLEAR];
    if (!paint) continue;
    rgba.set(paint.rgb, q * 4);
    if (final[q] !== before[q] && labDistance(labOf(rgbAt(drawn, q)), paint.lab) > SNAP_RADIUS)
      skinFar++;
  }
  return { raster: { width: snap.width, height: snap.height, rgba }, skinFar };
};

/**
 * `r` peeled (critique 1, item 2): `RIM_PEEL` times over, every opaque
 * pixel that is not the ink and touches a clear one or the picture's edge
 * (a cell's edge is the sheet's ground) is cleared, so a soft edge drawn on
 * the ground outside the outline never stays on a figure.
 */
export const peeled = (r: Raster, paints: ReadonlyArray<Paint>): Raster => {
  const ink = keyOf(paints[0]?.rgb ?? [0, 0, 0]);
  const rgba = r.rgba.slice();
  const clear = (q: number) => (rgba[q * 4 + 3] ?? 0) === 0;
  const onEdge = (q: number) => around4(q, r.width, r.height).length < 4;
  for (let pass = 0; pass < RIM_PEEL; pass++) {
    const rim: Array<number> = [];
    for (let q = 0; q < r.width * r.height; q++) {
      if (clear(q)) continue;
      const c: Rgb = [rgba[q * 4] ?? 0, rgba[q * 4 + 1] ?? 0, rgba[q * 4 + 2] ?? 0];
      if (keyOf(c) !== ink && (onEdge(q) || around4(q, r.width, r.height).some(clear))) rim.push(q);
    }
    for (const q of rim) rgba[q * 4 + 3] = 0;
  }
  return { width: r.width, height: r.height, rgba };
};

/** One cell of a split sheet: its box in the sheet, its pixels, and its far skin repaints (`Tidied.skinFar`). */
export interface SplitCell {
  readonly box: Box;
  readonly raster: Raster;
  readonly skinFar: number;
}

/** A split sheet: its measured ground and its cells, left to right. */
export interface Split {
  readonly ground: Rgb;
  readonly cells: ReadonlyArray<SplitCell>;
}

/** The opt-in split rules by the names a sheet's record gives them. */
export const SPLIT_RULES = ['unstray', 'feet-low', 'unmottle', 'sash-band', 'body-cloth'] as const;

/** The split's rules a sheet opts into, as its record names them: `unstray`, each stray hair shade its neighbours' paint (`unstrayed`); `feetLow` (`feet-low`), the footwear paint only in the figure's lower half (`feetLowOnly`); `unmottle`, each blotch of skin shade inside the skin its base (`unmottled`); `sashBand` (`sash-band`), each fleck of a sash paint far smaller than its band the paint round it (`sashBanded`); `bodyCloth` (`body-cloth`), the body between the face and the soles in the cloth's paints, no footwear, no garment's twin and no ink speck inside the cloth there (`bodyClothed`). */
export interface SplitRules {
  readonly unstray: boolean;
  readonly feetLow: boolean;
  readonly unmottle: boolean;
  readonly sashBand: boolean;
  readonly bodyCloth: boolean;
}

/** The split as sheets drawn before any opt-in rule were split. */
export const PLAIN_SPLIT: SplitRules = {
  unstray: false,
  feetLow: false,
  unmottle: false,
  sashBand: false,
  bodyCloth: false,
};

/** A drawn sheet split into `n` cells: the background cleared, the cells cut, each kept to its largest piece, its pockets mended and its paints snapped to `palette`, each colour to the paint the whole sheet draws it as (`drawnNearestOf`), its drawing's own marks tidied under `rules` (`tidied`), its face's marks inked (`inkedFaceMarks`) and its rim peeled. */
export const splitSheet = (
  sheet: Raster,
  n: number,
  palette: Palette,
  rules: SplitRules = PLAIN_SPLIT,
): Result.Result<Split, SplitRefused> => {
  const ground = groundOf(sheet);
  const cleared = clearBackground(sheet, ground);
  const paints = paintsOf(palette);
  return Result.map(cellsOf(cleared, n), (boxes) => {
    const nearest = drawnNearestOf(cleared, paints);
    return {
      ground,
      cells: boxes.map((box) => {
        const mended = mendPockets(largestPiece(cropOf(cleared, box)), ground, paints, nearest);
        const snap = snapped(mended, paints, nearest);
        const tidy = tidiedReport(mended, snap, paints, nearest, rules);
        return {
          box,
          raster: peeled(inkedFaceMarks(tidy.raster, paints), paints),
          skinFar: tidy.skinFar,
        };
      }),
    };
  });
};

/** The lines of one drawn figure, in its picture's rows and columns: none where a line cannot be read. */
export interface Lines {
  /** The top and bottom opaque rows of the whole figure. */
  readonly top: number;
  readonly bottom: number;
  /** The mean x of the opaque pixels in the top tenth of the figure. */
  readonly headColumn: number;
  /** The soles' centre: the mean x of the opaque pixels in the bottom 8 % of the figure's rows. */
  readonly centreColumn: number;
  /** The first opaque row in the head column. */
  readonly crown: number;
  /** The crown to the collar: the first garment or sash row below the face's first skin row in the head column. */
  readonly head: Option.Option<number>;
  /** The last garment row in the centre column. */
  readonly hem: Option.Option<number>;
  /** The top row of the sash: the first row of a 3 × 3 block of sash paint anywhere across the figure. */
  readonly sashTop: Option.Option<number>;
}

/** The mean x of the opaque pixels in rows `y0..y1` (inclusive), none when there are none. */
const meanColumn = (r: Raster, y0: number, y1: number): Option.Option<number> => {
  let sum = 0;
  let count = 0;
  for (let y = Math.max(0, y0); y <= Math.min(r.height - 1, y1); y++)
    for (let x = 0; x < r.width; x++)
      if (alphaAt(r, y * r.width + x) > 0) {
        sum += x;
        count += 1;
      }
  return Option.some(sum / Math.max(1, count)).pipe(Option.filter(() => count > 0));
};

/** The fewest rows in a run a line reads as paint: a shorter one is the anti-aliased fringe at an outline, snapped to whatever paint lay near. */
const LINE_RUN = 3;

/** The rows of column `x` from `from` downward whose pixel is exactly a paint of one of `roles`, in runs of `LINE_RUN` or more; clear pixels, the ink and colours left as drawn are skipped. */
const rowsOfRole = (
  r: Raster,
  x: number,
  from: number,
  roles: ReadonlyArray<Role | 'ink'>,
  paints: ReadonlyArray<Paint>,
): ReadonlyArray<number> => {
  const rows = paintRows(r, x, from, roles, paints);
  const painted = new Set(rows);
  const run = (y: number, step: number) => {
    let n = 0;
    while (painted.has(y + step * (n + 1))) n += 1;
    return n;
  };
  return rows.filter((y) => run(y, -1) + run(y, 1) + 1 >= LINE_RUN);
};

/** What a pixel is drawn in, read by the paint it is exactly: its role, a blend when it is no paint exactly, clear when it is clear. */
type Drawn = Role | 'ink' | 'blend' | 'clear';

/** What a run of cloth is read down through: cloth and blends. */
const CLOTH: ReadonlyArray<Drawn> = ['garment', 'sash', 'blend'];

/** What an edge below a run of cloth is drawn in: anything opaque but skin and cloth, an ink line, a blend, a mark in hair or another part's paint; and cloth in a run shorter than `LINE_RUN`, a fringe between them snapped to a cloth. */
const EDGE: ReadonlyArray<Drawn> = ['ink', 'blend', 'hair', 'footwear', 'other'];

/**
 * The row the collar starts at in column `x`, below the face's first skin
 * row `face`, or none where the column cannot tell the collar from a mark
 * drawn on the face. A run of cloth (garment or sash), read down through
 * cloth and blends, is a mark on the face when the pixel below it, directly
 * or past its edge (`EDGE`: ink, blends, hair, a cloth fringe), is skin of
 * the face's own region (4-connected from the face's first row), joined
 * round the mark. Skin below a run that the face cannot reach is a hand on
 * the robe as much as a neck under a mark drawn across the face, so the
 * column reads none. The first run of cloth with no skin below it, past its
 * edge, is the collar; none when no run ends so. The line read depends on
 * what the figure draws, never on how deep a mark is.
 */
const collarOf = (
  r: Raster,
  x: number,
  face: number,
  paints: ReadonlyArray<Paint>,
): Option.Option<number> => {
  const nearest = pixelNearestOf(paints);
  const cloth = new Set(paintRows(r, x, face, ['garment', 'sash'], paints));
  const drawnAt = (y: number): Drawn => {
    const q = y * r.width + x;
    if (y >= r.height || alphaAt(r, q) === 0) return 'clear';
    const { index, distance } = nearest(r, q);
    if (distance > 0) return 'blend';
    return paints[index]?.role ?? 'ink';
  };
  const past = (from: number, through: ReadonlyArray<Drawn>): number => {
    let y = from;
    while (y < r.height && through.includes(drawnAt(y))) y += 1;
    return y;
  };
  const edgeEnd = (from: number): number => {
    let y = from;
    while (y < r.height) {
      const drawn = drawnAt(y);
      const run = past(y, CLOTH) - y;
      if (EDGE.includes(drawn)) y += 1;
      else if ((drawn === 'garment' || drawn === 'sash') && run < LINE_RUN) y += run;
      else return y;
    }
    return y;
  };
  const own = new Set(
    regionAt(r, face * r.width + x, (q) => isRole(r, q, 'skin', paints, nearest), around4),
  );
  for (let y = face; y < r.height; y++) {
    if (!cloth.has(y)) continue;
    const below = edgeEnd(past(y, CLOTH));
    if (drawnAt(below) !== 'skin') return Option.some(y);
    if (!own.has(below * r.width + x)) return Option.none();
    y = below - 1;
  }
  return Option.none();
};

/** The rows of column `x` from `from` downward whose pixel and its left and right neighbours are exactly paints of `roles`: an outline's fringe a pixel or two wide, snapped to a paint where it meets the clear ground, never reads as one. */
const paintRows = (
  r: Raster,
  x: number,
  from: number,
  roles: ReadonlyArray<Role | 'ink'>,
  paints: ReadonlyArray<Paint>,
): ReadonlyArray<number> => {
  const nearest = pixelNearestOf(paints);
  const inRoles = (u: number, y: number): boolean => {
    const q = y * r.width + u;
    if (u < 0 || u >= r.width || alphaAt(r, q) === 0) return false;
    const { index, distance } = nearest(r, q);
    return distance === 0 && roles.includes(paints[index]?.role ?? 'ink');
  };
  const rows: Array<number> = [];
  for (let y = from; y < r.height; y++)
    if (inRoles(x - 1, y) && inRoles(x, y) && inRoles(x + 1, y)) rows.push(y);
  return rows;
};

/** The lines a figure's opaque pixels alone give: its top and bottom rows, its head and centre columns, and its crown. */
type Outline = Pick<Lines, 'top' | 'bottom' | 'headColumn' | 'centreColumn' | 'crown'>;

/** A figure's outline (`Outline`), none when the picture holds no opaque pixel. */
const outlineOf = (r: Raster): Option.Option<Outline> => {
  const opaqueRow = (y: number): boolean => {
    for (let x = 0; x < r.width; x++) if (alphaAt(r, y * r.width + x) > 0) return true;
    return false;
  };
  let top = 0;
  while (top < r.height && !opaqueRow(top)) top += 1;
  let bottom = r.height - 1;
  while (bottom > top && !opaqueRow(bottom)) bottom -= 1;
  const height = bottom - top + 1;
  if (top >= r.height) return Option.none();
  const headColumn = Math.round(
    Option.getOrElse(meanColumn(r, top, top + Math.ceil(height * 0.1) - 1), () => 0),
  );
  const centreColumn = Math.round(
    Option.getOrElse(meanColumn(r, bottom - Math.ceil(height * 0.08) + 1, bottom), () => 0),
  );
  let crown = top;
  while (crown <= bottom && alphaAt(r, crown * r.width + headColumn) === 0) crown += 1;
  if (crown > bottom) crown = top;
  return Option.some({ top, bottom, headColumn, centreColumn, crown });
};

/**
 * A figure's lines, read so a raised arm never moves one: the crown and the
 * collar in the head column, the hem in the centre column, ink marks
 * skipped, and the sash top as the top of its band (`bandTop`); none when
 * the picture holds no opaque pixel.
 */
export const linesOf = (r: Raster, paints: ReadonlyArray<Paint>): Option.Option<Lines> =>
  Option.map(outlineOf(r), (o) => {
    const face = rowsOfRole(r, o.headColumn, o.crown, ['skin'], paints)[0] ?? r.height;
    const garment = rowsOfRole(r, o.centreColumn, o.top, ['garment'], paints);
    return {
      ...o,
      head: Option.map(collarOf(r, o.headColumn, face, paints), (y) => y - o.crown),
      hem: Option.fromUndefinedOr(garment.at(-1)),
      sashTop: bandTop(r, ['sash'], paints),
    };
  });

/**
 * The top row of the first `LINE_RUN` × `LINE_RUN` block of pixels that are
 * exactly paints of `roles`, anywhere across the figure; none when no such
 * block is drawn. A belt is read so: a hanging sleeve covers it at the
 * centre column in profile, and a knot's drawn edge can run down that
 * column, but an arm is never sash, so a raised arm moves no band's top.
 */
const bandTop = (
  r: Raster,
  roles: ReadonlyArray<Role>,
  paints: ReadonlyArray<Paint>,
): Option.Option<number> => {
  const nearest = pixelNearestOf(paints);
  const of = new Uint8Array(r.width * r.height);
  const readRow = (y: number) => {
    for (let q = y * r.width; q < (y + 1) * r.width; q++) {
      if (alphaAt(r, q) === 0) continue;
      const { index, distance } = nearest(r, q);
      const role = paints[index]?.role ?? 'ink';
      if (distance === 0 && role !== 'ink' && roles.includes(role)) of[q] = 1;
    }
  };
  const block = (x: number, y: number): boolean => {
    for (let dy = 0; dy < LINE_RUN; dy++)
      for (let dx = 0; dx < LINE_RUN; dx++) if (of[(y + dy) * r.width + x + dx] !== 1) return false;
    return true;
  };
  for (let y = 0; y < Math.min(LINE_RUN - 1, r.height); y++) readRow(y);
  for (let y = 0; y + LINE_RUN <= r.height; y++) {
    readRow(y + LINE_RUN - 1);
    for (let x = 0; x + LINE_RUN <= r.width; x++) if (block(x, y)) return Option.some(y);
  }
  return Option.none();
};

/** The median of `values`, none when there are none. */
export const medianOf = (values: ReadonlyArray<number>): Option.Option<number> =>
  Option.fromUndefinedOr(values.toSorted((a, b) => a - b)[values.length >> 1]);

/** Where a cell is pinned to its figure's place: its soles' centre, the centre column's middle and the row below its soles, in its own px. */
export const anchorOf = (l: Lines) => ({
  ax: l.centreColumn + 0.5,
  ay: l.bottom + 1,
});

/** A sheet's head: the median of its cells' heads, over the cells that read one. */
export const sheetHeadOf = (
  heads: ReadonlyMap<string, Option.Option<number>>,
): Option.Option<number> => medianOf([...heads.values()].flatMap((h) => Option.toArray(h)));

/** A figure's face: the 4-connected skin round the face's first skin row in the head column, as a mask over the picture, and its box. */
interface Face {
  readonly mask: Uint8Array;
  readonly box: Box;
}

/** The box round a set of pixels of a picture `width` wide. */
const boxOf = (px: ReadonlyArray<number>, width: number): Box => {
  const xs = px.map((q) => q % width);
  const ys = px.map((q) => Math.floor(q / width));
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  return { x: x0, y: y0, width: Math.max(...xs) - x0 + 1, height: Math.max(...ys) - y0 + 1 };
};

/** Whether pixel `q` of `r` is exactly a paint of role `role`. */
const isRole = (
  r: Raster,
  q: number,
  role: Role | 'ink',
  paints: ReadonlyArray<Paint>,
  nearest: (r: Raster, q: number) => Nearest,
): boolean => {
  if (alphaAt(r, q) === 0) return false;
  const { index, distance } = nearest(r, q);
  return distance === 0 && (paints[index]?.role ?? 'ink') === role;
};

/** A figure's face, none when its head column reads no face. */
const faceOf = (r: Raster, paints: ReadonlyArray<Paint>): Option.Option<Face> => {
  const nearest = pixelNearestOf(paints);
  const seedOf = (l: Outline) =>
    Option.map(
      Option.fromUndefinedOr(rowsOfRole(r, l.headColumn, l.crown, ['skin'], paints)[0]),
      (row) => row * r.width + l.headColumn,
    );
  return Option.flatMap(Option.flatMap(outlineOf(r), seedOf), (seed) => {
    const skin = regionAt(r, seed, (q) => isRole(r, q, 'skin', paints, nearest), around4);
    if (skin.length === 0) return Option.none();
    const mask = new Uint8Array(r.width * r.height);
    for (const q of skin) mask[q] = 1;
    return Option.some({ mask, box: boxOf(skin, r.width) });
  });
};

/** The box round a figure's face (`faceOf`: the skin region at the first skin row of its head column), none when it reads no face. */
export const faceBoxOf = (r: Raster, paints: ReadonlyArray<Paint>): Option.Option<Box> =>
  Option.map(faceOf(r, paints), (face) => face.box);

/** The marks drawn on a face: each 4-connected run of opaque pixels that are not skin, within the face's box, ringed all round by the face's skin. */
const faceMarksOf = (
  r: Raster,
  paints: ReadonlyArray<Paint>,
  face: Face,
): ReadonlyArray<ReadonlyArray<number>> => {
  const nearest = pixelNearestOf(paints);
  const { box, mask } = face;
  const inBox = (q: number) => {
    const [x, y] = [q % r.width, Math.floor(q / r.width)];
    return x >= box.x && y >= box.y && x < box.x + box.width && y < box.y + box.height;
  };
  return regionsIn(
    r,
    box,
    (q) => inBox(q) && mask[q] !== 1 && alphaAt(r, q) > 0 && !isRole(r, q, 'skin', paints, nearest),
    around4,
  ).filter((px) => {
    const own = new Set(px);
    return px.every((q) => {
      const around = around4(q, r.width, r.height);
      return around.length === 4 && around.every((m) => own.has(m) || mask[m] === 1);
    });
  });
};

/**
 * `r` with every mark drawn on its face that holds ink painted all in ink
 * (critique 2, item 2): an eye or a mouth drawn with part of it in another
 * part's colour snaps that part to a paint that does not belong on a face,
 * a stool's wood or a mantle's cloth. A mark with no ink in it, a blush or
 * an ear's fold, stays; a picture with no face is answered as it is.
 */
export const inkedFaceMarks = (r: Raster, paints: ReadonlyArray<Paint>): Raster =>
  Option.match(faceOf(r, paints), {
    onNone: () => r,
    onSome: (face) => {
      const nearest = pixelNearestOf(paints);
      const ink = paints[0]?.rgb ?? [0, 0, 0];
      const rgba = r.rgba.slice();
      for (const px of faceMarksOf(r, paints, face))
        if (px.some((q) => isRole(r, q, 'ink', paints, nearest)))
          for (const q of px) rgba.set(ink, q * 4);
      return { width: r.width, height: r.height, rgba };
    },
  });

/** The fewest pixels a mark on a face holds to be read as a brow, an eye or a mouth: a smaller one is a speck. */
const MARK_PX = 8;

/**
 * A face's eyes, left to right: its marks all in ink of `MARK_PX` or more,
 * gathered into rows (a mark joins the row above when their rows overlap),
 * the second row from the top, between the brows and the mouth. A face of
 * two rows reads its eyes there too when its top row's marks are all wider
 * than tall, brows over a mouth the beard holds (no face skin rings it);
 * a face of one row reads it as its eyes when it is two marks each taller
 * than wide, open eyes whose brows the hair holds and whose mouth the beard
 * does. None otherwise (a profile, eyes over a mouth with no brows).
 */
const eyesOf = (
  r: Raster,
  paints: ReadonlyArray<Paint>,
  face: Face,
): Option.Option<ReadonlyArray<ReadonlyArray<number>>> => {
  const nearest = pixelNearestOf(paints);
  const marks = faceMarksOf(r, paints, face)
    .filter((px) => px.length >= MARK_PX && px.every((q) => isRole(r, q, 'ink', paints, nearest)))
    .map((px) => ({ px, box: boxOf(px, r.width) }))
    .toSorted((a, b) => a.box.y - b.box.y);
  const rows: Array<Array<(typeof marks)[number]>> = [];
  for (const m of marks) {
    const row = rows.at(-1);
    const bottom = Math.max(...(row ?? []).map((n) => n.box.y + n.box.height - 1));
    if (row && m.box.y <= bottom) row.push(m);
    else rows.push([m]);
  }
  const [top = [], second = []] = rows;
  const leftToRight = (row: typeof marks) =>
    Option.some(row.toSorted((a, b) => a.box.x - b.box.x).map((m) => m.px));
  const browed = top.every((m) => m.box.width > m.box.height);
  const ovals = top.length === 2 && top.every((m) => m.box.height > m.box.width);
  if (rows.length >= 3 || (rows.length === 2 && browed)) return leftToRight(second);
  if (rows.length === 1 && ovals) return leftToRight(top);
  return Option.none();
};

/** The boxes round a figure's eyes, left to right (`eyesOf`), none when its face reads no eyes. */
export const eyeBoxesOf = (
  r: Raster,
  paints: ReadonlyArray<Paint>,
): Option.Option<ReadonlyArray<Box>> =>
  Option.flatMap(faceOf(r, paints), (face) =>
    Option.map(eyesOf(r, paints, face), (eyes) => eyes.map((px) => boxOf(px, r.width))),
  );

/** A blink could not be built: why. */
export class BlinkRefused extends Schema.TaggedError<BlinkRefused>()('BlinkRefused', {
  reason: Schema.String,
}) {
  override get message() {
    return `no blink: ${this.reason}`;
  }
}

/** A cell's face and its eyes, or why they are not read. */
const eyedFaceOf = (r: Raster, paints: ReadonlyArray<Paint>, which: string) =>
  Option.match(
    Option.flatMap(faceOf(r, paints), (face) =>
      Option.map(eyesOf(r, paints, face), (eyes) => ({ face, eyes })),
    ),
    {
      onNone: () =>
        Result.fail(
          BlinkRefused.make({ reason: `the ${which} reads no eyes between brows and mouth` }),
        ),
      onSome: (read) => Result.succeed(read),
    },
  );

/** An open cell's read face as it is, or refused when every one of its eyes is wider than tall: arcs (a smile's ∩, closed lids' ∪) with nothing open to close. */
const openEyed =
  (open: Raster) =>
  <F extends { readonly eyes: ReadonlyArray<ReadonlyArray<number>> }>(
    read: F,
  ): Result.Result<F, BlinkRefused> => {
    const opened = read.eyes.some((px) => {
      const b = boxOf(px, open.width);
      return b.height >= b.width;
    });
    if (opened) return Result.succeed(read);
    return Result.fail(
      BlinkRefused.make({ reason: 'the open cell’s eyes are arcs, each wider than tall' }),
    );
  };

/** The middle of a box, in its picture's px, as a fraction when its side is even. */
const middleOf = (b: Box): readonly [number, number] => [
  b.x + (b.width - 1) / 2,
  b.y + (b.height - 1) / 2,
];

/** The colour most of a mark's ring of face skin is painted. */
const ringPaintOf = (r: Raster, px: ReadonlyArray<number>, face: Face): Rgb => {
  const own = new Set(px);
  const votes = new Map<number, { readonly rgb: Rgb; n: number }>();
  for (const q of px)
    for (const m of around4(q, r.width, r.height)) {
      if (own.has(m) || face.mask[m] !== 1) continue;
      const rgb = rgbAt(r, m);
      const vote = votes.get(keyOf(rgb)) ?? { rgb, n: 0 };
      vote.n += 1;
      votes.set(keyOf(rgb), vote);
    }
  return [...votes.values()].toSorted((a, b) => b.n - a.n)[0]?.rgb ?? [0, 0, 0];
};

/**
 * The open cell `open` blinking (critique 2, items 3 and 4): each of its
 * eyes painted out in the skin round it, and the closed eye `closed` draws
 * nearest it (by its place across its own face) stamped in ink centred on
 * it, on the face only. Nothing outside the eyes' boxes changes, so a blink
 * moves no outline. Refused when either face reads no eyes.
 */
export const blinkOf = (
  open: Raster,
  closed: Raster,
  paints: ReadonlyArray<Paint>,
): Result.Result<Raster, BlinkRefused> =>
  Result.flatMap(Result.flatMap(eyedFaceOf(open, paints, 'open cell'), openEyed(open)), (o) =>
    Result.map(eyedFaceOf(closed, paints, 'blink drawing'), (c) => {
      const ink = paints[0]?.rgb ?? [0, 0, 0];
      const rgba = open.rgba.slice();
      const across = (b: Box, face: Face) => (middleOf(b)[0] - face.box.x) / face.box.width;
      const stamps = c.eyes.map((px) => ({ px, box: boxOf(px, closed.width) }));
      for (const px of o.eyes) {
        const eye = boxOf(px, open.width);
        const skin = ringPaintOf(open, px, o.face);
        for (const q of px) rgba.set(skin, q * 4);
        const stamp = stamps.toSorted(
          (a, b) =>
            Math.abs(across(a.box, c.face) - across(eye, o.face)) -
            Math.abs(across(b.box, c.face) - across(eye, o.face)),
        )[0];
        if (!stamp) continue;
        const [ex, ey] = middleOf(eye);
        const [sx, sy] = middleOf(stamp.box);
        const [ox, oy] = [Math.round(ex - sx), Math.round(ey - sy)];
        const own = new Set(px);
        for (const q of stamp.px) {
          const [x, y] = [(q % closed.width) + ox, Math.floor(q / closed.width) + oy];
          const at = y * open.width + x;
          if (x < 0 || y < 0 || x >= open.width || y >= open.height) continue;
          if (o.face.mask[at] === 1 || own.has(at)) rgba.set(ink, at * 4);
        }
      }
      return { width: open.width, height: open.height, rgba };
    }),
  );

/** A run of rows of a picture, inclusive. */
export interface Band {
  readonly top: number;
  readonly bottom: number;
}

/**
 * The eye band of a blink of `open` by `closed`: the rows of `open`'s eyes,
 * widened up and down by the tallest eye either face draws, so it holds
 * every pixel `blinkOf` may paint; none when either face reads no eyes.
 */
export const eyeBandOf = (
  open: Raster,
  closed: Raster,
  paints: ReadonlyArray<Paint>,
): Option.Option<Band> =>
  Result.getSuccess(
    Result.flatMap(eyedFaceOf(open, paints, 'open cell'), (o) =>
      Result.map(eyedFaceOf(closed, paints, 'blink drawing'), (c) => {
        const opens = o.eyes.map((px) => boxOf(px, open.width));
        const tallest = Math.max(
          ...opens.map((b) => b.height),
          ...c.eyes.map((px) => boxOf(px, closed.width).height),
        );
        return {
          top: Math.min(...opens.map((b) => b.y)) - tallest,
          bottom: Math.max(...opens.map((b) => b.y + b.height - 1)) + tallest,
        };
      }),
    ),
  );

/**
 * How many pixels `shown` draws otherwise than `open` outside `band` (rows of
 * `open`), each picture set on its own anchor (`[ax, ay]` in its own px) as
 * the painter sets a cell, so a blink that swapped the whole drawing counts
 * every body pixel it moved: a blink must count none.
 */
export const changedOutsideBand = (
  open: Raster,
  openAt: readonly [number, number],
  shown: Raster,
  shownAt: readonly [number, number],
  band: Band,
): number => {
  const [ox, oy] = [Math.round(openAt[0]), Math.round(openAt[1])];
  const [sx, sy] = [Math.round(shownAt[0]), Math.round(shownAt[1])];
  const pixel = (r: Raster, x: number, y: number) => {
    if (x < 0 || y < 0 || x >= r.width || y >= r.height) return 0;
    const at = (y * r.width + x) * 4;
    const alpha = r.rgba[at + 3] ?? 0;
    if (alpha === 0) return 0;
    const [red, green, blue] = [r.rgba[at] ?? 0, r.rgba[at + 1] ?? 0, r.rgba[at + 2] ?? 0];
    return (((red << 24) | (green << 16) | (blue << 8) | alpha) >>> 0) + 1;
  };
  const [left, right] = [Math.min(-ox, -sx), Math.max(open.width - ox, shown.width - sx)];
  const [top, bottom] = [Math.min(-oy, -sy), Math.max(open.height - oy, shown.height - sy)];
  let changed = 0;
  for (let y = top; y < bottom; y++) {
    if (y + oy >= band.top && y + oy <= band.bottom) continue;
    for (let x = left; x < right; x++)
      if (pixel(open, x + ox, y + oy) !== pixel(shown, x + sx, y + sy)) changed += 1;
  }
  return changed;
};

/** A head could not be worn: why. */
export class HeadRefused extends Schema.TaggedError<HeadRefused>()('HeadRefused', {
  reason: Schema.String,
}) {
  override get message() {
    return `no head: ${this.reason}`;
  }
}

/** A figure's head: the opaque pixels joined to its face from its crown down to its chin (the face's last row) or `past` rows below it, their box, the face's box, the face's own skin region (`Face.mask`), and the crown and chin rows. */
interface Head {
  readonly px: ReadonlyArray<number>;
  readonly box: Box;
  readonly face: Box;
  readonly skin: Uint8Array;
  readonly crown: number;
  readonly chin: number;
}

/** A figure's head (`Head`) reaching `past` rows below its chin, none when it reads no face. */
const headOf = (r: Raster, paints: ReadonlyArray<Paint>, past = 0): Option.Option<Head> =>
  Option.flatMap(outlineOf(r), (lines) =>
    Option.map(faceOf(r, paints), (face) => {
      const chin = face.box.y + face.box.height - 1;
      const px = regionAt(
        r,
        face.mask.indexOf(1),
        (q) => {
          const y = Math.floor(q / r.width);
          return y >= lines.crown && y <= chin + past && alphaAt(r, q) > 0;
        },
        around4,
      );
      return {
        px,
        box: boxOf(px, r.width),
        face: face.box,
        skin: face.mask,
        crown: lines.crown,
        chin,
      };
    }),
  );

/** The head `r` draws as `paints` read it, inclusive box; none when it reads no face. */
export const headBoxOf = (r: Raster, paints: ReadonlyArray<Paint>): Option.Option<Box> =>
  Option.map(headOf(r, paints), (h) => h.box);

/**
 * The cell `body` wearing the head `head` draws (critique 3, items 2 and
 * 6; round 4, M2): `body`'s own head (`headOf`) and every opaque pixel in
 * the box the worn head lands in are cleared, and the worn head is pasted
 * there, set on `body`'s crown row and its face's middle column, reaching
 * down to the lower of the two chins so no row of `body`'s face is left.
 * Of the cleared pixels the worn head does not cover, each 4-connected
 * piece drawn only in ink and hair, joining no other paint, is the old
 * head, its outline or its hair, and stays clear; a piece that is part of
 * an arm (`armOf`, a raised sleeve and its hand) is put back when it holds
 * no hair and meets the worn head only across ink. Refused when either
 * cell reads no face; when the faces differ by more than a pixel in width
 * or height, a head turned or tilted; when the crowns and the face middles
 * disagree by more than a pixel, hair drawn taller or shorter; and when
 * any other piece is left, its part not told: hair joining the body, or
 * cloth or skin that is not an arm, a headcloth, a hood or a shoulder.
 */
export const withHeadOf = (
  body: Raster,
  head: Raster,
  paints: ReadonlyArray<Paint>,
): Result.Result<Raster, HeadRefused> => {
  const read = (r: Raster, which: string, past: number) =>
    Result.fromOption(headOf(r, paints, past), () =>
      HeadRefused.make({ reason: `the ${which} reads no face` }),
    );
  const refuse = (reason: string) => Result.fail(HeadRefused.make({ reason }));
  const nearest = pixelNearestOf(paints);
  const roleAt = (r: Raster, q: number): Role | 'ink' => paints[nearest(r, q).index]?.role ?? 'ink';
  return Result.flatMap(read(body, 'body cell', 0), (b) =>
    Result.flatMap(read(head, 'head cell', 0), (h0) => {
      const [dw, dh] = [b.face.width - h0.face.width, b.face.height - h0.face.height];
      if (Math.abs(dw) > 1 || Math.abs(dh) > 1)
        return refuse(
          `the faces differ (${h0.face.width}×${h0.face.height} worn on ${b.face.width}×${b.face.height}): a head turned or tilted`,
        );
      const [bx, by] = middleOf(b.face);
      const [hx, hy] = middleOf(h0.face);
      const [ox, oy] = [Math.round(bx - hx), b.crown - h0.crown];
      if (Math.abs(by - hy - oy) > 1)
        return refuse(
          `the crowns and the faces disagree (${by - hy - oy} px): hair drawn taller or shorter`,
        );
      return Result.flatMap(read(head, 'head cell', Math.max(0, b.chin - oy - h0.chin)), (h) => {
        const inBox = (q: number) => {
          const [x, y] = [q % body.width, Math.floor(q / body.width)];
          return (
            x >= h.box.x + ox &&
            y >= h.box.y + oy &&
            x < h.box.x + h.box.width + ox &&
            y < h.box.y + h.box.height + oy
          );
        };
        const cleared = new Set(b.px);
        for (let q = 0; q < body.width * body.height; q++)
          if (alphaAt(body, q) > 0 && inBox(q)) cleared.add(q);
        const rgba = body.rgba.slice();
        for (const q of cleared) rgba.fill(0, q * 4, q * 4 + 4);
        const worn = new Map<number, number>();
        for (const q of h.px) {
          const [x, y] = [(q % head.width) + ox, Math.floor(q / head.width) + oy];
          if (x < 0 || y < 0 || x >= body.width || y >= body.height) continue;
          worn.set(y * body.width + x, q);
          rgba.set(head.rgba.subarray(q * 4, q * 4 + 4), (y * body.width + x) * 4);
        }
        const left = new Set([...cleared].filter((q) => !worn.has(q)));
        const seen = new Uint8Array(body.width * body.height);
        const floor = [...cleared].reduce((y, q) => Math.max(y, Math.floor(q / body.width)), 0);
        const wearing = { body, head, cleared, worn, roleAt };
        const arm = armOf({ ...wearing, skin: b.skin, floor });
        for (const q0 of left) {
          if (seen[q0] === 1) continue;
          seen[q0] = 1;
          const piece = flood(body, seen, q0, (q) => left.has(q), around4);
          const fate = pieceFateOf(piece, { ...wearing, arm });
          if (Result.isFailure(fate)) return Result.fail(fate.failure);
          if (fate.success)
            for (const q of piece) rgba.set(body.rgba.subarray(q * 4, q * 4 + 4), q * 4);
        }
        return Result.succeed({ width: body.width, height: body.height, rgba });
      });
    }),
  );
};

/** What `withHeadOf` reads a left-over piece against: the two cells, the pixels it cleared, where each worn head pixel landed (body px to head px), and the role a pixel is drawn in. */
interface Wearing {
  readonly body: Raster;
  readonly head: Raster;
  readonly cleared: ReadonlySet<number>;
  readonly worn: ReadonlyMap<number, number>;
  readonly roleAt: (r: Raster, q: number) => Role | 'ink';
}

/**
 * Whether `withHeadOf` puts a piece of `body` it cleared back: false for
 * the old head (drawn only in ink and hair, joining no other paint), true
 * for a part of an arm (`armOf`: every pixel of it not ink a sleeve that
 * meets a hand, or a hand that meets a sleeve, holding no hair and meeting
 * the worn head only across ink). Every other piece is refused, its part
 * not told: paint and joins cannot tell a headcloth or hood from a sleeve,
 * but an arm always ends in a hand.
 */
const pieceFateOf = (
  piece: ReadonlyArray<number>,
  { body, head, cleared, worn, roleAt, arm }: Wearing & { readonly arm: (q: number) => boolean },
): Result.Result<boolean, HeadRefused> => {
  const roles = new Set(piece.map((q) => roleAt(body, q)));
  const refuse = (why: string) =>
    Result.fail(
      HeadRefused.make({
        reason: `a piece of ${piece.length} px in ${[...roles].join(', ')} ${why}: its part cannot be told`,
      }),
    );
  const painted = (q: number, next: (m: number) => boolean) =>
    roleAt(body, q) !== 'ink' && around4(q, body.width, body.height).some(next);
  if ([...roles].every((role) => role === 'ink' || role === 'hair')) {
    const joins = piece.some((q) =>
      painted(q, (m) => alphaAt(body, m) > 0 && !cleared.has(m) && roleAt(body, m) !== 'ink'),
    );
    if (joins) return refuse('joins the body');
    return Result.succeed(false);
  }
  if (roles.has('hair')) return refuse('holds hair beside another paint');
  const runsIn = piece.some((q) =>
    painted(q, (m) =>
      Option.exists(Option.fromUndefinedOr(worn.get(m)), (hq) => roleAt(head, hq) !== 'ink'),
    ),
  );
  if (runsIn) return refuse('runs paint to paint into the worn head');
  const stray = piece.filter((q) => roleAt(body, q) !== 'ink' && !arm(q));
  if (stray.length > 0) {
    const box = boxOf(stray, body.width);
    const where = `${[...new Set(stray.map((q) => roleAt(body, q)))].join(', ')} at x ${box.x}–${box.x + box.width - 1}, y ${box.y}–${box.y + box.height - 1}`;
    return refuse(`is not an arm, a sleeve ending in a hand (its ${where})`);
  }
  return Result.succeed(true);
};

/**
 * Whether a pixel of `body` is part of an arm, the only part a worn head
 * puts back: a hand is a region of skin that is not the face's own skin
 * region (`skin`); a sleeve is a region of paint other than ink, hair and
 * skin at or above `floor`, the last row the paste clears. A sleeve that meets a hand, or a hand that meets a sleeve, is an
 * arm. Two regions meet when they touch or when a straight run of ink, an
 * outline as thick as it is drawn, lies between them across a row or a
 * column. A path down past `floor`
 * into the robe is not followed, so cloth joined to the robe below the head
 * is never an arm by a hand the robe meets elsewhere.
 */
const armOf = ({
  body,
  roleAt,
  skin,
  floor,
}: Pick<Wearing, 'body' | 'roleAt'> & {
  readonly skin: Uint8Array;
  readonly floor: number;
}): ((q: number) => boolean) => {
  const { width, height } = body;
  const drawn = (q: number) => alphaAt(body, q) > 0;
  const isSkin = (q: number) => drawn(q) && roleAt(body, q) === 'skin';
  const isSleeve = (q: number) =>
    drawn(q) &&
    Math.floor(q / width) <= floor &&
    !['ink', 'hair', 'skin'].includes(roleAt(body, q));
  const isInk = (q: number) => drawn(q) && roleAt(body, q) === 'ink';
  const fate = new Uint8Array(width * height);
  const regionOf = (q0: number, member: (q: number) => boolean) => {
    const seen = new Uint8Array(width * height);
    seen[q0] = 1;
    return flood(body, seen, q0, member, around4);
  };
  const hands = new Uint8Array(width * height);
  const isHand = (q: number): boolean => {
    if (!isSkin(q)) return false;
    if (hands[q] === 0) {
      const region = regionOf(q, isSkin);
      const own = Number(region.some((m) => skin[m] === 1)) + 1;
      for (const m of region) hands[m] = own;
    }
    return hands[q] === 1;
  };
  const steps = [1, -1, width, -width];
  const meets = (q: number, other: (m: number) => boolean) =>
    steps.some((step) => {
      const across = (m: number) => Math.abs((m % width) - ((m - step) % width)) <= 1;
      let m = q + step;
      while (m >= 0 && m < width * height && across(m) && isInk(m)) m += step;
      return m >= 0 && m < width * height && across(m) && other(m);
    });
  const settle = (region: ReadonlyArray<number>, armed: boolean) => {
    for (const m of region) fate[m] = Number(armed) + 1;
    return armed;
  };
  return (q) => {
    if (fate[q] !== 0) return fate[q] === 2;
    if (isSleeve(q)) {
      const sleeve = regionOf(q, isSleeve);
      return settle(
        sleeve,
        sleeve.some((m) => meets(m, isHand)),
      );
    }
    const hand = regionOf(q, isSkin);
    return settle(hand, isHand(q) && hand.some((m) => meets(m, isSleeve)));
  };
};

/** The paint a drawing lays inside `box` (clipped to the picture): each channel's median over the box's fully opaque pixels, black when none lies there. A box read on a flat patch of one paint reads that paint, its ink lines and grain left out by the median. */
export const measuredPaint = (r: Raster, box: Box): Rgb => {
  const picked: Array<Rgb> = [];
  for (let y = Math.max(0, box.y); y < Math.min(r.height, box.y + box.height); y++)
    for (let x = Math.max(0, box.x); x < Math.min(r.width, box.x + box.width); x++) {
      const q = y * r.width + x;
      if (alphaAt(r, q) === 255) picked.push(rgbAt(r, q));
    }
  const median = (k: 0 | 1 | 2) =>
    picked.map((p) => p[k]).sort((a, b) => a - b)[picked.length >> 1] ?? 0;
  return [median(0), median(1), median(2)];
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
