// Fit rows: a cast render's view held to the view the owner kept by
// numbers, each with its bar, before a model is shown it (`film concept
// render`, `tools/cast-render.ts`). Both crops are cut by the kept box at
// one scale. Each crop's ground is its own (a render's paper is not the
// sheet's): the colour of its border, and the ground is what its border
// reaches through pixels near that colour, four ways. The figure is the
// rest: what the ink bounds, its line too. A crop whose figure is not read
// gives no row, and no rows never pass (`fitPasses`).
//
// The rows, each a number and its bar (`FIT_BARS`, a view's own in its
// spec):
// - `silhouette.edge`, per band: the mean distance of the outer edge, left
//   and right, row by row, where both crops have the figure.
// - `silhouette.iou`: the figures' overlap.
// - `ink.edge`: the mean distance from the render's ink to the sheet's.
// - `outline.turns`, per band: the render's sharpest turn of its outer edge
//   (its second difference over 3 rows) less the sheet's sharpest within 3
//   rows of it: a kink the sheet does not draw.
// - `slivers`: paper 2 px thin or less in thin strips 6 px long or more
//   (a seam between a line and the hair, a hairpin's tip, a strip cut loose
//   of the figure) the render has beyond the sheet's, pixels.
// - `holes`: the ground the figure closes round, beyond the sheet's, pixels.
// - With the member's colour classes (`FitSpec.classes`), per class:
//   `class.iou`, the class's overlap (the sheet's pixels by its samples, the
//   render's by the film's papers), and `class.colour`, the mean ΔE76
//   between the two crops where both read it.
// - With his part labels too (`FitSpec.labels`), per label the view
//   compares: `part.iou`, the overlap of the region it picks on each crop,
//   and `part.edge`, the mean distance between their edges, both ways. Each
//   crop is labelled by its own classes, the render by the film's papers, so
//   a part is the same part on both. A label that picks no region on a crop,
//   itself or through a label its rules name (one of a class the rows read
//   none of), fails both rows and says which label and why.
// - With a view's probes (`FitSpec.probes`), `probe.<name>`: a row or a
//   column read as a string of classes (ink, ground, each class), each
//   change of class on one crop matched in order to the same change on the
//   other (an ear's band, a chin's line, a seam between two papers); the
//   largest distance between a matched pair, pixels, or the probe's length
//   where a change on either crop has no match (a line the render adds or
//   leaves out).
// The bands: `head`, the top 30% of the sheet's figure rows (the cast
// canon's head share rounded up), `body` the rest, `figure` the whole. A
// row passes exactly when its value, rounded to hundredths, lies inside its
// bar. A cut-out view's neighbour (`FitSpec.neighbour`) is another
// figure's art: its pixels are ground on both crops, so no row reads them.
// Pure: RGBA in, rows out, the same rows for the same crops.

import { Option } from 'effect';
import { type Rgb, componentsOf, deltaE, labOf, lumaOf, rgbAt } from './cast-sheet-pixels.ts';
import { type LabelRegion, type LabelTable, labelRegions, touchingIn } from './label.ts';
import type { Raster } from './raster.ts';

/**
 * Below this luma a pixel of the figure is its line: the ink (a sheet's 4
 * to 30, a render's 39) and its antialiased edge, and the hair's darkest
 * brown on both. The outer edge is the outermost such pixel of a row, as
 * the art reviews' probes read it (`runs.ts`, `edge.ts`, luma 80 to 90).
 */
const LINE_LUMA = 90;

/** The least overlap of a labelled part's regions on the two crops (`part.iou`), and the most mean distance between their edges, pixels (`part.edge`): calibrated in rig-fit round 1. */
const PART_IOU = 0.7;
const PART_EDGE = 3;

/** How near two of a crop's regions lie to touch, pixels (`core/label.ts` `touching`): across the widest line a sheet draws, as the tracer reads it. */
const PART_TOUCH = 12;

/** A row's bar: the least and the most its value may be. */
export interface FitBar {
  readonly min?: number;
  readonly max?: number;
}

/** Where a row measures: the whole figure, its head band or the rest. */
type FitBand = 'figure' | 'head' | 'body';

/** One row: what it measures, where, its value and bar, and whether it passes; the two crops' own numbers and where it was worst, when it has them. */
export interface FitRow {
  readonly name: string;
  readonly band: FitBand;
  readonly part: string;
  readonly value: number;
  readonly bar: FitBar;
  readonly pass: boolean;
  readonly concept?: number;
  readonly render?: number;
  readonly where?: string;
}

/**
 * Each row's bar, by its name (a probe's under `probe`), or by its name and
 * band where a band's differs (`outline.turns/body`: a hand's or a foot's
 * end steps the outer edge, where a head's curve only turns), measured on
 * lead-feast's renders (rig-fit round 1).
 */
export const FIT_BARS = {
  'silhouette.edge': { max: 3 },
  'silhouette.iou': { min: 0.9 },
  'ink.edge': { max: 2.5 },
  'outline.turns': { max: 5 },
  'outline.turns/body': { max: 12 },
  slivers: { max: 4 },
  holes: { max: 8 },
  'class.iou': { min: 0.6 },
  'class.colour': { max: 12 },
  'part.iou': { min: PART_IOU },
  'part.edge': { max: PART_EDGE },
  probe: { max: 4 },
} as const satisfies Record<string, FitBar>;

/** A bar's name: a row's, a row's and band's, a class or part row's and its class or part's, or `probe` for every probe's row. */
export type FitBarName =
  | keyof typeof FIT_BARS
  | `${'silhouette.edge' | 'outline.turns'}/${'head' | 'body'}`
  | `${'class.iou' | 'class.colour' | 'part.iou' | 'part.edge'}/${string}`;

/**
 * The bar a row is held to: the spec's for its name and band or part
 * (`class.iou/cream`), else for its name, else `FIT_BARS`' the same way.
 */
const barOf = (
  spec: FitSpec,
  name: keyof typeof FIT_BARS,
  band: FitBand,
  part = 'figure',
): FitBar => {
  const own = Object.entries(spec.bars ?? {});
  for (const k of [`${name}/${band}`, `${name}/${part}`, name]) {
    const b = own.find(([key]) => key === k)?.[1];
    if (b !== undefined) return b;
  }
  const banded = Object.entries(FIT_BARS).find(([key]) => key === `${name}/${band}`)?.[1];
  return banded ?? FIT_BARS[name];
};

/** A colour class: its samples on the sheet, and the film's papers that paint it on the render. */
export interface FitClass {
  readonly sheet: ReadonlyArray<string>;
  readonly paper: ReadonlyArray<string>;
}

