// A part sheet: a kept view cut into named parts made of the view's own
// pixels, front to back (`cutParts`), so that a part can move while every
// pixel at rest stays the view's. A cut lists its parts front to back, each
// by the rules that take a pixel (`take`) and the rules that leave it to a
// part behind (`unless`): a polygon (a pixel whose centre lies inside it,
// even-odd), a disc (a pixel whose centre lies within its radius) or a label
// (a pixel of the region that part label picks on this view, `core/label.ts`
// over the tracer's colour regions, `core/trace.ts`). Each figure pixel
// belongs to the first part that takes it; a figure pixel no part takes
// refuses the cut. The figure is what the fit rows read (`core/fit-rows.ts`):
// what the view's border does not reach through ground-like pixels, less the
// paper its ink encloses (a ground-coloured piece wide both ways, between a
// figure's feet). A part holds the view's bytes where it owns a pixel and
// nothing elsewhere, until paint is laid under a part in front of it
// (`paintHidden`), where only motion shows it. `recompose` lays the parts back
// to front, each held pixel replacing what lies under it, so the sheet gives
// its view back byte for byte. Pure.

import { Array as Arr, Option, Result, Schema } from 'effect';
import { type Rgb, componentsOf, deltaE, labOf, rgbAt } from './cast-sheet-pixels.ts';
import { figureOf } from './fit-rows.ts';
import type { LabelTable } from './label.ts';
import type { Raster } from './raster.ts';
import { labelMasks } from './trace.ts';

/** A point of the view, pixels: (0, 0) is the top-left pixel's top-left corner. */
type PartPt = readonly [x: number, y: number];

/** What takes a pixel: a polygon, a disc, or a part label's region on the view. */
export type PartRule =
  | { readonly polygon: ReadonlyArray<PartPt> }
  | { readonly disc: { readonly c: PartPt; readonly r: number } }
  | { readonly label: string };

/** One part of a cut: its name, the rules that take a pixel for it, those that leave a pixel to the parts behind it, and the joint it turns about, where it has one. */
interface PartCutEntry {
  readonly name: string;
  readonly take: ReadonlyArray<PartRule>;
  readonly unless?: ReadonlyArray<PartRule>;
  readonly pivot?: PartPt;
}

/** A cut: a view's parts, front to back. */
export interface PartCut {
  readonly parts: ReadonlyArray<PartCutEntry>;
}

/** What a cut reads beside the view: the figure (1 on its pixels; the fit rows' reading less enclosed paper unless given), and the member's colour classes and part labels its label rules pick by. */
export interface PartCutOptions {
  readonly figure?: Uint8Array;
  readonly classes?: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly labels?: LabelTable;
}

/** A part as pixels: the view's bytes where it owns a pixel, its paint where a part in front hides it, alpha 0 elsewhere; how many pixels it owns, and how many are painted. */
interface PartLayer {
  readonly name: string;
  readonly pixels: Raster;
  readonly kept: number;
  readonly painted: number;
}

/** A view's parts, front to back, and each pixel's owner (0 the ground, k + 1 the part at k). */
interface PartSheet {
  readonly width: number;
  readonly height: number;
  readonly parts: ReadonlyArray<PartLayer>;
  readonly owner: Uint8Array;
}

/** A cut the view cannot be cut by: a figure pixel no part takes, a label that picks no region, a figure of another size, two parts of one name, more parts than the owner map holds. */
class PartCutRefused extends Schema.TaggedError<PartCutRefused>()('PartCutRefused', {
  reason: Schema.String,
}) {
  override get message() {
    return `the view cannot be cut: ${this.reason}`;
  }
}

/** Paint that would show at rest (a pixel no part in front of the part owns), or paint for a part the sheet does not hold. */
class PartPaintRefused extends Schema.TaggedError<PartPaintRefused>()('PartPaintRefused', {
  reason: Schema.String,
}) {
  override get message() {
    return `the paint cannot be laid: ${this.reason}`;
  }
}

/** The most parts a sheet holds: its owner map is one byte a pixel, 0 for the ground. */
const MOST_PARTS = 254;

