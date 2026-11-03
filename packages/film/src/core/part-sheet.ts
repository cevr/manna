import { Array as Arr, Option, Result, Schema } from 'effect';
import { type Box, type Rgb, componentsOf, deltaE, labOf, rgbAt } from './cast-sheet-pixels.ts';
import { figureOf } from './fit-rows.ts';
import type { LabelTable } from './label.ts';
import type { Raster } from './raster.ts';
import { labelMasks } from './trace.ts';

type PartPt = readonly [x: number, y: number];

export type PartRule =
  | { readonly polygon: ReadonlyArray<PartPt> }
  | { readonly disc: { readonly c: PartPt; readonly r: number } }
  | { readonly label: string };

interface PartCutEntry {
  readonly name: string;
  readonly take: ReadonlyArray<PartRule>;
  readonly unless?: ReadonlyArray<PartRule>;
  readonly pivot?: PartPt;
  readonly role?: 'shadow';
}

export interface PartCut {
  readonly parts: ReadonlyArray<PartCutEntry>;
}

export interface PartCutOptions {
  readonly figure?: Uint8Array;
  readonly classes?: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly labels?: LabelTable;
}

export interface PartLayer {
  readonly name: string;
  readonly pixels: Raster;
  readonly kept: number;
  readonly painted: number;
}

export interface PartSheet {
  readonly width: number;
  readonly height: number;
  readonly parts: ReadonlyArray<PartLayer>;
  readonly owner: Uint8Array;
}

export type SheetClean = (sheet: PartSheet) => Result.Result<PartSheet, SheetCleanRefused>;

export class SheetCleanRefused extends Schema.TaggedError<SheetCleanRefused>()(
  'SheetCleanRefused',
  { reason: Schema.String },
) {
  override get message() {
    return `the view's rule cannot run: ${this.reason}`;
  }
}

export const countedOf = (sheet: PartSheet): PartSheet => ({
  ...sheet,
  parts: sheet.parts.map((p, k) => {
    let kept = 0;
    let painted = 0;
    for (let i = 0; i < sheet.owner.length; i++) {
      if (sheet.owner[i] === k + 1) kept++;
      else if ((p.pixels.rgba[i * 4 + 3] ?? 0) > 0) painted++;
    }
    return { ...p, kept, painted };
  }),
});

class PartCutRefused extends Schema.TaggedError<PartCutRefused>()('PartCutRefused', {
  reason: Schema.String,
}) {
  override get message() {
    return `the view cannot be cut: ${this.reason}`;
  }
}

class PartPaintRefused extends Schema.TaggedError<PartPaintRefused>()('PartPaintRefused', {
  reason: Schema.String,
}) {
  override get message() {
    return `the paint cannot be laid: ${this.reason}`;
  }
}

const MOST_PARTS = 254;

const PAPER_DE = 3;

const PAPER_LEAST = 24;
const PAPER_ACROSS = 8;

interface PaperPiece {
  readonly box: Box;
  readonly area: number;
  readonly gaps: ReadonlyArray<PartPt>;
  readonly pixels: ReadonlyArray<number>;
}

interface PaperRead {
  readonly figure: Uint8Array;
  readonly pieces: ReadonlyArray<PaperPiece>;
}

export const enclosedPaperOf = (view: Raster, gaps: ReadonlyArray<PartPt> = []): PaperRead => {
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
  const all = componentsOf(holes, w, h, false);
  const paper = new Set<number>();
  for (let i = 0; i < holes.length; i++)
    if (wide.has(cores.labels[i] ?? -1)) paper.add(all.labels[i] ?? -1);
  const pieceAt = ([x, y]: PartPt): number =>
    Option.liftPredicate(y * w + x, () => x >= 0 && y >= 0 && x < w && y < h).pipe(
      Option.flatMap((i) => Option.fromUndefinedOr(all.labels[i])),
      Option.getOrElse(() => -1),
    );
  const open = new Set(gaps.map(pieceAt).filter((id) => paper.has(id)));
  const pixels = new Map([...paper].map((id) => [id, new Array<number>()] as const));
  for (let i = 0; i < holes.length; i++) pixels.get(all.labels[i] ?? -1)?.push(i);
  return {
    figure: Uint8Array.from(figure, (f, i) => Number(f === 1 && !open.has(all.labels[i] ?? -1))),
    pieces: [...paper]
      .toSorted((a, b) => a - b)
      .flatMap((id) =>
        Option.match(Option.fromUndefinedOr(all.components[id]), {
          onNone: () => [],
          onSome: (c) => [
            {
              box: c.box,
              area: c.area,
              gaps: gaps.filter((g) => pieceAt(g) === id),
              pixels: pixels.get(id) ?? [],
            },
          ],
        }),
      ),
  };
};

export const cutFigureOf = (view: Raster, gaps: ReadonlyArray<PartPt> = []): Uint8Array =>
  enclosedPaperOf(view, gaps).figure;

const insidePolygon = (poly: ReadonlyArray<PartPt>, x: number, y: number): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i] ?? [0, 0];
    const [xj, yj] = poly[j] ?? [0, 0];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

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

const labelsNamed = (cut: PartCut): ReadonlyArray<string> =>
  Arr.dedupe(
    cut.parts
      .flatMap((p) => [...p.take, ...(p.unless ?? [])])
      .filter((r): r is { readonly label: string } => 'label' in r)
      .map((r) => r.label),
  );

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

export const recompose = (sheet: PartSheet, ground?: Raster): Raster => {
  const rgba = Uint8Array.from(ground?.rgba ?? new Uint8Array(sheet.width * sheet.height * 4));
  for (let k = sheet.parts.length - 1; k >= 0; k--) {
    const px = sheet.parts[k]?.pixels.rgba ?? new Uint8Array(0);
    for (let i = 3; i < px.length; i += 4)
      if ((px[i] ?? 0) > 0) rgba.set(px.subarray(i - 3, i + 1), i - 3);
  }
  return { width: sheet.width, height: sheet.height, rgba };
};

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
  const inFront = (i: number) => (sheet.owner[i] ?? 0) >= 1 && (sheet.owner[i] ?? 0) <= k;
  const at = (i: number) => `(${i % sheet.width}, ${Math.floor(i / sheet.width)})`;
  const unowned = where.findIndex((m, i) => m === 1 && !inFront(i));
  if (unowned >= 0)
    return refuse(
      `paint at ${at(unowned)} would show at rest: no part in front of ${part} owns it`,
    );
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

const INK_L = 40;
const INK_EDGE_L = 60;

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

export const rgbOfLab = (lab: Rgb): Rgb => {
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