/** A probe: a row (`along: 'row'`, at its y) or a column (at its x) of the crop, from `from` to `to` across it, crop pixels. */
export interface FitProbe {
  readonly name: string;
  readonly along: 'row' | 'col';
  readonly at: number;
  readonly from: number;
  readonly to: number;
  /** Under this luma a pixel reads as the line (`PROBE_DARK` unless given): a chin's brown line reads under 135, the sheet's dark teal under 90. */
  readonly dark?: number;
  /** Its own bar (the spec's `probe` bar, else `FIT_BARS.probe`, unless given). */
  readonly bar?: FitBar;
}

/** What a view is held to beyond the figure: its member's classes, his part labels (`core/label.ts`, read on both crops by the classes), its probes, and its own bars. */
export interface FitSpec {
  readonly classes?: Readonly<Record<string, FitClass>>;
  readonly labels?: LabelTable;
  readonly probes?: ReadonlyArray<FitProbe>;
  readonly bars?: Readonly<Partial<Record<FitBarName, FitBar>>>;
  /** A cut-out view's neighbour: 1 where the kept crop holds another figure's art the puppet leaves out. The cast page draws it with that figure's own puppet, so it is ground on both crops and no row reads it. Crop-sized. */
  readonly neighbour?: Uint8Array;
}

/**
 * How near the crop's ground colour a pixel is ground, ΔE76: `GROUND_SPREAD`
 * times the spread of its border's ground (its 90th centile), and never less
 * than `GROUND_DE`. A render's ground is flat (its spread under 1.5) and its
 * cream papers lie 5 to 8 from it; a sheet's paper has a grain (5 to 6),
 * and its line closes its figure, cream and all, from the flood.
 */
const GROUND_DE = 3;
const GROUND_SPREAD = 1.5;

/** The border's pixels farther than this from its median colour, ΔE76, are the figure where it crosses the border, not its ground's grain. */
const BORDER_GROUND = 15;

/** A piece of the figure smaller than this, pixels, is the ground's grain the flood stepped round: ground, unless it is a thin strip (`thinStrips`), a sliver. */
const SPECK = 24;

/** The head band's share of the figure's rows, from its top. */
const HEAD_SHARE = 0.3;

/** How many rows the outline's turn spans each way. */
const TURN_SPAN = 3;

/** How far each way the sheet's sharpest turn is looked for beside the render's. */
const TURN_NEAR = 3;

/** How many rows from the figure's top and bottom the turn is not read: a crown's or a sole's flat row turns any way. */
const TURN_END = 6;

/** The thickest paper a sliver is, pixels. */
const SLIVER_THICK = 2;

/** The shortest run of thin paper that is a sliver, pixels. */
const SLIVER_LONG = 6;

/** Under this luma a probe reads a pixel as the line, as the art reviews' class strings do (`probes.ts`, `cls`: L < 60). */
const PROBE_DARK = 60;

/** How far past each end a probe is read, pixels: a change just inside an end is matched to the same change just outside it, and a change outside both ends is matched but not held. */
const PROBE_REACH = 8;

/** A probe's run shorter than this is the antialiased edge between two classes, pixels: it joins the run before it. */
const PROBE_RUN = 2;

/** A value as the row keeps it: rounded to hundredths. */
const kept = (v: number) => Math.round(v * 100) / 100;

const within = (v: number, bar: FitBar) =>
  (bar.min === undefined || v >= bar.min) && (bar.max === undefined || v <= bar.max);

/** Whether every row passes; no rows never do (a crop whose figure is not read). */
export const fitPasses = (rows: ReadonlyArray<FitRow>): boolean =>
  rows.length > 0 && rows.every((r) => r.pass);

/** A crop read: its size, its ground colour, its ground, its figure, its ink and its paper. */
interface Read {
  readonly r: Raster;
  readonly w: number;
  readonly h: number;
  readonly lab: Rgb;
  /** How near `lab` a pixel is ground-like, ΔE76 (`groundColour`). */
  readonly near: number;
  /** How near `lab` its own ground's pixels lie, its grain too, ΔE76: the farthest within `BORDER_GROUND`, never under `near`. */
  readonly reach: number;
  /** 1 where the border reaches through ground-like pixels. */
  readonly ground: Uint8Array;
  /** 1 where ground-like but closed in by the figure: a hole. */
  readonly holes: Uint8Array;
  readonly ink: Uint8Array;
  /** The figure's pixels that are neither ink nor a hole. */
  readonly paper: Uint8Array;
  /** Each row's outer edge, left and right (NaN where the row holds no figure). */
  readonly left: Float64Array;
  readonly right: Float64Array;
  readonly top: number;
  readonly bottom: number;
}

/** The crop's ground colour (its border's median, Lab) and how near it a pixel is ground (`GROUND_DE`). */
const groundColour = (r: Raster, labs: ReadonlyArray<Rgb>) => {
  const { width: w, height: h } = r;
  const at: number[] = [];
  for (let x = 0; x < w; x++) at.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) at.push(y * w, y * w + w - 1);
  const median = (c: 0 | 1 | 2) => {
    const vs = at.map((i) => r.rgba[i * 4 + c] ?? 0).sort((a, b) => a - b);
    return vs[vs.length >> 1] ?? 0;
  };
  const lab = labOf([median(0), median(1), median(2)]);
  const spread = at
    .map((i) => deltaE(labs[i] ?? lab, lab))
    .filter((d) => d <= BORDER_GROUND)
    .sort((a, b) => a - b);
  const p90 = spread[Math.floor(0.9 * (spread.length - 1))] ?? 0;
  return { lab, near: Math.max(GROUND_DE, GROUND_SPREAD * p90) };
};

/** The pixels of `mask` whose four-way piece touches the crop's border. */
const fromBorder = (mask: Uint8Array, w: number, h: number): Uint8Array => {
  const { labels } = componentsOf(mask, w, h, false);
  const border = new Set<number>();
  for (let x = 0; x < w; x++) border.add(labels[x] ?? -1).add(labels[(h - 1) * w + x] ?? -1);
  for (let y = 0; y < h; y++) border.add(labels[y * w] ?? -1).add(labels[y * w + w - 1] ?? -1);
  border.delete(-1);
  return Uint8Array.from(labels, (l) => (border.has(l) ? 1 : 0));
};

const count = (m: Uint8Array) => m.reduce((s, v) => s + v, 0);

/** Each pixel of `mask` marked in `thin` where its run along a line (`n` pixels, the `k`th at `at(k)`) is `SLIVER_THICK` or thinner. */
const markThin = (mask: Uint8Array, thin: Uint8Array, n: number, at: (k: number) => number) => {
  let start = 0;
  for (let k = 0; k <= n; k++) {
    if (k < n && mask[at(k)] === 1) continue;
    if (k - start > 0 && k - start <= SLIVER_THICK) for (let j = start; j < k; j++) thin[at(j)] = 1;
    start = k + 1;
  }
};