/** How near the ground colour enclosed paper is, ΔE76: the border's paper and its grain, not a garment's pale cream. */
const PAPER_DE = 3;

/** The least piece of enclosed paper, pixels, and the least it spans both ways: thinner pale runs are the light rim a sheet paints just inside its line. */
const PAPER_LEAST = 24;
const PAPER_ACROSS = 8;

/**
 * The view's figure: what the fit rows read, less each of its holes that
 * holds a piece of the ground's own colour wide both ways (the paper between
 * the feet, with its grain and its rim). A hole of a garment's pale cream (a
 * knot's highlight) holds none, and stays the figure's.
 */
export const cutFigureOf = (view: Raster): Uint8Array => {
  const { width: w, height: h } = view;
  const { figure, holes, ground } = figureOf(view);
  const paperLike = Uint8Array.from(holes, (m, i) =>
    Number(m === 1 && deltaE(labOf(rgbAt(view, i)), ground) < PAPER_DE),
  );
  const cores = componentsOf(paperLike, w, h, false);
  const wide = new Set(
    cores.components
      .filter(
        (c) =>
          c.area >= PAPER_LEAST &&
          c.box[2] - c.box[0] >= PAPER_ACROSS &&
          c.box[3] - c.box[1] >= PAPER_ACROSS,
      )
      .map((c) => c.id),
  );
  const pieces = componentsOf(holes, w, h, false);
  const paper = new Set<number>();
  for (let i = 0; i < holes.length; i++)
    if (wide.has(cores.labels[i] ?? -1)) paper.add(pieces.labels[i] ?? -1);
  return Uint8Array.from(figure, (f, i) => Number(f === 1 && !paper.has(pieces.labels[i] ?? -1)));
};

/** Whether point (`x`, `y`) lies inside `poly`, even-odd. */
const insidePolygon = (poly: ReadonlyArray<PartPt>, x: number, y: number): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i] ?? [0, 0];
    const [xj, yj] = poly[j] ?? [0, 0];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** A rule as a test of pixel `i`'s centre; a label rule reads its label's mask. */
type Holds = (x: number, y: number, i: number) => boolean;

