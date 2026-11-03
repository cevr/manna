import { Option } from 'effect';
import {
  type Rgb,
  componentsOf,
  deltaE,
  labOf,
  labsOf,
  lumaOf,
  rgbAt,
} from './cast-sheet-pixels.ts';
import { type LabelRegion, type LabelTable, labelRegions, touchingIn } from './label.ts';
import type { Raster } from './raster.ts';

const LINE_LUMA = 90;

const PART_IOU = 0.7;
const PART_EDGE = 3;

const PART_TOUCH = 12;

export interface FitBar {
  readonly min?: number;
  readonly max?: number;
}

type FitBand = 'figure' | 'head' | 'body';

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

export type FitBarName =
  | keyof typeof FIT_BARS
  | `${'silhouette.edge' | 'outline.turns'}/${'head' | 'body'}`
  | `${'class.iou' | 'class.colour' | 'part.iou' | 'part.edge'}/${string}`;

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

export interface FitClass {
  readonly sheet: ReadonlyArray<string>;
  readonly paper: ReadonlyArray<string>;
}

export interface FitProbe {
  readonly name: string;
  readonly along: 'row' | 'col';
  readonly at: number;
  readonly from: number;
  readonly to: number;
  readonly dark?: number;
  readonly bar?: FitBar;
}

export interface FitSpec {
  readonly classes?: Readonly<Record<string, FitClass>>;
  readonly labels?: LabelTable;
  readonly probes?: ReadonlyArray<FitProbe>;
  readonly bars?: Readonly<Partial<Record<FitBarName, FitBar>>>;
  readonly neighbour?: Uint8Array;
}

const GROUND_DE = 3;
const GROUND_SPREAD = 1.5;

const BORDER_GROUND = 15;

const SPECK = 24;

const HEAD_SHARE = 0.3;

const TURN_SPAN = 3;

const TURN_NEAR = 3;

const TURN_END = 6;

const SLIVER_THICK = 2;

const SLIVER_LONG = 6;

const PROBE_DARK = 60;

const PROBE_REACH = 8;

const PROBE_RUN = 2;

const kept = (v: number) => Math.round(v * 100) / 100;

const maskWhere = (n: number, on: (i: number) => boolean): Uint8Array => {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (on(i)) out[i] = 1;
  return out;
};

const within = (v: number, bar: FitBar) =>
  (bar.min === undefined || v >= bar.min) && (bar.max === undefined || v <= bar.max);

export const fitPasses = (rows: ReadonlyArray<FitRow>): boolean =>
  rows.length > 0 && rows.every((r) => r.pass);

interface Read {
  readonly r: Raster;
  readonly w: number;
  readonly h: number;
  readonly lab: Rgb;
  readonly near: number;
  readonly reach: number;
  readonly ground: Uint8Array;
  readonly holes: Uint8Array;
  readonly ink: Uint8Array;
  readonly paper: Uint8Array;
  readonly left: Float64Array;
  readonly right: Float64Array;
  readonly top: number;
  readonly bottom: number;
}

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

const fromBorder = (mask: Uint8Array, w: number, h: number): Uint8Array => {
  const { labels } = componentsOf(mask, w, h, false);
  const border = new Set<number>();
  for (let x = 0; x < w; x++) border.add(labels[x] ?? -1).add(labels[(h - 1) * w + x] ?? -1);
  for (let y = 0; y < h; y++) border.add(labels[y * w] ?? -1).add(labels[y * w + w - 1] ?? -1);
  border.delete(-1);
  return maskWhere(labels.length, (i) => border.has(labels[i] ?? -1));
};

const count = (m: Uint8Array) => m.reduce((s, v) => s + v, 0);

const markThin = (mask: Uint8Array, thin: Uint8Array, n: number, at: (k: number) => number) => {
  let start = 0;
  for (let k = 0; k <= n; k++) {
    if (k < n && mask[at(k)] === 1) continue;
    if (k - start > 0 && k - start <= SLIVER_THICK) for (let j = start; j < k; j++) thin[at(j)] = 1;
    start = k + 1;
  }
};

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
  return maskWhere(labels.length, (i) => long.has(labels[i] ?? -1));
};