/** The pixels of `mask` in thin strips: `SLIVER_THICK` or less across, along a row or a column, in a piece `SLIVER_LONG` long or more. */
const thinStrips = (mask: Uint8Array, w: number, h: number): Uint8Array => {
  const thin = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) markThin(mask, thin, w, (x) => y * w + x);
  for (let x = 0; x < w; x++) markThin(mask, thin, h, (y) => y * w + x);
  const { components, labels } = componentsOf(thin, w, h, true);
  const long = new Set(
    components
      .filter((c) => Math.max(c.box[2] - c.box[0], c.box[3] - c.box[1]) >= SLIVER_LONG)
      .map((c) => c.id),
  );
  return Uint8Array.from(labels, (l) => (long.has(l) ? 1 : 0));
};

/** A crop's ground colour (Lab), its ground-like pixels (1 near that colour), and its ground: what its border reaches through them, the specks of grain the flood stepped round with it. */
const groundOf = (r: Raster) => {
  const { width: w, height: h } = r;
  const n = w * h;
  const labs = Array.from({ length: n }, (_, i) => labOf(rgbAt(r, i)));
  const { lab, near } = groundColour(r, labs);
  const like = Uint8Array.from(labs, (c) => (deltaE(c, lab) <= near ? 1 : 0));
  const ground = fromBorder(like, w, h);
  // A speck the flood stepped round (the paper's grain) is ground; a speck
  // that is a thin strip, cut loose of the figure, stays a sliver of it.
  const figure = Uint8Array.from(ground, (g) => 1 - g);
  const pieces = componentsOf(figure, w, h, true);
  const specks = Uint8Array.from(pieces.labels, (l) =>
    (pieces.components[l]?.area ?? SPECK) < SPECK ? 1 : 0,
  );
  const strips = thinStrips(specks, w, h);
  const kept = new Set(pieces.labels.filter((l, i) => strips[i] === 1));
  for (let i = 0; i < n; i++)
    if (specks[i] === 1 && !kept.has(pieces.labels[i] ?? -1)) ground[i] = 1;
  // How far its own ground lies from its colour, grain and all: a farther
  // speck in it (dust, a stray mark) is not the ground's colour.
  let reach = near;
  for (let i = 0; i < n; i++) {
    const d = ground[i] === 1 ? deltaE(labs[i] ?? lab, lab) : 0;
    if (d > reach && d <= BORDER_GROUND) reach = d;
  }
  return { lab, near, reach, like, ground };
};

/**
 * A picture's figure as the fit rows read it (`silhouette.iou`): 1 where its
 * ground does not reach, what the ink bounds, its holes too; its holes (1
 * where ground-like but closed in by the figure); and its ground colour, Lab.
 */
export const figureOf = (r: Raster) => {
  const { lab, like, ground } = groundOf(r);
  return {
    figure: Uint8Array.from(ground, (g) => 1 - g),
    holes: Uint8Array.from(ground, (g, i) => Number(g === 0 && like[i] === 1)),
    ground: lab,
  };
};

/** The measuring ground's least luma: a light paper, as a render's is. */
const MEASURE_LUMA = 180;

/** The measuring ground's RGB grid step: 18 levels a channel. */
const MEASURE_STEP = 15;

/** A pixel this opaque or more is a figure's colour the measuring ground keeps away from. */
const OPAQUE = 250;

const hexRgb = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

/**
 * The ground a cut-out member's posed crops are read over: the light colour
 * (luma 180 or more, on an RGB grid of step 15) whose least ΔE76 to every
 * opaque pixel of `figures` (alpha 250 or more) and every colour of `extra`
 * (hex, the member's sheet samples) is largest. The page's paper is a
 * figure colour for a member whose cloth lies within ΔE 3.5 of it, and the
 * crop's ground flood then eats that cloth; this ground lies far from all of
 * them. Clear pixels are not the figure's, so they do not move it.
 */
export const measuringGround = (
  figures: ReadonlyArray<Raster>,
  extra: ReadonlyArray<string> = [],
): Rgb => {
  const labs = [...opaqueColours(figures), ...extra.map(hexRgb)].map(labOf);
  let [best, bestD]: [Rgb, number] = [[255, 255, 255], -1];
  for (const c of lightGrid()) {
    const least = leastDeltaE(labOf(c), labs, bestD);
    if (least > bestD) [best, bestD] = [c, least];
  }
  return best;
};

/** Each colour an opaque pixel of `figures` has, once. */
const opaqueColours = (figures: ReadonlyArray<Raster>): Rgb[] => {
  const packed = new Set<number>();
  for (const f of figures)
    for (let i = 0; i < f.width * f.height; i++)
      if ((f.rgba[i * 4 + 3] ?? 0) >= OPAQUE) {
        const [r, g, b] = rgbAt(f, i);
        packed.add(r * 65536 + g * 256 + b);
      }
  return Array.from(packed, (p): Rgb => [
    Math.floor(p / 65536),
    Math.floor(p / 256) % 256,
    p % 256,
  ]);
};

/** The grid's colours light enough for a measuring ground. */
const lightGrid = (): Rgb[] => {
  const out: Rgb[] = [];
  for (let r = 0; r <= 255; r += MEASURE_STEP)
    for (let g = 0; g <= 255; g += MEASURE_STEP)
      for (let b = 0; b <= 255; b += MEASURE_STEP)
        if (lumaOf([r, g, b]) >= MEASURE_LUMA) out.push([r, g, b]);
  return out;
};

/** The least ΔE76 from `lab` to `labs`, stopping once it is `stop` or less (a candidate that cannot win). */
const leastDeltaE = (lab: Rgb, labs: ReadonlyArray<Rgb>, stop: number) => {
  let least = Infinity;
  for (const l of labs) {
    least = Math.min(least, deltaE(lab, l));
    if (least <= stop) break;
  }
  return least;
};

/** `posed` laid over `ground`, straight alpha: each pixel's colour mixed with the ground by its alpha, its alpha kept, so the fit rows read which pixels were see-through. */
export const overGround = (posed: Raster, ground: Rgb): Raster => {
  const rgba = Uint8Array.from(posed.rgba);
  for (let i = 0; i < posed.width * posed.height; i++) {
    const a = posed.rgba[i * 4 + 3] ?? 0;
    for (let k = 0; k < 3; k++)
      rgba[i * 4 + k] = Math.round(
        ((posed.rgba[i * 4 + k] ?? 0) * a + (ground[k] ?? 0) * (255 - a)) / 255,
      );
  }
  return { width: posed.width, height: posed.height, rgba };
};

/**
 * A `w` x `h` neighbour mask cut from `still` at `at`: 1 where the still holds
 * art (alpha above 0). None when the box leaves the still, since a row index
 * past its edge would read the next or previous row.
 */