const holdsOf = (rule: PartRule, masks: Readonly<Record<string, Uint8Array>>): Holds => {
  if ('polygon' in rule) {
    const xs = rule.polygon.map((p) => p[0]);
    const ys = rule.polygon.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    return (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && insidePolygon(rule.polygon, x, y);
  }
  if ('disc' in rule) {
    const { c, r } = rule.disc;
    return (x, y) => Math.hypot(x - c[0], y - c[1]) <= r;
  }
  const mask = masks[rule.label];
  return (_x, _y, i) => mask?.[i] === 1;
};

/** The labels a cut's rules name. */
const labelsNamed = (cut: PartCut): ReadonlyArray<string> =>
  Arr.dedupe(
    cut.parts
      .flatMap((p) => [...p.take, ...(p.unless ?? [])])
      .filter((r): r is { readonly label: string } => 'label' in r)
      .map((r) => r.label),
  );

/** The label rules' masks on the view, or why a label cannot be read. */
const masksFor = (
  view: Raster,
  cut: PartCut,
  options: PartCutOptions,
): Result.Result<Readonly<Record<string, Uint8Array>>, string> => {
  const named = labelsNamed(cut);
  if (named.length === 0) return Result.succeed({});
  return Option.match(
    Option.all([Option.fromUndefinedOr(options.classes), Option.fromUndefinedOr(options.labels)]),
    {
      onNone: () =>
        Result.fail(`label rules (${named.join(', ')}) need the member's classes and labels`),
      onSome: ([classes, labels]) => {
        const { masks, refused } = labelMasks(view, classes, labels);
        const missing = named.filter((n) => !(n in masks));
        if (missing.length === 0) return Result.succeed(masks);
        const why = refused.length > 0 && ` (${refused.join('; ')})`;
        return Result.fail(
          `${missing.map((n) => `the label ${n} picks no region`).join(', ')}${why || ''}`,
        );
      },
    },
  );
};

/** Why a cut's own build refuses it, before any pixel is read: too many parts, a name twice, a figure of another size. */
const cutRefusal = (view: Raster, cut: PartCut, options: PartCutOptions): Option.Option<string> => {
  const n = view.width * view.height;
  const twice = cut.parts.find((p, k) => cut.parts.findIndex((q) => q.name === p.name) !== k);
  const figure = options.figure ?? new Uint8Array(n);
  return Option.firstSomeOf([
    Option.liftPredicate(
      `${cut.parts.length} parts, more than ${MOST_PARTS}`,
      () => cut.parts.length > MOST_PARTS,
    ),
    Option.map(Option.fromUndefinedOr(twice), (p) => `two parts are named ${p.name}`),
    Option.liftPredicate(
      `the figure holds ${figure.length} pixels, the view ${n}`,
      () => figure.length !== n,
    ),
  ]);
};

/** Each pixel's owner: 0 for the ground, k + 1 for the first part (front to back) whose `take` holds the pixel's centre and whose `unless` does not; with the figure pixels no part takes. */
const ownersOf = (
  view: Raster,
  cut: PartCut,
  figure: Uint8Array,
  masks: Readonly<Record<string, Uint8Array>>,
) => {
  const parts = cut.parts.map((p) => ({
    take: p.take.map((r) => holdsOf(r, masks)),
    unless: (p.unless ?? []).map((r) => holdsOf(r, masks)),
  }));
  const owner = new Uint8Array(view.width * view.height);
  let [untaken, first] = [0, -1];
  for (let i = 0; i < owner.length; i++) {
    if (figure[i] !== 1) continue;
    const [x, y] = [(i % view.width) + 0.5, Math.floor(i / view.width) + 0.5];
    const k = parts.findIndex(
      (p) => p.take.some((t) => t(x, y, i)) && !p.unless.some((u) => u(x, y, i)),
    );
    if (k >= 0) owner[i] = k + 1;
    else if (untaken++ === 0) first = i;
  }
  return { owner, untaken, first };
};

/**
 * `view` cut by `cut` into a part sheet: each figure pixel owned by the first
 * part that takes it, each part holding the view's bytes where it owns a
 * pixel and alpha 0 elsewhere. Refused, saying why, where a figure pixel is
 * left untaken (how many, and the first), a label rule's label picks no
 * region, or the cut itself is wrong (`cutRefusal`).
 */
export const cutParts = (
  view: Raster,
  cut: PartCut,
  options: PartCutOptions = {},
): Result.Result<PartSheet, PartCutRefused> => {
  const refuse = (reason: string) => Result.fail(PartCutRefused.make({ reason }));
  const wrong = cutRefusal(view, cut, options);
  if (Option.isSome(wrong)) return refuse(wrong.value);
  const masks = masksFor(view, cut, options);
  if (Result.isFailure(masks)) return refuse(masks.failure);
  const figure = options.figure ?? cutFigureOf(view);
  const { owner, untaken, first } = ownersOf(view, cut, figure, masks.success);
  if (untaken > 0)
    return refuse(
      `${untaken} figure pixels no part takes, the first at (${first % view.width}, ${Math.floor(first / view.width)})`,
    );
  const parts = cut.parts.map((p, k): PartLayer => {
    const rgba = new Uint8Array(view.rgba.length);
    let kept = 0;
    for (let i = 0; i < owner.length; i++)
      if (owner[i] === k + 1) {
        rgba.set(view.rgba.subarray(i * 4, i * 4 + 4), i * 4);
        kept++;
      }
    return {
      name: p.name,
      pixels: { width: view.width, height: view.height, rgba },
      kept,
      painted: 0,
    };
  });
  return Result.succeed({ width: view.width, height: view.height, parts, owner });
};

/** The sheet's parts laid back to front over `ground` (transparent unless given), each pixel a part holds (alpha above 0) replacing what lies under it. */
export const recompose = (sheet: PartSheet, ground?: Raster): Raster => {
  const rgba = Uint8Array.from(ground?.rgba ?? new Uint8Array(sheet.width * sheet.height * 4));
  for (let k = sheet.parts.length - 1; k >= 0; k--) {
    const px = sheet.parts[k]?.pixels.rgba ?? new Uint8Array(0);
    for (let i = 3; i < px.length; i += 4)
      if ((px[i] ?? 0) > 0) rgba.set(px.subarray(i - 3, i + 1), i - 3);
  }
  return { width: sheet.width, height: sheet.height, rgba };
};

/**
 * `sheet` with `paint`'s bytes laid into part `part` at each pixel `where`
 * marks (1), each one a pixel a part in front of `part` owns and is opaque on,
 * so that paint never shows at rest. Refused, laying nothing, where any marked
 * pixel is not (the ground, the part's own, a part behind it, a front part's
 * pixel of alpha below 255), for a part the sheet does not hold, or for paint
 * or a mask of another size.
 */
export const paintHidden = (
  sheet: PartSheet,
  part: string,
  paint: Raster,
  where: Uint8Array,
): Result.Result<PartSheet, PartPaintRefused> => {
  const refuse = (reason: string) => Result.fail(PartPaintRefused.make({ reason }));
  const k = sheet.parts.findIndex((p) => p.name === part);
  if (k < 0) return refuse(`the sheet holds no part ${part}`);
  const n = sheet.width * sheet.height;
  if (paint.width !== sheet.width || paint.height !== sheet.height || where.length !== n)
    return refuse(`the paint or its mask is not the sheet's size, ${sheet.width}×${sheet.height}`);
  // a part in front of the part at k is one listed before it: owner 1 to k
  const inFront = (i: number) => (sheet.owner[i] ?? 0) >= 1 && (sheet.owner[i] ?? 0) <= k;
  const at = (i: number) => `(${i % sheet.width}, ${Math.floor(i / sheet.width)})`;
  const unowned = where.findIndex((m, i) => m === 1 && !inFront(i));
  if (unowned >= 0)
    return refuse(
      `paint at ${at(unowned)} would show at rest: no part in front of ${part} owns it`,
    );
  // recompose lets a pixel through where its owner is not opaque, so only an opaque owner hides paint
  const seen = where.findIndex(
    (m, i) =>
      m === 1 && (sheet.parts[(sheet.owner[i] ?? 1) - 1]?.pixels.rgba[i * 4 + 3] ?? 0) < 255,
  );
  if (seen >= 0)
    return refuse(
      `paint at ${at(seen)} would show at rest: ${sheet.parts[(sheet.owner[seen] ?? 1) - 1]?.name ?? 'the part in front'}, in front of ${part}, is not opaque there`,
    );
  const parts = sheet.parts.map((p, j): PartLayer => {
    if (j !== k) return p;
    const rgba = Uint8Array.from(p.pixels.rgba);
    for (let i = 0; i < n; i++)
      if (where[i] === 1) rgba.set(paint.rgba.subarray(i * 4, i * 4 + 4), i * 4);
    let painted = 0;
    for (let i = 0; i < n; i++)
      if (sheet.owner[i] !== k + 1 && (rgba[i * 4 + 3] ?? 0) > 0) painted++;
    return { ...p, pixels: { ...p.pixels, rgba }, painted };
  });
  return Result.succeed({ ...sheet, parts });
};

/** The L* under which a pixel is ink, as the cast checks read it. */
const INK_L = 40;
/** The L* where an antialiased edge reaches its paint's side: from INK_L up to it a pixel's ink share falls to none. */
const INK_EDGE_L = 60;

/** The median Lab, channel by channel, of the ink pixels (L* under 40) among those `at` picks; none when it picks no ink. */
export const inkOf = (r: Raster, at: (i: number) => boolean): Option.Option<Rgb> => {
  const inks: Rgb[] = [];
  for (let i = 0; i < r.width * r.height; i++) {
    if (!at(i)) continue;
    const lab = labOf(rgbAt(r, i));
    if (lab[0] < INK_L) inks.push(lab);
  }
  if (inks.length === 0) return Option.none();
  const median = (c: 0 | 1 | 2) =>
    inks.map((lab) => lab[c]).sort((x, y) => x - y)[inks.length >> 1] ?? 0;
  return Option.some([median(0), median(1), median(2)] as const);
};

/** The sRGB bytes of a Lab colour (D65), `labOf`'s inverse, each channel held to 0-255. */
const rgbOfLab = (lab: Rgb): Rgb => {
  const fy = (lab[0] + 16) / 116;
  const inv = (t: number) => {
    if (t ** 3 > 216 / 24389) return t ** 3;
    return (116 * t - 16) / (24389 / 27);
  };
  const [X, Y, Z] = [0.95047 * inv(fy + lab[1] / 500), inv(fy), 1.08883 * inv(fy - lab[2] / 200)];
  const gamma = (v: number) => {
    const byte = (s: number) => Math.max(0, Math.min(255, Math.round(s * 255)));
    if (v <= 0.0031308) return byte(12.92 * v);
    return byte(1.055 * v ** (1 / 2.4) - 0.055);
  };
  return [
    gamma(3.2406 * X - 1.5372 * Y - 0.4986 * Z),
    gamma(-0.9689 * X + 1.8758 * Y + 0.0415 * Z),
    gamma(0.0557 * X - 0.204 * Y + 1.057 * Z),
  ];
};

/** Each pixel that is a visible ink pixel (alpha above 0, L* under 40) or touches one, the eight around it. */
const nearInk = (key: Raster, ls: Float64Array): Uint8Array => {
  const { width: w, height: h } = key;
  const near = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if ((key.rgba[i * 4 + 3] ?? 0) === 0 || (ls[i] ?? INK_L) >= INK_L) continue;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++)
        for (let xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx++) near[yy * w + xx] = 1;
    }
  return near;
};