const groundOf = (r: Raster) => {
  const { width: w, height: h } = r;
  const n = w * h;
  const labAt = labsOf(r);
  const labs: Rgb[] = [];
  for (let i = 0; i < n; i++) labs.push(labAt(i));
  const { lab, near } = groundColour(r, labs);
  const like = maskWhere(n, (i) => deltaE(labs[i] ?? lab, lab) <= near);
  const ground = fromBorder(like, w, h);
  const figure = maskWhere(n, (i) => ground[i] === 0);
  const pieces = componentsOf(figure, w, h, true);
  const specks = maskWhere(
    n,
    (i) => (pieces.components[pieces.labels[i] ?? -1]?.area ?? SPECK) < SPECK,
  );
  const strips = thinStrips(specks, w, h);
  const kept = new Set(pieces.labels.filter((l, i) => strips[i] === 1));
  for (let i = 0; i < n; i++)
    if (specks[i] === 1 && !kept.has(pieces.labels[i] ?? -1)) ground[i] = 1;
  let reach = near;
  for (let i = 0; i < n; i++) {
    const d = ground[i] === 1 ? deltaE(labs[i] ?? lab, lab) : 0;
    if (d > reach && d <= BORDER_GROUND) reach = d;
  }
  return { lab, near, reach, like, ground };
};

export const figureOf = (r: Raster) => {
  const { lab, like, ground } = groundOf(r);
  return {
    figure: maskWhere(ground.length, (i) => ground[i] === 0),
    holes: maskWhere(ground.length, (i) => ground[i] === 0 && like[i] === 1),
    ground: lab,
  };
};

const MEASURE_LUMA = 180;

const MEASURE_STEP = 15;

const OPAQUE = 250;

const hexRgb = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

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

const lightGrid = (): Rgb[] => {
  const out: Rgb[] = [];
  for (let r = 0; r <= 255; r += MEASURE_STEP)
    for (let g = 0; g <= 255; g += MEASURE_STEP)
      for (let b = 0; b <= 255; b += MEASURE_STEP)
        if (lumaOf([r, g, b]) >= MEASURE_LUMA) out.push([r, g, b]);
  return out;
};

const leastDeltaE = (lab: Rgb, labs: ReadonlyArray<Rgb>, stop: number) => {
  let least = Infinity;
  for (const l of labs) {
    least = Math.min(least, deltaE(lab, l));
    if (least <= stop) break;
  }
  return least;
};

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

const groundNear = (c: Read, of: Raster, within: number) => (i: number) =>
  deltaE(labOf(rgbAt(of, i)), c.lab) <= within;

const POCKET_REACH = 7;

const POCKET_CORE_DE = 2;

const POCKET_CORE = 9;

const pocketsOf = (c: Read): Uint8Array => {
  const kept = componentsOf(c.holes, c.w, c.h, false);
  const core = new Uint32Array(kept.components.length);
  kept.labels.forEach((l, i) => {
    if (l >= 0 && deltaE(labOf(rgbAt(c.r, i)), c.lab) <= POCKET_CORE_DE)
      core[l] = (core[l] ?? 0) + 1;
  });
  return maskWhere(kept.labels.length, (i) => {
    const l = kept.labels[i] ?? -1;
    return l >= 0 && (core[l] ?? 0) >= POCKET_CORE;
  });
};

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