export const neighbourMask = (
  still: Raster,
  at: readonly [number, number],
  w: number,
  h: number,
): Option.Option<Uint8Array> => {
  const [nx, ny] = at;
  if (nx < 0 || ny < 0 || nx + w > still.width || ny + h > still.height) return Option.none();
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if ((still.rgba[((y + ny) * still.width + x + nx) * 4 + 3] ?? 0) > 0) mask[y * w + x] = 1;
  return Option.some(mask);
};

/** Whether a pixel of `of` lies within `within` (ΔE76) of the kept crop `c`'s ground colour. */
const groundNear = (c: Read, of: Raster, within: number) => (i: number) =>
  deltaE(labOf(rgbAt(of, i)), c.lab) <= within;

/** How far from a pocket a clear pixel is excused, Chebyshev pixels: the cut-out draws a pocket up to 4 px wider than the sheet. */
const POCKET_REACH = 4;

/** How near the kept crop's ground a pocket's paper core lies, ΔE76: a light cloth's grain makes kept holes as large as a true pocket, so only colour tells them apart, and the farther the core reaches, the more of that grain it takes for pockets. */
const POCKET_CORE_DE = 2;

/** The pixels within `POCKET_CORE_DE` a kept hole holds to be a pocket: a light cloth's grain holds a few that near the ground, a true pocket far more. */
const POCKET_CORE = 9;

/** The kept crop's pockets: each kept hole with a paper core (`POCKET_CORE`), where the sheet's paper shows through the figure. */
const pocketsOf = (c: Read): Uint8Array => {
  const kept = componentsOf(c.holes, c.w, c.h, false);
  const core = new Uint32Array(kept.components.length);
  kept.labels.forEach((l, i) => {
    if (l >= 0 && deltaE(labOf(rgbAt(c.r, i)), c.lab) <= POCKET_CORE_DE)
      core[l] = (core[l] ?? 0) + 1;
  });
  return Uint8Array.from(kept.labels, (l) => Number(l >= 0 && (core[l] ?? 0) >= POCKET_CORE));
};

/** `mask` grown by `by` pixels, Chebyshev: a row pass, then a column pass. */
const grown = (mask: Uint8Array, w: number, h: number, by: number): Uint8Array => {
  const across = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mask[y * w + x] === 1)
        for (let xx = Math.max(0, x - by); xx <= Math.min(w - 1, x + by); xx++)
          across[y * w + xx] = 1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (across[y * w + x] === 1)
        for (let yy = Math.max(0, y - by); yy <= Math.min(h - 1, y + by); yy++) out[yy * w + x] = 1;
  return out;
};

/**
 * A cut-out render's holes: the clear pixels (alpha 0) of each enclosed
 * component of see-through pixels (alpha under 128, four ways, not touching
 * the crop's border), where the kept crop reads figure that is not its hole
 * (a neighbour's pixels are its ground, `readCrop`). A clear pixel within
 * `POCKET_REACH` of a pocket (`pocketsOf`) is that pocket cut wider or
 * shifted, and is excused, whichever component it lies in. Partly
 * see-through pixels (a seam's speck) never count, nor do pixels the kept
 * crop holds as near its ground as its own ground's pixels lie (`reach`):
 * a speck of the sheet's paper the kept crop's figure closes round, which
 * the cut cleared as paper.
 */
const cutHolesOf = (c: Read, render: Raster) => {
  const { w, h } = c;
  const alpha = (i: number) => render.rgba[i * 4 + 3] ?? 0;
  const clear = Uint8Array.from({ length: w * h }, (_, i) => Number(alpha(i) < 128));
  const comps = componentsOf(clear, w, h, false);
  const sheetPaper = groundNear(c, c.r, c.reach);
  const pocket = grown(pocketsOf(c), w, h, POCKET_REACH);
  const counts = (i: number) =>
    alpha(i) === 0 && c.ground[i] === 0 && c.holes[i] === 0 && pocket[i] === 0 && !sheetPaper(i);
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    const comp = comps.components[comps.labels[i] ?? -1];
    if (comp === undefined || !counts(i)) continue;
    const [x0, y0, x1, y1] = comp.box;
    if (x0 === 0 || y0 === 0 || x1 === w || y1 === h) continue;
    n++;
  }
  return n;
};

/** A crop read into its ground, figure, ink and paper, the pixels `neighbour` holds as ground; none when it holds no figure. */
const readCrop = (r: Raster, neighbour: Uint8Array | undefined): Read | undefined => {
  const { width: w, height: h } = r;
  const n = w * h;
  const { lab, near, reach, like, ground } = groundOf(r);
  if (neighbour !== undefined) for (let i = 0; i < n; i++) if (neighbour[i] === 1) ground[i] = 1;
  const holes = new Uint8Array(n);
  const ink = new Uint8Array(n);
  const paper = new Uint8Array(n);
  const left = new Float64Array(h).fill(Number.NaN);
  const right = new Float64Array(h).fill(Number.NaN);
  let [top, bottom] = [-1, -1];
  for (let i = 0; i < n; i++) {
    if (ground[i] === 1) continue;
    if (like[i] === 1) holes[i] = 1;
    else if (lumaOf(rgbAt(r, i)) >= LINE_LUMA) paper[i] = 1;
    else {
      ink[i] = 1;
      const [x, y] = [i % w, Math.floor(i / w)];
      if (Number.isNaN(left[y] ?? Number.NaN)) left[y] = x;
      right[y] = x;
      if (top < 0) top = y;
      bottom = y;
    }
  }
  if (top < 0) return undefined;
  return { r, w, h, lab, near, reach, ground, holes, ink, paper, left, right, top, bottom };
};

/** A row: its value kept to hundredths and held to its bar. */
const rowOf = (
  name: string,
  band: FitBand,
  part: string,
  value: number,
  bar: FitBar,
  more: Pick<FitRow, 'concept' | 'render' | 'where'> = {},
): FitRow => {
  const v = kept(value);
  return { name, band, part, value: v, bar, pass: within(v, bar), ...more };
};

/** The rows of `band`, by the sheet's figure: the head's top 30%, the body the rest. */
const bandRows = (c: Read, band: 'head' | 'body'): readonly [number, number] => {
  const split = c.top + Math.ceil(HEAD_SHARE * (c.bottom - c.top + 1));
  return band === 'head' ? [c.top, split - 1] : [split, c.bottom];
};

/** The mean distance of the two crops' outer edges over the band's rows both hold the figure in. */
const edgeOf = (c: Read, r: Read, [y0, y1]: readonly [number, number]) => {
  let [sum, count] = [0, 0];
  for (let y = y0; y <= Math.min(y1, r.h - 1); y++) {
    const [cl, cr] = [c.left[y] ?? Number.NaN, c.right[y] ?? Number.NaN];
    const [rl, rr] = [r.left[y] ?? Number.NaN, r.right[y] ?? Number.NaN];
    if (Number.isNaN(cl) || Number.isNaN(rl)) continue;
    sum += Math.abs(cl - rl) + Math.abs(cr - rr);
    count += 2;
  }
  return count === 0 ? Math.max(c.w, r.w) : sum / count;
};