/**
 * A drawn key with its ink moved to `ink` (a Lab colour, the kept view's own
 * ink, `inkOf`), every ink edge where it was. Lightness: each pixel that is
 * ink or touches ink (any alpha) takes L* 40 + s (L* - 40), s the ratio of
 * `ink`'s and the key's ink median's depths under 40, so the key's ink median
 * lands on `ink`'s L* and every L* 40 crossing a bilinear read finds (any
 * read whose 2x2 cell holds ink) stays where it was: the ink's width does not
 * change at any sub-pixel step. Colour: each ink pixel's a* and b* move by
 * the key's ink median's distance to `ink`, and each pixel up to L* 60 by
 * that share of it falling to none at 60. A pixel neither ink nor beside ink
 * is not touched; no alpha changes; a pixel whose bytes would round across
 * L* 40 keeps its own colour, so the ink is the same pixels before and after.
 * A key with no ink comes back as it was.
 */
export const inkTo = (key: Raster, ink: Rgb): Raster => {
  const own = inkOf(key, (i) => key.rgba[i * 4 + 3] === 255);
  if (Option.isNone(own)) return key;
  const s = Math.max(0, INK_L - ink[0]) / (INK_L - own.value[0]);
  const d = [ink[1] - own.value[1], ink[2] - own.value[2]] as const;
  const n = key.width * key.height;
  const labs = Array.from({ length: n }, (_, i) => labOf(rgbAt(key, i)));
  const near = nearInk(
    key,
    Float64Array.from(labs, (lab) => lab[0]),
  );
  const rgba = Uint8Array.from(key.rgba);
  for (let i = 0; i < n; i++) {
    if (near[i] === 0) continue;
    const lab = labs[i] ?? ([100, 0, 0] as const);
    const share = Math.max(0, Math.min(1, (INK_EDGE_L - lab[0]) / (INK_EDGE_L - INK_L)));
    const rgb = rgbOfLab([
      INK_L + s * (lab[0] - INK_L),
      lab[1] + share * d[0],
      lab[2] + share * d[1],
    ]);
    if (labOf(rgb)[0] < INK_L !== lab[0] < INK_L) continue;
    rgba.set(rgb, i * 4);
  }
  return { ...key, rgba };
};