const cutHolesOf = (c: Read, render: Raster) => {
  const { w, h } = c;
  const alpha = (i: number) => render.rgba[i * 4 + 3] ?? 0;
  const clear = maskWhere(w * h, (i) => alpha(i) < 128);
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

const bandRows = (c: Read, band: 'head' | 'body'): readonly [number, number] => {
  const split = c.top + Math.ceil(HEAD_SHARE * (c.bottom - c.top + 1));
  return band === 'head' ? [c.top, split - 1] : [split, c.bottom];
};

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

const turnAt = (e: Float64Array, y: number) => {
  const [a, b, d] = [e[y - TURN_SPAN], e[y], e[y + TURN_SPAN]];
  if (a === undefined || b === undefined || d === undefined) return Number.NaN;
  return Math.abs(a - 2 * b + d);
};

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

const iouOf = (a: Uint8Array, b: Uint8Array) => {
  let [both, either] = [0, 0];
  for (let i = 0; i < a.length; i++) {
    const [x, y] = [a[i] === 1, b[i] === 1];
    if (x && y) both++;
    if (x || y) either++;
  }
  return either === 0 ? 1 : both / either;
};

const crossing = (f: Float64Array, q: number, p: number) =>
  ((f[q] ?? 0) + q * q - ((f[p] ?? 0) + p * p)) / (2 * q - 2 * p);

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

const distancesTo = (mask: Uint8Array, w: number, h: number): Float64Array => {
  const FAR = (w + h) ** 2;
  const d = new Float64Array(mask.length).fill(FAR);
  for (let i = 0; i < mask.length; i++) if (mask[i] === 1) d[i] = 0;
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

const sliversOf = (read: Read) => count(thinStrips(read.paper, read.w, read.h));

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

const classesOf = (read: Read, classOf: (i: number) => number): Int8Array => {
  const out = new Int8Array(read.w * read.h).fill(-1);
  for (let i = 0; i < out.length; i++) if (read.paper[i] === 1) out[i] = classOf(i);
  return out;
};

const classRows = (
  c: Read,
  r: Read,
  classes: Readonly<Record<string, FitClass>>,
  kinds: readonly [Int8Array, Int8Array],
  bar: (name: keyof typeof FIT_BARS, band: FitBand, part: string) => FitBar,
): FitRow[] => {
  const [ck, rk] = kinds;
  const maskOf = (of: Int8Array, k: number) => maskWhere(of.length, (i) => of[i] === k);
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

const regionsOf = (read: Read, kinds: Int8Array, names: ReadonlyArray<string>) => {
  const { w, h } = read;
  const label = new Int32Array(w * h).fill(-1);
  const regions: LabelRegion[] = [];
  names.forEach((name, k) => {
    const { components, labels } = componentsOf(
      maskWhere(kinds.length, (i) => kinds[i] === k),
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

const edgeOfMask = (mask: Uint8Array, w: number, h: number) =>
  maskWhere(mask.length, (i) => {
    if (mask[i] === 0) return false;
    const [x, y] = [i % w, Math.floor(i / w)];
    const off = (nx: number, ny: number) =>
      nx < 0 || ny < 0 || nx >= w || ny >= h || mask[ny * w + nx] === 0;
    return off(x - 1, y) || off(x + 1, y) || off(x, y - 1) || off(x, y + 1);
  });

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
      return maskWhere(label.length, (i) => id !== undefined && label[i] === id);
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

interface ProbeRun {
  cls: string;
  readonly from: number;
  to: number;
}

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

interface ProbeChange {
  readonly kind: string;
  readonly at: number;
}

const changesOf = (runs: ReadonlyArray<{ cls: string; from: number }>): ProbeChange[] =>
  runs.slice(1).map((run, k) => ({ kind: `${runs[k]?.cls ?? ''}>${run.cls}`, at: run.from }));

type AlignStep = readonly [left: number, moved: number, does: number];

const [LEAVE_A, LEAVE_B, PAIR] = [0, 1, 2];

const leastStep = (x: AlignStep, y: AlignStep) =>
  y[0] < x[0] || (y[0] === x[0] && y[1] < x[1]) ? y : x;

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

const classesOver = (
  runs: ReadonlyArray<{ cls: string; from: number; to: number }>,
  lo: number,
  hi: number,
) =>
  Array.from(
    { length: hi - lo + 1 },
    (_, k) => runs.find((x) => x.from <= lo + k && x.to >= lo + k)?.cls,
  );

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
  const figure = (read: Read) => maskWhere(read.ground.length, (i) => read.ground[i] === 0);
  rows.push(
    rowOf('silhouette.iou', 'figure', 'figure', iouOf(figure(c), figure(r)), bar('silhouette.iou')),
  );
  rows.push(rowOf('ink.edge', 'figure', 'figure', inkEdgeOf(c, r), bar('ink.edge')));
  const cut = render.rgba.some((v, k) => k % 4 === 3 && v < 255);
  const edge = (i: number) => {
    const a = render.rgba[i * 4 + 3] ?? 0;
    return a > 0 && a < 255;
  };
  const rc: Read = cut
    ? { ...r, paper: maskWhere(r.paper.length, (i) => r.paper[i] === 1 && !edge(i)) }
    : r;
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