/** The second difference of an edge at row `y` over `TURN_SPAN` rows: NaN where a row of it holds no figure. */
const turnAt = (e: Float64Array, y: number) => {
  const [a, b, d] = [e[y - TURN_SPAN], e[y], e[y + TURN_SPAN]];
  if (a === undefined || b === undefined || d === undefined) return Number.NaN;
  return Math.abs(a - 2 * b + d);
};

/** The render's sharpest turn past the sheet's sharpest within `TURN_NEAR` rows, in the band, on either side. */
const turnsOf = (c: Read, r: Read, [y0, y1]: readonly [number, number]) => {
  let worst = { excess: 0, concept: 0, render: 0, where: 'none' };
  for (const side of ['left', 'right'] as const)
    for (let y = Math.max(y0, c.top + TURN_END); y <= Math.min(y1, c.bottom - TURN_END); y++) {
      const t = turnAt(r[side], y);
      if (Number.isNaN(t)) continue;
      let sheet = 0;
      for (let d = -TURN_NEAR; d <= TURN_NEAR; d++) {
        const s = turnAt(c[side], y + d);
        if (!Number.isNaN(s)) sheet = Math.max(sheet, s);
      }
      if (t - sheet > worst.excess)
        worst = { excess: t - sheet, concept: sheet, render: t, where: `${side} row ${y}` };
    }
  return worst;
};

/** How many pixels of `a` and of `b` overlap, over how many either holds. */
const iouOf = (a: Uint8Array, b: Uint8Array) => {
  let [both, either] = [0, 0];
  for (let i = 0; i < a.length; i++) {
    const [x, y] = [a[i] === 1, b[i] === 1];
    if (x && y) both++;
    if (x || y) either++;
  }
  return either === 0 ? 1 : both / either;
};

/** Where parabola `q` (rooted at `f[q]`) crosses parabola `p`. */
const crossing = (f: Float64Array, q: number, p: number) =>
  ((f[q] ?? 0) + q * q - ((f[p] ?? 0) + p * p)) / (2 * q - 2 * p);

/** One line's squared distances, `f` its samples: the lower envelope of the parabolas rooted at them (Felzenszwalb and Huttenlocher). */
const envelope = (f: Float64Array, n: number): Float64Array => {
  const out = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  let k = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = crossing(f, q, v[k] ?? 0);
    while (k > 0 && s <= (z[k] ?? 0)) {
      k--;
      s = crossing(f, q, v[k] ?? 0);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while ((z[k + 1] ?? Infinity) < q) k++;
    const p = v[k] ?? 0;
    out[q] = (q - p) ** 2 + (f[p] ?? 0);
  }
  return out;
};

/** Each pixel's distance to the nearest set pixel of `mask`, squared: a column's envelope, then a row's. */
const distancesTo = (mask: Uint8Array, w: number, h: number): Float64Array => {
  const FAR = (w + h) ** 2;
  const d = Float64Array.from(mask, (m) => (m === 1 ? 0 : FAR));
  const col = new Float64Array(h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) col[y] = d[y * w + x] ?? FAR;
    const o = envelope(col, h);
    for (let y = 0; y < h; y++) d[y * w + x] = o[y] ?? FAR;
  }
  const row = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) row[x] = d[y * w + x] ?? FAR;
    const o = envelope(row, w);
    for (let x = 0; x < w; x++) d[y * w + x] = o[x] ?? FAR;
  }
  return d;
};

/** The mean distance from the render's ink to the sheet's, pixels; `w + h` a pixel where the sheet has no ink at all. */
const inkEdgeOf = (c: Read, r: Read) => {
  const d = distancesTo(c.ink, c.w, c.h);
  let [sum, count] = [0, 0];
  for (let i = 0; i < r.ink.length; i++)
    if (r.ink[i] === 1) {
      sum += Math.sqrt(d[i] ?? 0);
      count++;
    }
  return count === 0 ? 0 : sum / count;
};

/** The paper pixels in thin strips (`thinStrips`), a sliver's. */
const sliversOf = (read: Read) => count(thinStrips(read.paper, read.w, read.h));

/** A pixel's class: the index of the class whose colour (`pick` of each) lies nearest it. */
const classifier = (
  read: Read,
  classes: Readonly<Record<string, FitClass>>,
  pick: (c: FitClass) => ReadonlyArray<string>,
): ((i: number) => number) => {
  const samples = Object.values(classes).flatMap((c, k) =>
    pick(c).map((hex) => ({
      k,
      rgb: [
        Number.parseInt(hex.slice(1, 3), 16),
        Number.parseInt(hex.slice(3, 5), 16),
        Number.parseInt(hex.slice(5, 7), 16),
      ] as const,
    })),
  );
  return (i) => {
    const [r, g, b] = rgbAt(read.r, i);
    let [best, bestD] = [-1, Infinity];
    for (const s of samples) {
      const dd = (r - s.rgb[0]) ** 2 + (g - s.rgb[1]) ** 2 + (b - s.rgb[2]) ** 2;
      if (dd < bestD) [best, bestD] = [s.k, dd];
    }
    return best;
  };
};

/** Each paper pixel's class (-1 off the paper). */
const classesOf = (read: Read, classOf: (i: number) => number): Int8Array => {
  const out = new Int8Array(read.w * read.h).fill(-1);
  for (let i = 0; i < out.length; i++) if (read.paper[i] === 1) out[i] = classOf(i);
  return out;
};

/** The class rows: each class's overlap, and its mean ΔE where both crops read it. */
const classRows = (
  c: Read,
  r: Read,
  classes: Readonly<Record<string, FitClass>>,
  kinds: readonly [Int8Array, Int8Array],
  bar: (name: keyof typeof FIT_BARS, band: FitBand, part: string) => FitBar,
): FitRow[] => {
  const [ck, rk] = kinds;
  const maskOf = (of: Int8Array, k: number) => Uint8Array.from(of, (v) => (v === k ? 1 : 0));
  return Object.keys(classes).flatMap((name, k) => {
    const [a, b] = [maskOf(ck, k), maskOf(rk, k)];
    const [ca, cb] = [count(a), count(b)];
    if (ca === 0 && cb === 0) return [];
    let [sum, n] = [0, 0];
    for (let i = 0; i < a.length; i++)
      if (a[i] === 1 && b[i] === 1) {
        sum += deltaE(labOf(rgbAt(c.r, i)), labOf(rgbAt(r.r, i)));
        n++;
      }
    // Where both crops hold a class but never in one place, its colours are not compared: ΔE 100, past any bar.
    return [
      rowOf('class.iou', 'figure', name, iouOf(a, b), bar('class.iou', 'figure', name), {
        concept: ca,
        render: cb,
      }),
      rowOf(
        'class.colour',
        'figure',
        name,
        n === 0 ? 100 : sum / n,
        bar('class.colour', 'figure', name),
      ),
    ];
  });
};

/** A crop's regions of each class, four ways: each pixel's region id (-1 for none) and each region as a label reads it, its box and centre in crop pixels. */
const regionsOf = (read: Read, kinds: Int8Array, names: ReadonlyArray<string>) => {
  const { w, h } = read;
  const label = new Int32Array(w * h).fill(-1);
  const regions: LabelRegion[] = [];
  names.forEach((name, k) => {
    const { components, labels } = componentsOf(
      Uint8Array.from(kinds, (v) => (v === k ? 1 : 0)),
      w,
      h,
      false,
    );
    const base = regions.length;
    const [sx, sy] = [new Float64Array(components.length), new Float64Array(components.length)];
    for (let i = 0; i < labels.length; i++) {
      const id = labels[i] ?? -1;
      if (id < 0) continue;
      label[i] = base + id;
      sx[id] = (sx[id] ?? 0) + (i % w);
      sy[id] = (sy[id] ?? 0) + Math.floor(i / w);
    }
    for (const c of components)
      regions.push({
        id: base + c.id,
        class: name,
        at: [(sx[c.id] ?? 0) / c.area, (sy[c.id] ?? 0) / c.area],
        box: c.box,
        size: c.area,
      });
  });
  return { label, regions };
};

/**
 * Why label `name` picks no region on a crop: the first label down its rules
 * that picks none while every label it names picks one (itself when its own
 * rules hold), with its classes the rows read no region of (no fit class).
 */
const unresolved = (
  table: LabelTable,
  picked: Readonly<Record<string, LabelRegion>>,
  names: ReadonlyArray<string>,
  name: string,
  seen: ReadonlySet<string> = new Set(),
): string => {
  const label = table[name];
  if (label === undefined) return `no label ${name}`;
  if (seen.has(name)) return `the label ${name} is made of itself`;
  const named = (label.where ?? []).map((w) => Object.values(w)[0] ?? '');
  const first = named.find((n) => picked[n] === undefined);
  if (first !== undefined) return unresolved(table, picked, names, first, new Set([...seen, name]));
  const unread = label.classes.filter((c) => !names.includes(c));
  return `${name} picks no region${unread.length > 0 ? ` (${unread.join(', ')}: no fit class)` : ''}`;
};

/** The pixels of `mask` with a pixel off it four ways (or the crop's edge) beside them. */
const edgeOfMask = (mask: Uint8Array, w: number, h: number) =>
  Uint8Array.from(mask, (m, i) => {
    if (m === 0) return 0;
    const [x, y] = [i % w, Math.floor(i / w)];
    const off = (nx: number, ny: number) =>
      nx < 0 || ny < 0 || nx >= w || ny >= h || mask[ny * w + nx] === 0;
    return off(x - 1, y) || off(x + 1, y) || off(x, y - 1) || off(x, y + 1) ? 1 : 0;
  });

/** The mean distance from each edge pixel of `a` to the nearest of `b`'s, pixels. */
const meanDistance = (a: Uint8Array, b: Uint8Array, w: number, h: number) => {
  const d = distancesTo(b, w, h);
  let [sum, n] = [0, 0];
  for (let i = 0; i < a.length; i++)
    if (a[i] === 1) {
      sum += Math.sqrt(d[i] ?? 0);
      n++;
    }
  return n === 0 ? w + h : sum / n;
};

/**
 * The part rows: for each label the view compares, the overlap of the region
 * it picks on each crop, and the mean distance between their edges, both
 * ways. A label that picks no region on a crop, itself or through a label its
 * rules name, has none to overlap (`part.iou` 0) and an edge as far as the
 * crop is wide and high, and its rows say why (`unresolved`).
 */
const partRows = (
  crops: readonly [Read, Read],
  kinds: readonly [Int8Array, Int8Array],
  names: ReadonlyArray<string>,
  table: LabelTable,
  bar: (name: keyof typeof FIT_BARS, band: FitBand, part: string) => FitBar,
): FitRow[] => {
  const compared = Object.keys(table).filter((name) => table[name]?.compared !== false);
  const [c] = crops;
  const { w, h } = c;
  const sides = crops.map((read, s) => {
    const { label, regions } = regionsOf(read, kinds[s] ?? new Int8Array(), names);
    const picks = labelRegions(
      regions,
      table,
      touchingIn({ label, w, h, origin: [0, 0] }, regions, PART_TOUCH),
    );
    const maskOf = (name: string) => {
      const id = picks.picked[name]?.id;
      return Uint8Array.from(label, (l) => (id !== undefined && l === id ? 1 : 0));
    };
    const why = (name: string) => unresolved(table, picks.picked, names, name);
    return { maskOf, why };
  });
  const [sheet, render] = sides;
  if (sheet === undefined || render === undefined) return [];
  return compared.flatMap((name) => {
    const [a, b] = [sheet.maskOf(name), render.maskOf(name)];
    const [ca, cb] = [count(a), count(b)];
    const where = [
      ...(ca === 0 ? [`unresolved on the sheet: ${sheet.why(name)}`] : []),
      ...(cb === 0 ? [`unresolved on the render: ${render.why(name)}`] : []),
    ].join('; ');
    const counts = { concept: ca, render: cb };
    const more: Pick<FitRow, 'concept' | 'render' | 'where'> =
      where === '' ? counts : { ...counts, where };
    const [ea, eb] = [edgeOfMask(a, w, h), edgeOfMask(b, w, h)];
    const edge =
      ca === 0 || cb === 0 ? w + h : (meanDistance(ea, eb, w, h) + meanDistance(eb, ea, w, h)) / 2;
    return [
      rowOf(
        'part.iou',
        'figure',
        name,
        ca === 0 || cb === 0 ? 0 : iouOf(a, b),
        bar('part.iou', 'figure', name),
        more,
      ),
      rowOf('part.edge', 'figure', name, edge, bar('part.edge', 'figure', name), more),
    ];
  });
};

/**
 * A probe's pixels read as classes, in runs: `G` the ground, `H` a hole, `K`
 * darker than its line's luma (`FitProbe.dark`), each other pixel by its
 * class's name, `P` with no classes.
 */
/** A run of one class along a probe, from and to, crop pixels. */
interface ProbeRun {
  cls: string;
  readonly from: number;
  to: number;
}

/** Pixel `i`'s class on a probe darker than `dark` is its line. */
const probeClass = (
  read: Read,
  i: number,
  dark: number,
  classOf: (i: number) => number,
  names: ReadonlyArray<string>,
) => {
  if (read.ground[i] === 1) return 'G';
  if (read.holes[i] === 1) return 'H';
  if (lumaOf(rgbAt(read.r, i)) < dark) return 'K';
  return names[classOf(i)] ?? 'P';
};

/** `runs` with each thinner than `PROBE_RUN` joined to the run before it (a first stays), and runs of one class joined. */
const joinedRuns = (runs: ReadonlyArray<ProbeRun>): ProbeRun[] => {
  const out: ProbeRun[] = [];
  for (const run of runs) {
    const last = out[out.length - 1];
    const thin = run.to - run.from + 1 < PROBE_RUN;
    if (last !== undefined && (thin || last.cls === run.cls)) last.to = run.to;
    else out.push({ ...run });
  }
  return out;
};

const probeRuns = (
  read: Read,
  p: FitProbe,
  classOf: (i: number) => number,
  names: ReadonlyArray<string>,
) => {
  const runs: ProbeRun[] = [];
  const [a, b] = [Math.min(p.from, p.to) - PROBE_REACH, Math.max(p.from, p.to) + PROBE_REACH];
  for (let t = a; t <= b; t++) {
    const [x, y] = p.along === 'row' ? [t, p.at] : [p.at, t];
    if (x < 0 || y < 0 || x >= read.w || y >= read.h) continue;
    const cls = probeClass(read, y * read.w + x, p.dark ?? PROBE_DARK, classOf, names);
    const last = runs[runs.length - 1];
    if (last !== undefined && last.cls === cls) last.to = t;
    else runs.push({ cls, from: t, to: t });
  }
  return joinedRuns(runs);
};

/** A change of class along a probe: `from>to` and where it lies. */
interface ProbeChange {
  readonly kind: string;
  readonly at: number;
}

/** The changes of class along a probe, in order: at the ground, a hole, the line and between two papers. */
const changesOf = (runs: ReadonlyArray<{ cls: string; from: number }>): ProbeChange[] =>
  runs.slice(1).map((run, k) => ({ kind: `${runs[k]?.cls ?? ''}>${run.cls}`, at: run.from }));

/** A step of an alignment: how many changes it leaves unmatched from there on, how far its pairs lie in all, and what it does (`LEAVE_A` leaves the sheet's change, `LEAVE_B` the render's, `PAIR` pairs them). */
type AlignStep = readonly [left: number, moved: number, does: number];

const [LEAVE_A, LEAVE_B, PAIR] = [0, 1, 2];

/** The step of least `left`, then least `moved`, the first of a tie. */
const leastStep = (x: AlignStep, y: AlignStep) =>
  y[0] < x[0] || (y[0] === x[0] && y[1] < x[1]) ? y : x;

/** The best step from change `i` of `a` and `j` of `b` on, by the steps after it; none at both ends. */
const stepFrom = (
  a: ReadonlyArray<ProbeChange>,
  b: ReadonlyArray<ProbeChange>,
  after: (i: number, j: number) => AlignStep,
  i: number,
  j: number,
): AlignStep | undefined => {
  const [ca, cb] = [a[i], b[j]];
  const steps: AlignStep[] = [];
  if (ca !== undefined) steps.push([after(i + 1, j)[0] + 1, after(i + 1, j)[1], LEAVE_A]);
  if (cb !== undefined) steps.push([after(i, j + 1)[0] + 1, after(i, j + 1)[1], LEAVE_B]);
  if (ca !== undefined && cb !== undefined && ca.kind === cb.kind) {
    const [l, d] = after(i + 1, j + 1);
    steps.push([l, d + Math.abs(ca.at - cb.at), PAIR]);
  }
  return steps.length === 0 ? undefined : steps.reduce(leastStep);
};

/** Every step of the alignment of `a` and `b`, from the ends back: the step taken from each pair of indices, by `at(i, j)`. */
const alignmentOf = (a: ReadonlyArray<ProbeChange>, b: ReadonlyArray<ProbeChange>) => {
  const [n, m] = [a.length, b.length];
  const at = (i: number, j: number) => i * (m + 1) + j;
  const steps = new Array<AlignStep>((n + 1) * (m + 1)).fill([0, 0, LEAVE_A]);
  const after = (i: number, j: number) => steps[at(i, j)] ?? [0, 0, LEAVE_A];
  for (let i = n; i >= 0; i--)
    for (let j = m; j >= 0; j--) {
      const s = stepFrom(a, b, after, i, j);
      if (s !== undefined) steps[at(i, j)] = s;
    }
  return { at, step: Uint8Array.from(steps, (s) => s[2]) };
};

/**
 * The sheet's changes `a` matched to the render's `b` one to one, in order
 * and of one kind: the most pairs, then the least distance between them in
 * all (an alignment, as an edit distance's). The largest distance of a pair
 * with a change `held` (within the probe's ends), and each held change of
 * either left with no match.
 */
const matchChanges = (
  a: ReadonlyArray<ProbeChange>,
  b: ReadonlyArray<ProbeChange>,
  held: (ch: ProbeChange) => boolean,
) => {
  const { at, step } = alignmentOf(a, b);
  const [n, m] = [a.length, b.length];
  let [i, j, farthest] = [0, 0, 0];
  const lost: string[] = [];
  while (i < n || j < m) {
    const [ca, cb, s] = [a[i], b[j], step[at(i, j)]];
    if (s === PAIR && ca !== undefined && cb !== undefined) {
      if (held(ca) || held(cb)) farthest = Math.max(farthest, Math.abs(ca.at - cb.at));
      [i, j] = [i + 1, j + 1];
    } else if (s === LEAVE_A && ca !== undefined) {
      if (held(ca)) lost.push(`the sheet's ${ca.kind} at ${ca.at} unmatched`);
      i++;
    } else {
      if (cb !== undefined && held(cb)) lost.push(`render adds ${cb.kind} at ${cb.at}`);
      j++;
    }
  }
  return { farthest, lost };
};

/** The class each place from `lo` to `hi` lies in, by the runs that cover it. */
const classesOver = (
  runs: ReadonlyArray<{ cls: string; from: number; to: number }>,
  lo: number,
  hi: number,
) =>
  Array.from(
    { length: hi - lo + 1 },
    (_, k) => runs.find((x) => x.from <= lo + k && x.to >= lo + k)?.cls,
  );

/**
 * The longest stretch from `lo` to `hi` where the sheet's runs and the
 * render's lie in other classes and neither changes class within it: a
 * stretch an edge of either crosses is that edge moved, which the matched
 * changes already measure, while one no edge crosses is paper the render
 * covers with another class (a stroke laid along the probe). An edge on the
 * probe's first place is not held by the matching (`probeRow`), so it
 * excuses no stretch here either.
 */
const longestDiffering = (
  cr: ReadonlyArray<{ cls: string; from: number; to: number }>,
  rr: ReadonlyArray<{ cls: string; from: number; to: number }>,
  lo: number,
  hi: number,
) => {
  const [cs, rs] = [classesOver(cr, lo, hi), classesOver(rr, lo, hi)];
  const edges = new Set(
    [...changesOf(cr), ...changesOf(rr)].map((ch) => ch.at).filter((at) => at > lo && at <= hi),
  );
  let [from, longest] = [-1, 0];
  for (let k = 0; k <= cs.length; k++) {
    const differs = k < cs.length && cs[k] !== rs[k];
    if (differs && from < 0) from = k;
    if (!differs && from >= 0) {
      const crossed = [...edges].some((at) => at >= lo + from && at <= lo + k);
      if (!crossed) longest = Math.max(longest, k - from);
      from = -1;
    }
  }
  return longest;
};

/**
 * A probe's row: the largest distance between a change on the sheet and the
 * same change on the render, matched in order (`matchChanges`), or the
 * longest stretch of the probe the two cover with other classes where that
 * is more (a stroke laid over the whole probe moves no change within it), or
 * the probe's length where a change on either has no match: the render draws
 * each of the sheet's edges along the probe where the sheet does, and none
 * it does not.
 */
const probeRow = (
  c: Read,
  r: Read,
  p: FitProbe,
  classOf: readonly [(i: number) => number, (i: number) => number],
  names: ReadonlyArray<string>,
  bar: FitBar,
): FitRow => {
  const cr = probeRuns(c, p, classOf[0], names);
  const rr = probeRuns(r, p, classOf[1], names);
  const [lo, hi] = [Math.min(p.from, p.to), Math.max(p.from, p.to)];
  const { farthest, lost } = matchChanges(
    changesOf(cr),
    changesOf(rr),
    (ch) => ch.at > lo && ch.at <= hi,
  );
  const length = hi - lo + 1;
  const said = (runs: ReadonlyArray<{ cls: string; from: number; to: number }>) =>
    runs.map((x) => `${x.cls}${x.from}-${x.to}`).join(' ');
  const unmatched = lost.length > 0 ? `; ${lost.join(', ')}` : '';
  return rowOf(
    `probe.${p.name}`,
    'figure',
    'figure',
    lost.length > 0 ? length : Math.max(farthest, longestDiffering(cr, rr, lo, hi)),
    bar,
    {
      where: `${p.along} ${p.at} ${p.from}-${p.to}: sheet ${said(cr)} | render ${said(rr)}${unmatched}`,
    },
  );
};

/**
 * The fit rows of `render` against `concept`, two crops of one kept box:
 * every row `FIT_BARS` names, per band where it has bands, the class rows
 * with `spec.classes` and a row per probe in `spec.probes`, each held to
 * its bar (`spec.bars` before `FIT_BARS`). None when either crop reads no
 * figure.
 */
export const fitRows = (
  concept: Raster,
  render: Raster,
  spec: FitSpec = {},
): ReadonlyArray<FitRow> => {
  const c = readCrop(concept, spec.neighbour);
  const r = readCrop(render, spec.neighbour);
  if (c === undefined || r === undefined || c.w !== r.w || c.h !== r.h) return [];
  const bar = (name: keyof typeof FIT_BARS, band: FitBand = 'figure', part = 'figure') =>
    barOf(spec, name, band, part);
  const rows: FitRow[] = [];
  for (const band of ['head', 'body'] as const) {
    const ys = bandRows(c, band);
    rows.push(
      rowOf('silhouette.edge', band, 'figure', edgeOf(c, r, ys), bar('silhouette.edge', band)),
    );
    const t = turnsOf(c, r, ys);
    rows.push(
      rowOf('outline.turns', band, 'figure', t.excess, bar('outline.turns', band), {
        concept: t.concept,
        render: t.render,
        where: t.where,
      }),
    );
  }
  const figure = (read: Read) => Uint8Array.from(read.ground, (g) => 1 - g);
  rows.push(
    rowOf('silhouette.iou', 'figure', 'figure', iouOf(figure(c), figure(r)), bar('silhouette.iou')),
  );
  rows.push(rowOf('ink.edge', 'figure', 'figure', inkEdgeOf(c, r), bar('ink.edge')));
  // A cut-out render (some pixel see-through) has its partly see-through
  // edge left out of its paper for the sliver and class rows: an
  // antialiased cut edge mixed with the ground is neither a sliver nor a
  // class's paper. The silhouette, holes, part and probe rows read it whole.
  const cut = render.rgba.some((v, k) => k % 4 === 3 && v < 255);
  const edge = (i: number) => {
    const a = render.rgba[i * 4 + 3] ?? 0;
    return a > 0 && a < 255;
  };
  const rc: Read = cut
    ? { ...r, paper: Uint8Array.from(r.paper, (p, i) => (p === 1 && !edge(i) ? 1 : 0)) }
    : r;
  // A cut keeps a pixel or so of the sheet past the line: the sheet's own
  // ground, opaque. The kept crop reads it as ground; over the measuring
  // ground it reads as paper. So a cut-out render's strips, found on its
  // whole paper, leave uncounted the pixels as near the kept crop's ground
  // as its ground-like ones. Taking them out before the strips are found
  // would cut a light cloth near that colour into new strips.
  const sheetGround = groundNear(c, render, c.near);
  const rs = count(
    thinStrips(rc.paper, rc.w, rc.h).map((s, i) => (s === 1 && !(cut && sheetGround(i)) ? 1 : 0)),
  );
  const cs = sliversOf(c);
  rows.push(
    rowOf('slivers', 'figure', 'figure', Math.max(0, rs - cs), bar('slivers'), {
      concept: cs,
      render: rs,
    }),
  );
  // A cut-out's holes are counted where they lie (`cutHolesOf`), so the
  // kept crop's own holes elsewhere do not absorb them; a drawn render's
  // holes are the ground its figure closes round beyond the sheet's.
  const [ch, rh] = [count(c.holes), cut ? cutHolesOf(c, render) : count(r.holes)];
  rows.push(
    rowOf('holes', 'figure', 'figure', cut ? rh : Math.max(0, rh - ch), bar('holes'), {
      concept: ch,
      render: rh,
    }),
  );
  const classes = spec.classes ?? {};
  const classOf: readonly [(i: number) => number, (i: number) => number] = [
    classifier(c, classes, (k) => k.sheet),
    classifier(r, classes, (k) => k.paper),
  ];
  const kinds = [classesOf(c, classOf[0]), classesOf(r, classOf[1])] as const;
  rows.push(...classRows(c, rc, classes, cut ? [kinds[0], classesOf(rc, classOf[1])] : kinds, bar));
  const names = Object.keys(classes);
  rows.push(...partRows([c, r], kinds, names, spec.labels ?? {}, bar));
  for (const p of spec.probes ?? [])
    rows.push(probeRow(c, r, p, classOf, names, p.bar ?? bar('probe')));
  return rows;
};
