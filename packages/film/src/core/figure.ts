import { Option, Result, Schema } from 'effect';
import type { Raster } from './raster.ts';
import { ArtifactMark, headArtifacts } from './render-artifacts.ts';

const Hsv = Schema.Struct({
  hue: Schema.Finite,
  saturation: Schema.Finite,
  value: Schema.Finite,
});
type Hsv = typeof Hsv.Type;

export const Shading = Schema.Struct({
  lit: Hsv,
  shade: Hsv,
  edge: Schema.Finite,
  kind: Schema.Literals(['colour', 'grey']),
});
export type Shading = typeof Shading.Type;

export const RATIOS = [
  'headHeight',
  'outline',
  'jaw',
  'bodyUnderChin',
  'body35',
  'body70',
  'hem',
  'heightInHeads',
  'hand',
  'eyeWidth',
  'eyeHeight',
  'eyeSpacing',
  'eyeBelowCentre',
  'browLength',
  'browAbove',
  'mouthWidth',
  'mouthBelowCentre',
  'feetWidth',
  'feetHeight',
  'interiorInk',
  'innerRim',
] as const;
export type Ratio = (typeof RATIOS)[number];

const FACE_MARKS: ReadonlySet<Ratio> = new Set([
  'eyeWidth',
  'eyeHeight',
  'browLength',
  'browAbove',
  'mouthWidth',
]);

export const RATIO_LABELS: Readonly<Record<Ratio, string>> = {
  headHeight: 'head height (with hair) / width',
  outline: 'outline width',
  jaw: 'jaw width, 0.2 above the chin',
  bodyUnderChin: 'body width, 0.1 under the chin',
  body35: 'body width, 0.35 under the chin',
  body70: 'body width, 0.7 under the chin',
  hem: 'body width at the hem',
  heightInHeads: 'height in head heights',
  hand: 'hand diameter',
  feetWidth: 'feet, their whole width',
  feetHeight: "feet, their height under the body's lowest row",
  eyeWidth: 'eye width / eye spacing',
  eyeHeight: 'eye height / eye spacing',
  eyeSpacing: 'eye spacing, centre to centre',
  eyeBelowCentre: 'eye centre below head centre',
  browLength: 'brow length / eye spacing',
  browAbove: "brow's top above eye centre / eye spacing",
  mouthWidth: 'mouth width / eye spacing',
  mouthBelowCentre: 'mouth below head centre',
  interiorInk: 'ink on the hair/skin edge, its length',
  innerRim: "light rim inside an inner part's edge (an ear, the hair), its length",
};

const Measured = Schema.Struct({ ratio: Schema.Literals(RATIOS), value: Schema.Finite });
type Measured = typeof Measured.Type;

const Unmeasured = Schema.Struct({ ratio: Schema.Literals(RATIOS), why: Schema.String });
type Unmeasured = typeof Unmeasured.Type;

export const PixelBox = Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite, Schema.Finite]);
export type PixelBox = typeof PixelBox.Type;

export const HEAD_RADII = 72;

const BodyEdge = Schema.Struct({
  y: Schema.Finite,
  left: Schema.Finite,
  right: Schema.Finite,
});
type BodyEdge = typeof BodyEdge.Type;

export const FigureSilhouette = Schema.Struct({
  head: Schema.Array(Schema.Finite),
  body: Schema.Array(BodyEdge),
  feet: Schema.optionalKey(PixelBox),
});
export type FigureSilhouette = typeof FigureSilhouette.Type;

const MouthPose = Schema.Literals(['open', 'closed']);
type MouthPose = typeof MouthPose.Type;
const MOUTH_OPEN = 0.8;

const Facing = Schema.Struct({
  turn: Schema.Finite,
  roll: Schema.Finite,
  eyes: Schema.Finite,
});
type Facing = typeof Facing.Type;

const HairBeard = Schema.Struct({
  hair: Hsv,
  beard: Hsv,
  edge: Schema.optionalKey(Schema.Finite),
});
export type HairBeard = typeof HairBeard.Type;

export const FigureMeasure = Schema.Struct({
  head: PixelBox,
  ink: Schema.Tuple([Schema.Int, Schema.Int, Schema.Int]),
  ratios: Schema.Array(Measured),
  silhouette: FigureSilhouette,
  headShading: Schema.optionalKey(Shading),
  bodyShading: Schema.optionalKey(Shading),
  mouth: Schema.optionalKey(MouthPose),
  facing: Facing,
  chin: Schema.optionalKey(Schema.Literal('open')),
  artifacts: Schema.Array(ArtifactMark),
  hairBeard: Schema.optionalKey(HairBeard),
  missing: Schema.Array(Unmeasured),
});
export type FigureMeasure = typeof FigureMeasure.Type;

class FigureUnread extends Schema.TaggedError<FigureUnread>()('FigureUnread', {
  reason: Schema.String,
}) {
  override get message() {
    return `no figure reads in the crop: ${this.reason}`;
  }
}

type Rgb = readonly [number, number, number];

const rgbAt = (r: Raster, i: number): Rgb => [
  r.rgba[i * 4] ?? 0,
  r.rgba[i * 4 + 1] ?? 0,
  r.rgba[i * 4 + 2] ?? 0,
];

const dist = (a: Rgb, b: Rgb): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const distSq = (a: Rgb, b: Rgb): number => {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
};

const distSqAt = (r: Raster, i: number, c: Rgb): number => {
  const dr = r.rgba[i * 4]! - c[0];
  const dg = r.rgba[i * 4 + 1]! - c[1];
  const db = r.rgba[i * 4 + 2]! - c[2];
  return dr * dr + dg * dg + db * db;
};

const orderOfSquares = (a: number, b: number): number => {
  // oxlint-disable-next-line film/one-clock-epsilon -- a colour distance's float band, no time
  if (Math.abs(a - b) <= 1e-9 * Math.max(a, b)) return 0;
  return Math.sign(a - b);
};

const closerThan = (a: Rgb, b: Rgb, limit: number): boolean => {
  const order = orderOfSquares(distSq(a, b), limit * limit);
  return order < 0 || (order === 0 && dist(a, b) < limit);
};

const closerThanAt = (r: Raster, i: number, c: Rgb, limit: number, orAt = false): boolean => {
  const order = orderOfSquares(distSqAt(r, i, c), limit * limit);
  if (order !== 0) return order < 0;
  const d = dist(rgbAt(r, i), c);
  return d < limit || (orAt && d === limit);
};

const lumaOf = (c: Rgb): number => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

export const hsvOf = (c: Rgb): Hsv => {
  const [r, g, b] = [c[0] / 255, c[1] / 255, c[2] / 255];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let hue = 0;
  if (d > 0 && max === r) hue = 60 * (((g - b) / d + 6) % 6);
  else if (d > 0 && max === g) hue = 60 * ((b - r) / d + 2);
  else if (d > 0) hue = 60 * ((r - g) / d + 4);
  return { hue, saturation: max === 0 ? 0 : d / max, value: max };
};

const allBytes = (colours: ReadonlyArray<Rgb>): boolean =>
  colours.every((c) => c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255));

const byteAtRank = (colours: ReadonlyArray<Rgb>, k: 0 | 1 | 2, rank: number): number => {
  const counts = new Int32Array(256);
  for (const c of colours) counts[c[k]]!++;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += counts[v]!;
    if (seen > rank) return v;
  }
  return 0;
};

const medianRgb = (colours: ReadonlyArray<Rgb>): Rgb => {
  const rank = Math.floor(colours.length / 2);
  if (allBytes(colours))
    return [
      byteAtRank(colours, 0, rank),
      byteAtRank(colours, 1, rank),
      byteAtRank(colours, 2, rank),
    ];
  const mid = (k: 0 | 1 | 2) => {
    const sorted = colours.map((c) => c[k]).sort((a, b) => a - b);
    return sorted[rank] ?? 0;
  };
  return [mid(0), mid(1), mid(2)];
};

const clusters = (colours: ReadonlyArray<Rgb>, k: number) => {
  const byLuma = [...colours].sort((a, b) => lumaOf(a) - lumaOf(b));
  let centres: Array<Rgb> = Array.from(
    { length: k },
    (_, j) => byLuma[Math.floor(((j + 0.5) / k) * byLuma.length)] ?? [0, 0, 0],
  );
  let members: Array<Array<Rgb>> = [];
  for (let round = 0; round < 10; round++) {
    members = centres.map(() => []);
    for (const c of colours) {
      let best = 0;
      let nearest = distSq(c, centres[0]!);
      for (let j = 1; j < centres.length; j++) {
        const d = distSq(c, centres[j]!);
        const order = orderOfSquares(d, nearest);
        if (order < 0 || (order === 0 && dist(c, centres[j]!) < dist(c, centres[best]!)))
          [best, nearest] = [j, d];
      }
      members[best]!.push(c);
    }
    centres = members.map((m, j) => (m.length === 0 ? centres[j]! : medianRgb(m)));
  }
  return centres
    .map((centre, j) => {
      const near = (members[j] ?? []).map((c) => dist(c, centre)).sort((a, b) => a - b);
      return {
        centre,
        share: near.length / Math.max(1, colours.length),
        spread: near[Math.floor(near.length * 0.9)] ?? 0,
      };
    })
    .sort((a, b) => b.share - a.share);
};

const INK_NEAR = 34;

const inkLike = (c: Rgb, ink: Rgb): boolean => {
  if (!closerThan(c, ink, 2.5 * INK_NEAR) || lumaOf(c) >= 100) return false;
  const { hue, saturation } = hsvOf(c);
  return saturation >= 0.5 && hue <= 45;
};

const inkOf = (r: Raster): Option.Option<Rgb> => {
  const n = r.width * r.height;
  const bins = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const c = rgbAt(r, i);
    if (lumaOf(c) >= 60 || c[0] - c[2] < 6 || c[1] < c[2]) continue;
    const key = ((c[0] >> 3) << 10) | ((c[1] >> 3) << 5) | (c[2] >> 3);
    bins.set(key, (bins.get(key) ?? 0) + 1);
  }
  const [best, count] = [...bins].reduce<readonly [number, number]>(
    (top, bin) => (bin[1] > top[1] ? bin : top),
    [-1, 0],
  );
  if (count < 8) return Option.none();
  const centre: Rgb = [
    ((best >> 10) << 3) + 4,
    (((best >> 5) & 31) << 3) + 4,
    ((best & 31) << 3) + 4,
  ];
  const near: Array<Rgb> = [];
  for (let i = 0; i < n; i++) if (closerThanAt(r, i, centre, 14, true)) near.push(rgbAt(r, i));
  const mean = (k: 0 | 1 | 2) => Math.round(near.reduce((s, c) => s + c[k], 0) / near.length);
  return Option.some([mean(0), mean(1), mean(2)]);
};

const FAR = 1e20;

const edt1 = (f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) => {
  let k = 0;
  v[0] = 0;
  z[0] = -FAR;
  z[1] = FAR;
  const cross = (q: number, p: number) => (f[q]! + q * q - (f[p]! + p * p)) / (2 * q - 2 * p);
  for (let q = 1; q < n; q++) {
    let s = cross(q, v[k]!);
    while (s <= z[k]!) {
      k--;
      s = cross(q, v[k]!);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = FAR;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    d[q] = (q - v[k]!) * (q - v[k]!) + f[v[k]!]!;
  }
};

const columnFromSeeds = (out: Float64Array, w: number, h: number, x: number): boolean => {
  let last = -1;
  for (let y = 0; y < h; y++) {
    const i = y * w + x;
    if (out[i] === 0) last = y;
    else if (last >= 0) out[i] = (y - last) * (y - last);
  }
  if (last < 0) return false;
  let next = -1;
  for (let y = h - 1; y >= 0; y--) {
    const i = y * w + x;
    if (out[i] === 0) next = y;
    else if (next >= 0 && (next - y) * (next - y) < out[i]!) out[i] = (next - y) * (next - y);
  }
  return true;
};

const distanceTo = (w: number, h: number, seed: (i: number) => boolean): Float64Array => {
  const out = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = seed(i) ? 0 : FAR;
  const m = Math.max(w, h);
  const [f, d, v, z] = [
    new Float64Array(m),
    new Float64Array(m),
    new Int32Array(m),
    new Float64Array(m + 1),
  ];
  for (let x = 0; x < w; x++) {
    if (!columnFromSeeds(out, w, h, x)) {
      for (let y = 0; y < h; y++) f[y] = out[y * w + x]!;
      edt1(f, h, d, v, z);
      for (let y = 0; y < h; y++) out[y * w + x] = d[y]!;
    }
  }
  for (let y = 0; y < h; y++) {
    edt1(out.subarray(y * w, y * w + w), w, d, v, z);
    out.set(d.subarray(0, w), y * w);
  }
  return out;
};

interface Part {
  readonly id: number;
  area: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  border: boolean;
}

interface Labelled {
  readonly labels: Int32Array;
  readonly parts: ReadonlyArray<Part>;
}

const STEPS_FOUR = { dx: Int32Array.of(1, -1, 0, 0), dy: Int32Array.of(0, 0, 1, -1) };
const STEPS_EIGHT = {
  dx: Int32Array.of(1, -1, 0, 0, 1, 1, -1, -1),
  dy: Int32Array.of(0, 0, 1, -1, 1, -1, 1, -1),
};

const ALWAYS = () => true;

const flood = (
  start: number,
  part: Part,
  size: readonly [number, number],
  steps: { readonly dx: Int32Array; readonly dy: Int32Array },
  admit: (i: number, j: number) => boolean,
  labels: Int32Array,
  stack: Int32Array,
) => {
  const [w, h] = size;
  const { dx, dy } = steps;
  const id = part.id;
  let { area, x0, y0, x1, y1, border } = part;
  let top = 0;
  stack[top++] = start;
  labels[start] = id;
  while (top > 0) {
    const i = stack[--top]!;
    const x = i % w;
    const y = (i - x) / w;
    area++;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
    for (let s = 0; s < dx.length; s++) {
      const nx = x + dx[s]!;
      const ny = y + dy[s]!;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (labels[j] !== -1 || !admit(i, j)) continue;
      labels[j] = id;
      stack[top++] = j;
    }
  }
  Object.assign(part, { area, x0, y0, x1, y1, border });
};

const label = (
  w: number,
  h: number,
  inside: (i: number) => boolean,
  eight: boolean,
  joins: (i: number, j: number) => boolean = ALWAYS,
): Labelled => {
  const labels = new Int32Array(w * h).fill(-1);
  const parts: Array<Part> = [];
  const stack = new Int32Array(w * h);
  const steps = eight ? STEPS_EIGHT : STEPS_FOUR;
  const admit =
    (joins === ALWAYS && ((_i: number, j: number) => inside(j))) ||
    ((i: number, j: number) => inside(j) && joins(i, j));
  for (let start = 0; start < w * h; start++) {
    if (labels[start] !== -1 || !inside(start)) continue;
    const part: Part = { id: parts.length, area: 0, x0: w, y0: h, x1: -1, y1: -1, border: false };
    parts.push(part);
    flood(start, part, [w, h], steps, admit, labels, stack);
  }
  return { labels, parts };
};

const widthOf = (p: Part) => p.x1 - p.x0 + 1;
const heightOf = (p: Part) => p.y1 - p.y0 + 1;
const cxOf = (p: Part) => (p.x0 + p.x1) / 2;
const cyOf = (p: Part) => (p.y0 + p.y1) / 2;

interface Read {
  readonly r: Raster;
  readonly w: number;
  readonly h: number;
  readonly inkColour: Rgb;
  readonly ink: Uint8Array;
  readonly mass: Uint8Array;
  readonly line: number;
  readonly seal: number;
  readonly regions: Labelled;
  readonly marks: Labelled;
}

const lineWidthOf = (ink: Uint8Array, w: number, h: number): number => {
  const counts = new Map<number, number>();
  const run = (length: number) => {
    if (length >= 3) counts.set(length, (counts.get(length) ?? 0) + 1);
  };
  for (let y = 0; y < h; y++) {
    let length = 0;
    for (let x = 0; x < w; x++) {
      if (ink[y * w + x] === 1) length++;
      else {
        run(length);
        length = 0;
      }
    }
    run(length);
  }
  for (let x = 0; x < w; x++) {
    let length = 0;
    for (let y = 0; y < h; y++) {
      if (ink[y * w + x] === 1) length++;
      else {
        run(length);
        length = 0;
      }
    }
    run(length);
  }
  const inkOfRuns = (length: number) => length * (counts.get(length) ?? 0);
  const around = (k: number) => [k - 1, k, k + 1];
  const weigh = (k: number) => around(k).reduce((sum, j) => sum + inkOfRuns(j), 0);
  const most = Math.min(w, h) / 12;
  const heaviest = Math.max(0, ...[...counts.keys()].filter((k) => k <= most).map(weigh));
  const peak = (k: number) => k <= most && weigh(k) >= weigh(k - 1) && weigh(k) >= weigh(k + 1);
  const peaks = [...counts.keys()].filter((k) => peak(k) && weigh(k) >= heaviest / 2);
  const mode = Math.max(3, ...peaks);
  return Math.round(
    around(mode).reduce((sum, j) => sum + j * inkOfRuns(j), 0) / Math.max(1, weigh(mode)),
  );
};

const readCrop = (r: Raster): Option.Option<Read> =>
  Option.map(inkOf(r), (inkColour) => {
    const { width: w, height: h } = r;
    const n = w * h;
    const strong = new Uint8Array(n);
    const near = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const c = rgbAt(r, i);
      strong[i] = closerThan(c, inkColour, INK_NEAR) && c[2] <= c[1] + 6 ? 1 : 0;
      near[i] = strong[i] === 1 || inkLike(c, inkColour) ? 1 : 0;
    }
    const line = lineWidthOf(strong, w, h);
    const half = line / 2;
    const depth = distanceTo(w, h, (i) => near[i] === 0);
    const reach = half * 1.8 + 1;
    const fromCore = distanceTo(w, h, (i) => depth[i]! > reach * reach);
    const cored = (i: number) => near[i] === 1 && fromCore[i]! <= reach * reach;
    const mass = reachFrom(w, h, cored, (j) => near[j] === 1 && strong[j] === 0);
    const ink = new Uint8Array(n);
    for (let i = 0; i < n; i++) ink[i] = near[i] === 1 && mass[i] === 0 ? 1 : 0;
    const seal = Math.max(1, Math.round(half * 0.4));
    const sealed = distanceTo(w, h, (i) => ink[i] === 1);
    const regions = label(
      w,
      h,
      (i) => sealed[i]! > seal * seal,
      false,
      (i, j) => mass[i] === mass[j],
    );
    const marks = label(w, h, (i) => ink[i] === 1, true);
    return { r, w, h, inkColour, ink, mass, line, seal, regions, marks };
  });

const regionNear = (read: Read, x: number, y: number, reach: number): Option.Option<Part> => {
  const { w, h, regions } = read;
  for (let d = 0; d <= reach; d++)
    for (const [dx, dy] of [
      [0, d],
      [0, -d],
      [d, 0],
      [-d, 0],
    ] as const) {
      const [nx, ny] = [Math.round(x + dx), Math.round(y + dy)];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const id = regions.labels[ny * w + nx]!;
      if (id >= 0) return Option.fromUndefinedOr(regions.parts[id]);
    }
  return Option.none();
};

const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

const regionAcross = (
  read: Read,
  of: Part,
  from: readonly [number, number],
  step: readonly [number, number],
  span: number,
): number => {
  const { w, h, regions } = read;
  for (let k = 1; k <= span; k++) {
    const [nx, ny] = [from[0] + step[0] * k, from[1] + step[1] * k];
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) return -1;
    const id = regions.labels[ny * w + nx]!;
    if (id === of.id) return -1;
    if (id >= 0) return id;
  }
  return -1;
};

const neighbours = (read: Read, of: Part, span: number): ReadonlySet<number> => {
  const found = new Set<number>();
  for (let y = of.y0; y <= of.y1; y++)
    for (let x = of.x0; x <= of.x1; x++) {
      if (read.regions.labels[y * read.w + x] !== of.id) continue;
      for (const step of STEPS) {
        const id = regionAcross(read, of, [x, y], step, span);
        if (id >= 0) found.add(id);
      }
    }
  return found;
};

const massShare = (read: Read, p: Part): number => {
  let [count, all] = [0, 0];
  for (let y = p.y0; y <= p.y1; y++)
    for (let x = p.x0; x <= p.x1; x++) {
      const i = y * read.w + x;
      if (read.regions.labels[i] !== p.id) continue;
      all++;
      if (read.mass[i] === 1) count++;
    }
  return count / Math.max(1, all);
};

const coverage = (read: Read, points: ReadonlyArray<readonly [number, number]>, beside: Rgb) => {
  const far = Math.max(12, dist(beside, read.inkColour));
  let sum = 0;
  for (const [x, y] of points) {
    const at = Math.min(read.h - 1, Math.max(0, y)) * read.w + Math.min(read.w - 1, Math.max(0, x));
    sum += Math.min(1, Math.max(0, (far - dist(rgbAt(read.r, at), read.inkColour)) / (far - 10)));
  }
  return sum;
};

const markSize = (read: Read, p: Part) => {
  const [cx, cy] = [Math.round(cxOf(p)), Math.round(cyOf(p))];
  const beside = rgbAt(read.r, cy * read.w + Math.max(0, p.x0 - 3));
  const across = Array.from({ length: widthOf(p) + 4 }, (_, k) => [p.x0 - 2 + k, cy] as const);
  const down = Array.from({ length: heightOf(p) + 4 }, (_, k) => [cx, p.y0 - 2 + k] as const);
  return { width: coverage(read, across, beside), height: coverage(read, down, beside) };
};

const pixelsOfMark = (read: Read, marks: Labelled, p: Part): Array<readonly [number, number]> => {
  const out: Array<readonly [number, number]> = [];
  for (let y = p.y0; y <= p.y1; y++)
    for (let x = p.x0; x <= p.x1; x++) if (marks.labels[y * read.w + x] === p.id) out.push([x, y]);
  return out;
};

const faceMarks = (read: Read, face: Part, box: PixelBox): Labelled => {
  const fill: Array<Rgb> = [];
  for (let y = face.y0; y <= face.y1; y += 2)
    for (let x = face.x0; x <= face.x1; x += 2)
      if (read.regions.labels[y * read.w + x] === face.id) fill.push(rgbAt(read.r, y * read.w + x));
  const cut = (lumaOf(medianRgb(fill)) + lumaOf(read.inkColour)) / 2;
  const [x0, y0, x1, y1] = box;
  return label(
    read.w,
    read.h,
    (i) => {
      const x = i % read.w;
      const y = (i - x) / read.w;
      return x >= x0 && x <= x1 && y >= y0 && y <= y1 && lumaOf(rgbAt(read.r, i)) < cut;
    },
    true,
  );
};

const axisLength = (read: Read, marks: Labelled, p: Part): number => {
  const points = pixelsOfMark(read, marks, p);
  const [mx, my] = [
    points.reduce((s, [x]) => s + x, 0) / points.length,
    points.reduce((s, [, y]) => s + y, 0) / points.length,
  ];
  let [xx, yy, xy] = [0, 0, 0];
  for (const [x, y] of points)
    [xx, yy, xy] = [xx + (x - mx) ** 2, yy + (y - my) ** 2, xy + (x - mx) * (y - my)];
  const angle = Math.atan2(2 * xy, xx - yy) / 2;
  const along = points.map(([x, y]) => (x - mx) * Math.cos(angle) + (y - my) * Math.sin(angle));
  return Math.max(...along) - Math.min(...along) + 1;
};

const strokeOf = (read: Read, marks: Labelled, p: Part): number =>
  p.area / axisLength(read, marks, p);

const rayWidth = (
  read: Read,
  centre: readonly [number, number],
  face: Part,
  base: number,
  turn: number,
): Option.Option<number> => {
  const a = ((base + turn) * Math.PI) / 180;
  const [dx, dy] = [Math.cos(a), Math.sin(a)];
  const along = (t: number) =>
    [Math.round(centre[0] + dx * t), Math.round(centre[1] + dy * t)] as const;
  const inCrop = ([x, y]: readonly [number, number]) =>
    x >= 0 && y >= 0 && x < read.w && y < read.h;
  let [start, end] = [-1, -1];
  for (let t = 0; inCrop(along(t)); t++) {
    const [x, y] = along(t);
    const i = y * read.w + x;
    if (read.regions.labels[i] === face.id) [start, end] = [-1, -1];
    else if (read.ink[i] === 1 && end < 0) start = start < 0 ? t : start;
    else if (start >= 0 && end < 0) end = t;
  }
  if (start < 0 || end < 0 || !inCrop(along(end + 3))) return Option.none();
  const [ix, iy] = along(start - 3);
  const [ox, oy] = along(end + 3);
  const insideFill = rgbAt(read.r, iy * read.w + ix);
  const outsideFill = rgbAt(read.r, oy * read.w + ox);
  const middle = Math.round((start + end) / 2);
  const inner = Array.from({ length: middle - (start - 2) }, (_, k) => along(start - 2 + k));
  const outer = Array.from({ length: end + 2 - middle }, (_, k) => along(middle + k));
  return Option.some(
    (coverage(read, inner, insideFill) + coverage(read, outer, outsideFill)) *
      Math.cos((turn * Math.PI) / 180),
  );
};

const outlineOf = (read: Read, cx: number, cy: number, face: Part): number => {
  const widths = [0, 90, 180]
    .flatMap((base) => [-20, 0, 20].map((turn) => rayWidth(read, [cx, cy], face, base, turn)))
    .flatMap(Option.toArray)
    .sort((a, b) => a - b);
  return widths[Math.floor(widths.length / 2)] ?? read.line;
};

const eyeLike = (p: Part) => {
  const aspect = heightOf(p) / widthOf(p);
  return aspect >= 1.1 && aspect <= 3.6 && p.area >= 0.5 * widthOf(p) * heightOf(p) && p.area >= 6;
};

const eyesOf = (read: Read, marks: ReadonlyArray<Part>) => {
  const eyes = marks.filter(eyeLike);
  let best = Option.none<{ readonly eyes: readonly [Part, Part]; readonly face: Part }>();
  let score = 0;
  for (let i = 0; i < eyes.length; i++)
    for (let j = i + 1; j < eyes.length; j++) {
      const [a, b] = cxOf(eyes[i]!) < cxOf(eyes[j]!) ? [eyes[i]!, eyes[j]!] : [eyes[j]!, eyes[i]!];
      const dx = cxOf(b) - cxOf(a);
      if (Math.max(a.area, b.area) > 2 * Math.min(a.area, b.area)) continue;
      if (Math.abs(cyOf(a) - cyOf(b)) > 0.5 * Math.max(heightOf(a), heightOf(b))) continue;
      if (dx < 1.5 * widthOf(a) || dx > 12 * widthOf(a) || a.area + b.area <= score) continue;
      const between = regionNear(read, (cxOf(a) + cxOf(b)) / 2, (cyOf(a) + cyOf(b)) / 2, 4);
      const left = regionNear(read, a.x0 - read.seal - 2, cyOf(a), 4);
      const right = regionNear(read, b.x1 + read.seal + 2, cyOf(b), 4);
      const face = Option.map(between, (p) => p.id);
      if (
        Option.isNone(face) ||
        [left, right].some((side) => Option.isNone(side) || side.value.id !== face.value)
      )
        continue;
      score = a.area + b.area;
      best = Option.some({ eyes: [a, b] as const, face: read.regions.parts[face.value]! });
    }
  return best;
};

const NECK_NARROW = 0.8;
const NECK_LEAST = 0.15;
const NECK_EVEN = 1.15;

interface OpenChin {
  readonly chin: number;
  readonly seed: number;
  readonly plug: readonly [number, number, number, number];
}

const spanOn = (
  read: Read,
  id: number,
  y: number,
  x0: number,
  x1: number,
): Option.Option<readonly [number, number]> => {
  const { w, regions } = read;
  const of = (x: number) => x >= 0 && x < w && regions.labels[y * w + x] === id;
  let [lo, hi] = [-1, -1];
  for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
    if (!of(x)) continue;
    let [l, r] = [x, x];
    while (of(l - 1)) l--;
    while (of(r + 1)) r++;
    [lo, hi] = [lo < 0 ? l : Math.min(lo, l), Math.max(hi, r)];
    x = r;
  }
  return lo < 0 ? Option.none() : Option.some([lo, hi] as const);
};

const openChinOf = (
  read: Read,
  face: Part,
  eyes: readonly [Part, Part],
): Option.Option<OpenChin> => {
  const [a, b] = eyes;
  const top = Math.ceil(Math.max(a.y1, b.y1) + read.seal + read.line);
  const first = spanOn(read, face.id, top, Math.floor(a.x0), Math.ceil(b.x1));
  if (Option.isNone(first)) return Option.none();
  const across = first.value[1] - first.value[0] + 1;
  const spans: Array<readonly [number, number]> = [];
  let span = first.value;
  for (let y = top; y < read.h && y <= top + 2.5 * across; y++) {
    const next = spanOn(read, face.id, y, span[0], span[1]);
    if (Option.isNone(next)) break;
    span = next.value;
    spans.push(span);
  }
  const widths = spans.map(([lo, hi]) => hi - lo + 1);
  const reach = Math.min(widths.length, Math.ceil(1.2 * across));
  const narrowest = widths.slice(0, reach).reduce((m, v, k) => (v < widths[m]! ? k : m), 0);
  const neck = widths[narrowest] ?? across;
  const widens = widths
    .slice(narrowest, narrowest + Math.ceil(1.2 * across))
    .some((v) => v >= across);
  if (neck >= NECK_NARROW * across || neck < NECK_LEAST * across || !widens) return Option.none();
  let chin = narrowest;
  while (chin > 0 && widths[chin - 1]! <= NECK_EVEN * neck) chin--;
  const [lo, hi] = spans[chin]!;
  const pad = read.line + read.seal;
  return Option.some({
    chin: top + chin,
    seed: top * read.w + first.value[0],
    plug: [lo - pad, top + chin, hi + pad, top + chin + read.line] as const,
  });
};

const cutAtChin = (read: Read, face: Part, seed: number, chin: number) => {
  const { w, h } = read;
  const old = read.regions.labels;
  const labels = Int32Array.from(old, (id) => (id === face.id ? -1 : id));
  const cut: Part = {
    id: read.regions.parts.length,
    area: 0,
    x0: w,
    y0: h,
    x1: -1,
    y1: -1,
    border: false,
  };
  flood(
    seed,
    cut,
    [w, h],
    STEPS_FOUR,
    (_i, j) => j < chin * w && old[j] === face.id,
    labels,
    new Int32Array(w * h),
  );
  const rest: Part = { id: face.id, area: 0, x0: w, y0: h, x1: -1, y1: -1, border: false };
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== -1 || old[i] !== face.id) continue;
    labels[i] = face.id;
    const [x, y] = [i % w, Math.floor(i / w)];
    rest.area++;
    rest.x0 = Math.min(rest.x0, x);
    rest.y0 = Math.min(rest.y0, y);
    rest.x1 = Math.max(rest.x1, x);
    rest.y1 = Math.max(rest.y1, y);
    rest.border ||= x === 0 || y === 0 || x === w - 1 || y === h - 1;
  }
  const parts = [...read.regions.parts.map((p) => (p.id === face.id ? rest : p)), cut];
  return { read: { ...read, regions: { labels, parts } }, face: cut };
};

interface Pixel {
  readonly c: Rgb;
  readonly x: number;
  readonly y: number;
}

const hueTurn = (lit: Hsv, shade: Hsv): number =>
  Math.abs(((shade.hue - lit.hue + 540) % 360) - 180);

const HUED = 4 / 255;

const hued = (c: Hsv): boolean => c.saturation * c.value >= HUED;

export const shadeKind = (lit: Hsv, shade: Hsv): Shading['kind'] =>
  shade.saturation < 0.6 * lit.saturation && (!hued(shade) || hueTurn(lit, shade) < 15)
    ? 'grey'
    : 'colour';

const shadingOf = (all: ReadonlyArray<Pixel>): Option.Option<Shading> => {
  const median = medianRgb(all.map((p) => p.c));
  const pixels = all.filter((p) => closerThan(p.c, median, 70));
  if (pixels.length < 40) return Option.none();
  const [first, second] = clusters(
    pixels.map((p) => p.c),
    2,
  );
  if (first === undefined || second === undefined) return Option.none();
  if (dist(first.centre, second.centre) < 12 || second.share < 0.08) return Option.none();
  const [litC, shadeC] =
    hsvOf(first.centre).value >= hsvOf(second.centre).value
      ? [first.centre, second.centre]
      : [second.centre, first.centre];
  const nearer = (p: Pixel, c: Rgb, other: Rgb) => {
    const order = orderOfSquares(distSq(p.c, c), distSq(p.c, other));
    return order < 0 || (order === 0 && dist(p.c, c) <= dist(p.c, other));
  };
  const lit = pixels.filter((p) => nearer(p, litC, shadeC));
  const shade = pixels.filter((p) => !nearer(p, litC, shadeC));
  const centre = (ps: ReadonlyArray<Pixel>) =>
    [
      ps.reduce((s, p) => s + p.x, 0) / ps.length,
      ps.reduce((s, p) => s + p.y, 0) / ps.length,
    ] as const;
  const [lx, ly] = centre(lit);
  const [sx, sy] = centre(shade);
  const across = (Math.atan2(-(sy - ly), sx - lx) * 180) / Math.PI;
  const edge = (((across + 90) % 180) + 180) % 180;
  const [litHsv, shadeHsv] = [hsvOf(litC), hsvOf(shadeC)];
  return Option.some({ lit: litHsv, shade: shadeHsv, edge, kind: shadeKind(litHsv, shadeHsv) });
};

const pixelsOf = (read: Read, ids: ReadonlySet<number>, y0: number, y1: number): Array<Pixel> => {
  const out: Array<Pixel> = [];
  for (let y = Math.max(0, Math.round(y0)); y <= Math.min(read.h - 1, Math.round(y1)); y++)
    for (let x = y % 2; x < read.w; x += 2)
      if (ids.has(read.regions.labels[y * read.w + x]!))
        out.push({ c: rgbAt(read.r, y * read.w + x), x, y });
  return out;
};

const rowExtent = (read: Read, ids: ReadonlySet<number>, y: number) => {
  const row = Math.round(y);
  let [lo, hi] = [-1, -1];
  if (row >= 0 && row < read.h)
    for (let x = 0; x < read.w; x++)
      if (ids.has(read.regions.labels[row * read.w + x]!)) {
        if (lo < 0) lo = x;
        hi = x;
      }
  return lo < 0 ? Option.none<readonly [number, number]>() : Option.some([lo, hi] as const);
};

const STEP = 40;

const fillsOf = (read: Read): Labelled => {
  const open = (i: number) => read.regions.labels[i]! >= 0;
  const step = (i: number, j: number) => closerThanAt(read.r, i, rgbAt(read.r, j), STEP);
  return label(read.w, read.h, open, false, step);
};

interface BodyRow {
  readonly y: number;
  readonly lo: number;
  readonly hi: number;
  readonly closed: boolean;
}

const bodyRows = (
  read: Read,
  fills: Labelled,
  ids: ReadonlySet<number>,
  y0: number,
  gap: number,
) => {
  const rows: Array<BodyRow> = [];
  const inkNear = (y: number, from: number, step: 1 | -1) => {
    for (let k = 1; k <= gap; k++) {
      const x = from + k * step;
      if (x < 0 || x >= read.w) return false;
      if (read.ink[y * read.w + x] === 1) return true;
    }
    return false;
  };
  for (let y = Math.max(0, Math.round(y0)); y < read.h; y++) {
    let [lo, hi] = [-1, -1];
    for (let x = 0; x < read.w; x++)
      if (ids.has(fills.labels[y * read.w + x]!)) {
        if (lo < 0) lo = x;
        hi = x;
      }
    if (lo >= 0) rows.push({ y, lo, hi, closed: inkNear(y, lo, -1) && inkNear(y, hi, 1) });
  }
  return rows;
};

const colourOf = (read: Read, fills: Labelled, p: Part): Rgb => {
  const colours: Array<Rgb> = [];
  for (let y = p.y0; y <= p.y1; y += 2)
    for (let x = p.x0; x <= p.x1; x += 2)
      if (fills.labels[y * read.w + x] === p.id) colours.push(rgbAt(read.r, y * read.w + x));
  return medianRgb(colours);
};

const widestNear = (rows: ReadonlyArray<BodyRow>, depth: number): BodyRow | undefined => {
  const bottom = rows.at(-1);
  return bottom === undefined
    ? undefined
    : rows
        .filter((q) => q.closed && q.y >= bottom.y - depth)
        .reduce<BodyRow | undefined>(
          (m, q) => (m === undefined || q.hi - q.lo > m.hi - m.lo ? q : m),
          undefined,
        );
};

const lineRuns = (read: Read, y: number, lo: number, hi: number): readonly [number, number] => {
  const runs = (from: number, step: 1 | -1) => {
    let x = from + step;
    while (x >= 0 && x < read.w && read.ink[y * read.w + x] === 1) x += step;
    return Math.abs(x - from) - 1;
  };
  return [runs(lo, -1), runs(hi, 1)];
};

const unread = (reason: string) => Result.fail(FigureUnread.make({ reason }));

interface Sink {
  readonly put: (ratio: Ratio, value: number) => void;
  readonly lacks: (ratio: Ratio, why: string) => void;
}

interface Head {
  readonly a: Part;
  readonly b: Part;
  readonly face: Part;
  readonly eyeY: number;
  readonly span: number;
  readonly speck: number;
  readonly hair: ReadonlyArray<Part>;
  readonly headIds: ReadonlySet<number>;
  readonly masses: ReadonlySet<number>;
  readonly rim: number;
  readonly hx0: number;
  readonly hy0: number;
  readonly hx1: number;
  readonly hy1: number;
  readonly W: number;
  readonly H: number;
  readonly cx: number;
  readonly cy: number;
  readonly outline: number;
  readonly outer: Outer;
  readonly chin: 'closed' | 'open';
}

interface Outer {
  readonly x0: number;
  readonly y0: number;
  readonly bw: number;
  readonly bh: number;
  readonly mask: Uint8Array;
}

const FOREIGN_FILL = 0.2;

const outerOf = (
  read: Read,
  face: Part,
  ids: ReadonlySet<number>,
  reach: number,
  plug: Option.Option<readonly [number, number, number, number]>,
): Outer => {
  const x0 = Math.max(0, Math.floor(face.x0 - reach));
  const y0 = Math.max(0, Math.floor(face.y0 - reach));
  const bw = Math.min(read.w, Math.ceil(face.x1 + reach) + 1) - x0;
  const bh = Math.min(read.h, Math.ceil(face.y1 + reach) + 1) - y0;
  const at = (i: number) => (y0 + Math.floor(i / bw)) * read.w + x0 + (i % bw);
  const plugged = Option.match(plug, {
    onNone: () => () => false,
    onSome:
      ([px0, py0, px1, py1]) =>
      (i: number) => {
        const [x, y] = [x0 + (i % bw), y0 + Math.floor(i / bw)];
        return x >= px0 && x <= px1 && y >= py0 && y <= py1;
      },
  });
  const foreign = (j: number) => {
    const id = read.regions.labels[j]!;
    return (
      id >= 0 &&
      read.mass[j] === 0 &&
      !ids.has(id) &&
      read.regions.parts[id]!.area >= FOREIGN_FILL * face.area
    );
  };
  const ground = (i: number) => {
    const j = at(i);
    return (
      !plugged(i) &&
      (foreign(j) || (!ids.has(read.regions.labels[j]!) && read.ink[j] === 0 && read.mass[j] === 0))
    );
  };
  const onBoxEdge = (i: number) => {
    const [x, y] = [i % bw, Math.floor(i / bw)];
    return x === 0 || y === 0 || x === bw - 1 || y === bh - 1;
  };
  const outside = reachFrom(
    bw,
    bh,
    (i) => (ground(i) && onBoxEdge(i)) || (!plugged(i) && foreign(at(i))),
    ground,
  );
  const fromOutside = distanceTo(bw, bh, (i) => outside[i] === 1);
  const deep = (i: number) => fromOutside[i]! > read.line * read.line;
  const core = reachFrom(bw, bh, (i) => deep(i) && read.regions.labels[at(i)] === face.id, deep);
  const fromCore = distanceTo(bw, bh, (i) => core[i] === 1);
  const mask = new Uint8Array(bw * bh);
  const near = (read.line + 1) * (read.line + 1);
  for (let i = 0; i < bw * bh; i++) mask[i] = outside[i] === 0 && fromCore[i]! <= near ? 1 : 0;
  return { x0, y0, bw, bh, mask };
};

const outerTop = (outer: Outer): number => {
  const first = outer.mask.indexOf(1);
  return outer.y0 + Math.floor(Math.max(0, first) / outer.bw);
};

const outerSides = (
  read: Read,
  outer: Outer,
  ids: ReadonlySet<number>,
  y0: number,
  y1: number,
): readonly [number, number] => {
  const outline = Math.ceil(1.5 * read.line + 2 * read.seal);
  const grain = read.line * read.line;
  const inMask = (x: number, y: number) =>
    x >= outer.x0 &&
    x < outer.x0 + outer.bw &&
    outer.mask[(y - outer.y0) * outer.bw + x - outer.x0] === 1;
  const walk = (x: number, y: number, dx: number) => {
    let [edge, run] = [x, 0];
    for (let nx = x + dx; nx >= 0 && nx < read.w && inMask(nx, y); nx += dx) {
      const i = y * read.w + nx;
      const id = read.regions.labels[i]!;
      if (ids.has(id)) run = 0;
      else if (id >= 0 && read.mass[i] === 0 && read.regions.parts[id]!.area >= grain) break;
      else run++;
      if (run > outline) break;
      edge = nx;
    }
    return edge;
  };
  let [lo, hi] = [Infinity, -Infinity];
  for (
    let y = Math.max(Math.round(y0), outer.y0);
    y < Math.min(Math.round(y1), outer.y0 + outer.bh);
    y++
  ) {
    const row = y * read.w;
    let [first, last] = [-1, -1];
    for (let x = 0; x < read.w; x++)
      if (ids.has(read.regions.labels[row + x]!)) {
        if (first < 0) first = x;
        last = x;
      }
    if (first < 0) continue;
    lo = Math.min(lo, walk(first, y, -1));
    hi = Math.max(hi, walk(last, y, 1));
  }
  return [lo, hi + 1];
};

const touching = (read: Read, of: Part): ReadonlySet<number> => {
  const { w, h, regions } = read;
  const found = new Set<number>();
  for (let y = of.y0; y <= of.y1; y++)
    for (let x = of.x0; x <= of.x1; x++) {
      if (regions.labels[y * w + x] !== of.id) continue;
      for (const [dx, dy] of STEPS) {
        const [nx, ny] = [x + dx, y + dy];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const id = regions.labels[ny * w + nx]!;
        if (id >= 0 && id !== of.id) found.add(id);
      }
    }
  return found;
};

const hairOf = (read: Read, face: Part, eyeY: number, span: number): Array<Part> => {
  const fw = widthOf(face);
  const near = (p: Part) =>
    p.x0 >= face.x0 - 0.35 * fw && p.x1 <= face.x1 + 0.35 * fw && p.y0 >= face.y0 - 0.9 * fw;
  const above = (p: Part) =>
    (widthOf(p) >= 0.3 * fw || p.y1 < face.y0 + 0.15 * heightOf(face)) &&
    cyOf(p) < eyeY &&
    p.y1 < eyeY + 0.5 * fw;
  const dark = (p: Part) => massShare(read, p) > 0.5;
  const fits = (p: Part) => !p.border && p.area >= read.line * read.line && near(p);
  const first = [...neighbours(read, face, span)]
    .map((id) => read.regions.parts[id]!)
    .filter((p) => fits(p) && (above(p) || (dark(p) && p.y0 < face.y0)));
  const taken = new Set([face.id, ...first.map((p) => p.id)]);
  const painted = [...new Set(first.filter(dark).flatMap((p) => [...touching(read, p)]))]
    .map((id) => read.regions.parts[id]!)
    .filter((p) => !taken.has(p.id) && fits(p) && above(p));
  return [...first, ...painted];
};

const sideOf = (
  parts: ReadonlyArray<Part>,
  masses: ReadonlySet<number>,
  rim: number,
  pick: (p: Part) => number,
  outward: number,
  best: (...v: Array<number>) => number,
) => {
  const edge = best(...parts.map(pick));
  const at = parts.find((p) => pick(p) === edge);
  return edge + (at !== undefined && masses.has(at.id) ? 0 : outward * rim);
};

const headOf = (
  given: Read,
): Result.Result<{ readonly head: Head; readonly read: Read }, FigureUnread> => {
  const { line, seal } = given;
  const speck = (line * line) / 4;
  const marks = given.marks.parts.filter(
    (p) => !p.border && p.area >= speck && p.area < 0.01 * given.w * given.h,
  );
  const eyes = eyesOf(given, marks);
  if (Option.isNone(eyes))
    return unread('no pair of eyes (two small upright ink ovals on one row)');
  const [a, b] = eyes.value.eyes;
  const open = openChinOf(given, eyes.value.face, [a, b]);
  const { read, face } = Option.match(open, {
    onNone: () => ({ read: given, face: eyes.value.face }),
    onSome: ({ chin, seed }) => cutAtChin(given, eyes.value.face, seed, chin),
  });
  if (face.border) return unread("the head's outline is open: its fill reaches the crop's edge");
  const eyeY = (cyOf(a) + cyOf(b)) / 2;
  const span = Math.ceil(line + 2 * seal + 3);
  const hair = hairOf(read, face, eyeY, span);
  const rim = seal + line;
  const masses = new Set(hair.filter((p) => massShare(read, p) > 0.5).map((p) => p.id));
  const parts = [face, ...hair];
  const dark = new Set([
    ...parts.map((p) => p.id),
    ...[...touching(read, face)].filter((id) => massShare(read, read.regions.parts[id]!) > 0.5),
  ]);
  const across =
    sideOf(parts, masses, rim, (p) => p.x1, 1, Math.max) +
    1 -
    sideOf(parts, masses, rim, (p) => p.x0, -1, Math.min);
  const outer = outerOf(
    read,
    face,
    dark,
    1.2 * across,
    Option.map(open, (o) => o.plug),
  );
  const hy0 = outerTop(outer);
  const hy1 = face.y1 + 1 + ((Option.isNone(open) && rim) || 0);
  const [hx0, hx1] = outerSides(read, outer, dark, hy0, hy1);
  const [cx, cy] = [(hx0 + hx1) / 2, (hy0 + hy1) / 2];
  const head: Head = {
    a,
    b,
    face,
    eyeY,
    span,
    speck,
    hair,
    headIds: new Set([face.id, ...hair.map((p) => p.id)]),
    masses,
    rim,
    hx0,
    hy0,
    hx1,
    hy1,
    W: hx1 - hx0,
    H: hy1 - hy0,
    cx,
    cy,
    outline: outlineOf(read, cx, eyeY, face),
    outer,
    chin: Option.match(open, { onNone: () => 'closed' as const, onSome: () => 'open' as const }),
  };
  return Result.succeed({ head, read });
};

const browOver = (
  read: Read,
  soft: Labelled,
  inHead: ReadonlyArray<Part>,
  eye: Part,
  eyeTop: number,
  W: number,
  taken: Option.Option<Part>,
): Option.Option<Part> => {
  const free = (p: Part) => Option.match(taken, { onNone: () => true, onSome: (t) => t !== p });
  const over = (p: Part) =>
    p.y1 < eyeTop + 0.3 * heightOf(eye) &&
    cyOf(p) > eyeTop - 0.35 * W &&
    Math.abs(cxOf(p) - cxOf(eye)) < widthOf(eye) + 0.1 * W;
  return Option.fromUndefinedOr(
    inHead
      .filter(
        (p) => free(p) && over(p) && axisLength(read, soft, p) > 1.5 * strokeOf(read, soft, p),
      )
      .sort((p, q) => Math.abs(cxOf(p) - cxOf(eye)) - Math.abs(cxOf(q) - cxOf(eye)))[0],
  );
};

const faceRatios = (read: Read, head: Head, sink: Sink): Option.Option<MouthPose> => {
  const { a, b, W } = head;
  const [sa, sb] = [markSize(read, a), markSize(read, b)];
  const spacing = cxOf(b) - cxOf(a);
  const put = (ratio: Ratio, pixels: number) =>
    sink.put(ratio, pixels / (FACE_MARKS.has(ratio) ? spacing : W));
  put('eyeWidth', (sa.width + sb.width) / 2);
  put('eyeHeight', (sa.height + sb.height) / 2);
  put('eyeSpacing', spacing);
  put('eyeBelowCentre', head.eyeY - head.cy);
  const soft = faceMarks(read, head.face, [head.hx0, head.hy0, head.hx1, head.hy1]);
  const holds = (p: Part, eye: Part) =>
    soft.labels[Math.round(cyOf(eye)) * read.w + Math.round(cxOf(eye))] === p.id;
  const inHead = soft.parts.filter(
    (p) => p.area >= head.speck && p.area < 0.05 * W * W && !holds(p, a) && !holds(p, b),
  );
  const eyeTop = Math.min(a.y0, b.y0);
  const leftBrow = browOver(read, soft, inHead, a, eyeTop, W, Option.none());
  const rightBrow = browOver(read, soft, inHead, b, eyeTop, W, leftBrow);
  const brows = [
    ...Option.toArray(Option.map(leftBrow, (brow) => ({ brow, eye: a }))),
    ...Option.toArray(Option.map(rightBrow, (brow) => ({ brow, eye: b }))),
  ];
  if (brows.length === 0) {
    sink.lacks('browLength', 'no brow over either eye');
    sink.lacks('browAbove', 'no brow over either eye');
  } else {
    put('browLength', brows.reduce((s, p) => s + axisLength(read, soft, p.brow), 0) / brows.length);
    put('browAbove', brows.reduce((s, p) => s + cyOf(p.eye) - p.brow.y0, 0) / brows.length);
  }
  const under = (p: Part) =>
    p.y0 > Math.max(a.y1, b.y1) && cxOf(p) > cxOf(a) - widthOf(a) && cxOf(p) < cxOf(b) + widthOf(b);
  return Option.match(
    Option.fromUndefinedOr(inHead.filter(under).sort((p, q) => widthOf(q) - widthOf(p))[0]),
    {
      onNone: () => {
        sink.lacks('mouthWidth', 'no mark under the eyes');
        sink.lacks('mouthBelowCentre', 'no mark under the eyes');
        return Option.none();
      },
      onSome: (mouth) => {
        put('mouthWidth', markSize(read, mouth).width);
        put('mouthBelowCentre', cyOf(mouth) - head.cy);
        const open = strokeOf(read, soft, mouth) > MOUTH_OPEN * head.outline;
        return Option.some<MouthPose>(open ? 'open' : 'closed');
      },
    },
  );
};

const faceBoxOf = (head: Head) => {
  const { a, b } = head;
  const span = cxOf(b) - cxOf(a);
  return {
    x0: a.x0 - 0.5 * span,
    y0: Math.min(a.y0, b.y0) - 0.5 * span,
    x1: b.x1 + 0.5 * span,
    y1: Math.max(a.y1, b.y1) + 1.5 * span,
  };
};

const facingOf = (read: Read, head: Head): Facing => {
  const { a, b, outer } = head;
  const eyesX = (cxOf(a) + cxOf(b)) / 2;
  const y = Math.min(read.h - 1, Math.round(Math.max(a.y1, b.y1) + 0.5 * heightOf(a)));
  const hairIds = new Set(head.hair.map((p) => p.id));
  const open = (x: number) => {
    const [ox, oy] = [x - outer.x0, y - outer.y0];
    if (
      ox < 0 ||
      oy < 0 ||
      ox >= outer.bw ||
      oy >= outer.bh ||
      outer.mask[oy * outer.bw + ox] !== 1
    )
      return false;
    const i = y * read.w + x;
    return read.ink[i] === 0 && read.mass[i] === 0 && !hairIds.has(read.regions.labels[i]!);
  };
  const skin = skinOf(read, head);
  const ends = Math.max(2, Math.round(read.line));
  const edge = (step: 1 | -1) => {
    let [at, x, onSkin] = [Math.round(eyesX), Math.round(eyesX), true];
    while (x + step >= 0 && x + step < read.w && open(x + step)) {
      x += step;
      if (onSkin && skin(rgbAt(read.r, y * read.w + x))) at = x;
      else if (onSkin && Math.abs(x - at) >= ends) onSkin = false;
    }
    return Math.abs(x - at) <= RIM_MOST_OF_HEAD * head.W ? x : at;
  };
  const [lo, hi] = [edge(-1), edge(1)];
  const turn = hi > lo ? (eyesX - (lo + hi + 1) / 2) / (hi - lo + 1) : 0;
  const roll = (Math.atan2(cyOf(b) - cyOf(a), cxOf(b) - cxOf(a)) * 180) / Math.PI;
  return { turn, roll, eyes: Math.hypot(cxOf(b) - cxOf(a), cyOf(b) - cyOf(a)) };
};

const SKIN_LIT = 36;
const RIM_MOST_OF_HEAD = 0.1;
const SKIN_SHADE = 90;

const skinOf = (read: Read, head: Head): ((c: Rgb) => boolean) => {
  const { a, b, face } = head;
  const [x0, x1] = [Math.min(a.x1, b.x1) + 1, Math.max(a.x0, b.x0) - 1];
  const [y0, y1] = [Math.max(a.y0, b.y0), Math.min(a.y1, b.y1)];
  const between: Array<Rgb> = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * read.w + x;
      if (read.regions.labels[i] === face.id && read.ink[i] === 0 && read.mass[i] === 0)
        between.push(rgbAt(read.r, i));
    }
  const lit = medianRgb(
    between.length > 0
      ? between
      : pixelsOf(read, new Set([face.id]), head.eyeY, head.eyeY + 0.1 * head.W).map((p) => p.c),
  );
  const luma = lumaOf(lit);
  return (c) => {
    const d = dist(c, lit);
    return d <= SKIN_LIT || (d <= SKIN_SHADE && lumaOf(c) < luma - 8);
  };
};

const BEARD_SHARE = 0.3;
const EDGE_ROWS = 3;

const hairBeardOf = (read: Read, head: Head): Option.Option<HairBeard> => {
  const { a, b, outer } = head;
  const spacing = cxOf(b) - cxOf(a);
  const skin = skinOf(read, head);
  const off = Math.ceil(head.outline);
  const inside = (x: number, y: number) => {
    const [ox, oy] = [x - outer.x0, y - outer.y0];
    return (
      ox >= 0 && oy >= 0 && ox < outer.bw && oy < outer.bh && outer.mask[oy * outer.bw + ox] === 1
    );
  };
  const deep = (x: number, y: number) =>
    inside(x, y) &&
    inside(x - off, y) &&
    inside(x + off, y) &&
    inside(x, y - off) &&
    inside(x, y + off);
  const fillIn = (x0: number, x1: number, y0: number, y1: number) => {
    const fill: Array<Rgb> = [];
    let all = 0;
    for (let y = Math.max(0, Math.round(y0)); y <= Math.min(read.h - 1, Math.round(y1)); y++)
      for (let x = Math.max(0, Math.round(x0)); x <= Math.min(read.w - 1, Math.round(x1)); x++) {
        if (!deep(x, y)) continue;
        all++;
        const i = y * read.w + x;
        const c = rgbAt(read.r, i);
        if (read.ink[i] === 0 && !skin(c)) fill.push(c);
      }
    return { fill, all };
  };
  const [beardTop, beardBottom] = [head.eyeY + 0.8 * spacing, head.eyeY + 2.2 * spacing];
  const hair = fillIn(outer.x0, outer.x0 + outer.bw - 1, outer.y0, head.eyeY + 0.5 * spacing);
  const beard = fillIn(a.x0, b.x1, beardTop, beardBottom);
  if (hair.fill.length === 0 || beard.all === 0 || beard.fill.length < BEARD_SHARE * beard.all)
    return Option.none();
  const line = Math.max(2, Math.round(read.line));
  const valueAt = (x: number, y: number) => hsvOf(rgbAt(read.r, y * read.w + x)).value;
  const rowEdge = (y: number, x0: number, step: 1 | -1): Option.Option<number> => {
    const values: Array<number> = [];
    for (let x = x0; deep(x, y); x += step) {
      if (skin(rgbAt(read.r, y * read.w + x))) return Option.none();
      values.push(valueAt(x, y));
    }
    const mean = (i0: number, i1: number) =>
      values.slice(i0, i1).reduce((s, v) => s + v, 0) / (i1 - i0);
    let edge = 0;
    for (let i = 2 * line; i + 2 * line <= values.length; i++) {
      const darkest = Math.min(...values.slice(i - line, i + line));
      edge = Math.max(
        edge,
        Math.min(mean(i - 2 * line, i - line), mean(i + line, i + 2 * line)) - darkest,
      );
    }
    return values.length < 4 * line ? Option.none() : Option.some(edge);
  };
  const sideEdge = (x0: number, step: 1 | -1): Option.Option<number> => {
    const rows: Array<number> = [];
    for (let y = Math.max(0, Math.round(beardTop)); y <= Math.min(read.h - 1, beardBottom); y++)
      rows.push(...Option.toArray(rowEdge(y, Math.round(x0), step)));
    rows.sort((p, q) => p - q);
    return Option.filter(
      Option.fromUndefinedOr(rows[Math.floor(rows.length / 2)]),
      () => rows.length >= EDGE_ROWS,
    );
  };
  const edges = [...Option.toArray(sideEdge(a.x0, -1)), ...Option.toArray(sideEdge(b.x1, 1))];
  return Option.some({
    hair: hsvOf(medianRgb(hair.fill)),
    beard: hsvOf(medianRgb(beard.fill)),
    ...((edges.length > 0 && { edge: Math.max(...edges) }) || {}),
  });
};

const innerParts = (read: Read, head: Head): Array<Part> => {
  const { hair, face, span } = head;
  const reach = 0.3 * head.W;
  const within = (p: Part) =>
    p.x0 >= head.hx0 - reach &&
    p.x1 <= head.hx1 + reach &&
    p.y0 >= head.hy0 - reach &&
    p.y1 <= head.hy1;
  return [
    ...new Set([
      face.id,
      ...hair.flatMap((p) => [p.id, ...neighbours(read, p, span)]),
      ...neighbours(read, face, span),
    ]),
  ]
    .map((id) => read.regions.parts[id]!)
    .filter((p) => !p.border && p.area >= read.line * read.line && within(p));
};

const hairRatios = (read: Read, head: Head, sink: Sink, rims: boolean): Array<number> => {
  const { hair, masses, W, span } = head;
  const lightHair = hair.filter((p) => !masses.has(p.id));
  if (hair.length > 0 && lightHair.length === 0)
    sink.lacks('interiorInk', 'the hair is as dark as the ink, so a line along it does not show');
  else
    sink.put(
      'interiorInk',
      interiorInk(read, head.face, new Set(lightHair.map((p) => p.id)), span) / W,
    );
  if (rims) sink.put('innerRim', innerRim(read, innerParts(read, head), W) / W);
  else sink.lacks('innerRim', 'a lean read reads no rims');
  return headRadii(head.outer, [head.cx, head.cy], W, span);
};

const dominantFill = (read: Read, fills: Labelled, head: Head): number => {
  const { W, cx, hy1, headIds } = head;
  const votes = new Map<number, number>();
  const [x0, x1] = [Math.max(0, Math.round(cx - 0.4 * W)), Math.min(read.w - 1, cx + 0.4 * W)];
  for (let y = Math.round(hy1 + 0.05 * W); y <= Math.min(read.h - 1, hy1 + 0.35 * W); y += 2)
    for (let x = x0; x <= x1; x += 2) {
      const id = fills.labels[y * read.w + x]!;
      if (id >= 0 && !headIds.has(read.regions.labels[y * read.w + x]!))
        votes.set(id, (votes.get(id) ?? 0) + 1);
    }
  const [dominant] = [...votes].reduce<readonly [number, number]>(
    (top, v) => (v[1] > top[1] ? v : top),
    [-1, 0],
  );
  return dominant;
};

const ownColours = (
  read: Read,
  fills: Labelled,
  rows: ReadonlyArray<BodyRow>,
  dominant: number,
): Array<Rgb> =>
  clusters(
    rows.flatMap((row) =>
      Array.from({ length: Math.floor((row.hi - row.lo) / 3) }, (_, k) => row.lo + 3 * k)
        .filter((x) => fills.labels[row.y * read.w + x] === dominant)
        .map((x) => rgbAt(read.r, row.y * read.w + x)),
    ),
    3,
  )
    .filter((c, k) => k === 0 || c.share >= 0.15)
    .map((c) => c.centre);

const frontUnder = (read: Read, bottom: BodyRow, lineY: number, gap: number) =>
  Option.match(
    regionNear(read, (bottom.lo + bottom.hi) / 2, lineY + read.line + read.seal + 1, gap),
    {
      onNone: () => false,
      onSome: (p) => !p.border && widthOf(p) >= bottom.hi - bottom.lo + 1,
    },
  );

const hemmed = (read: Read, rows: ReadonlyArray<BodyRow>, W: number, gap: number) => {
  const bottom = rows.at(-1);
  const base = widestNear(rows, 0.15 * W);
  if (bottom === undefined || base === undefined) return false;
  let [lineY, most] = [-1, 0];
  for (let y = bottom.y + 1; y <= Math.min(read.h - 1, bottom.y + gap); y++) {
    let count = 0;
    for (let x = bottom.lo; x <= bottom.hi; x++) count += read.ink[y * read.w + x]!;
    if (count > most) [lineY, most] = [y, count];
  }
  if (lineY < 0 || most < 0.8 * (bottom.hi - bottom.lo + 1)) return false;
  const [left, right] = lineRuns(read, lineY, bottom.lo, bottom.hi);
  const [x0, x1] = [bottom.lo - left, bottom.hi + right];
  const ends = Math.max(base.lo - x0, x1 - base.hi) <= 0.6 * W && x0 > 0 && x1 < read.w - 1;
  return ends && !frontUnder(read, bottom, lineY, gap);
};

const fillsBelow = (
  read: Read,
  fills: Labelled,
  ids: ReadonlySet<number>,
  rows: ReadonlyArray<BodyRow>,
  own: ReadonlyArray<Rgb>,
  W: number,
): Array<Part> => {
  const last = rows.at(-1);
  if (last === undefined) return [];
  const wide = rows.filter((q) => q.closed).at(-1);
  const span = wide === undefined ? W : wide.hi - wide.lo + 1;
  const under = (p: Part) =>
    p.y0 > last.y &&
    p.y0 <= last.y + 0.6 * W &&
    p.x1 >= last.lo - 0.2 * W &&
    p.x0 <= last.hi + 0.2 * W;
  return fills.parts.filter(
    (p) =>
      !ids.has(p.id) &&
      !p.border &&
      under(p) &&
      widthOf(p) >= 0.5 * span &&
      own.some((t) => dist(colourOf(read, fills, p), t) < 45),
  );
};

const bodyRowsOf = (read: Read, fills: Labelled, dominant: number, head: Head, gap: number) => {
  const ids = new Set([dominant]);
  const own = ownColours(read, fills, bodyRows(read, fills, ids, head.hy1, gap), dominant);
  let rows = bodyRows(read, fills, ids, head.hy1, gap);
  for (;;) {
    const below = fillsBelow(read, fills, ids, rows, own, head.W);
    if (below.length === 0) break;
    for (const p of below) ids.add(p.id);
    rows = bodyRows(read, fills, ids, head.hy1, gap);
  }
  return { rows, ids };
};

const bodyWidths = (rows: ReadonlyArray<BodyRow>, head: Head, edge: number, sink: Sink) => {
  for (const [ratio, depth] of [
    ['bodyUnderChin', 0.1],
    ['body35', 0.35],
    ['body70', 0.7],
  ] as const) {
    const row = rows.find((q) => q.y === Math.round(head.hy1 + depth * head.W));
    if (row?.closed === true) sink.put(ratio, (row.hi - row.lo + 1 + 2 * edge) / head.W);
    else
      sink.lacks(ratio, `the body does not show, or is hidden, ${depth} of a head under the chin`);
  }
};

const SHADE_OFF_GROUND = 3;

const bodyShadingOf = (
  read: Read,
  fills: Labelled,
  ids: ReadonlySet<number>,
  rows: ReadonlyArray<BodyRow>,
) => {
  const body = (i: number) => ids.has(fills.labels[i]!);
  const offBody = distanceTo(read.w, read.h, (i) => !body(i));
  const pixels: Array<Pixel> = [];
  for (const row of rows)
    for (let x = row.lo + (row.y % 2); x <= row.hi; x += 2) {
      const i = row.y * read.w + x;
      if (body(i) && offBody[i]! >= SHADE_OFF_GROUND ** 2)
        pixels.push({ c: rgbAt(read.r, i), x, y: row.y });
    }
  return shadingOf(pixels);
};

const bodyEdgesOf = (rows: ReadonlyArray<BodyRow>, head: Head, edge: number): Array<BodyEdge> => {
  const every = Math.max(1, Math.round(0.05 * head.W));
  const first = rows[0]?.y ?? 0;
  return rows
    .filter((row) => row.closed && (row.y - first) % every === 0)
    .map((row) => ({
      y: (row.y - head.cy) / head.W,
      left: (row.lo - edge - head.cx) / head.W,
      right: (row.hi + 1 + edge - head.cx) / head.W,
    }));
};

const footOf = (read: Read, bottom: BodyRow, base: BodyRow, outline: number): number => {
  const inked = (y: number) => {
    for (let x = base.lo - Math.round(outline); x <= base.hi + outline; x++)
      if (x >= 0 && x < read.w && read.ink[y * read.w + x] === 1) return true;
    return false;
  };
  let foot = bottom.y;
  while (foot + 1 < read.h && inked(foot + 1)) foot++;
  return foot;
};

const feetInk = (read: Read, base: BodyRow, from: number, foot: number, W: number) => {
  const [lo, hi] = [
    Math.max(0, Math.round(base.lo - W / 3)),
    Math.min(read.w - 1, Math.round(base.hi + W / 3)),
  ];
  let [fx0, fx1] = [read.w, -1];
  for (let y = from; y <= foot; y++)
    for (let x = lo; x <= hi; x++)
      if (read.ink[y * read.w + x] === 1) [fx0, fx1] = [Math.min(fx0, x), Math.max(fx1, x)];
  return fx1 < 0 ? Option.none() : Option.some([fx0, fx1] as const);
};

const feetRatios = (
  read: Read,
  rows: ReadonlyArray<BodyRow>,
  head: Head,
  gap: number,
  sink: Sink,
): Option.Option<PixelBox> => {
  const { W } = head;
  const bottom = rows.at(-1)!;
  const base = widestNear(rows, 0.15 * W);
  if (!hemmed(read, rows, W, gap) || base === undefined) {
    sink.lacks('hem', 'a line runs on past the body at its lowest row: it stands behind something');
    for (const ratio of ['heightInHeads', 'feetWidth', 'feetHeight'] as const)
      sink.lacks(ratio, 'its feet are hidden');
    return Option.none();
  }
  sink.put('hem', (base.hi - base.lo + 1 + 2 * (read.seal + head.outline)) / W);
  const foot = footOf(read, bottom, base, head.outline);
  sink.put('heightInHeads', (foot + 1 - head.hy0) / head.H);
  const ink = feetInk(read, base, bottom.y + gap + 1, foot, W);
  if (Option.isNone(ink)) {
    const why =
      bottom.y + gap + 0.2 * W >= read.h
        ? "its feet would lie past the crop's edge"
        : 'no feet under the hem';
    sink.lacks('feetWidth', why);
    sink.lacks('feetHeight', why);
    return Option.none();
  }
  const [fx0, fx1] = ink.value;
  sink.put('feetWidth', (fx1 + 1 - fx0) / W);
  sink.put('feetHeight', (foot + 1 - bottom.y) / W);
  return Option.some([
    (fx0 - head.cx) / W,
    (bottom.y - head.cy) / W,
    (fx1 + 1 - head.cx) / W,
    (foot + 1 - head.cy) / W,
  ] as const);
};

const BODY_RATIOS = [
  'bodyUnderChin',
  'body35',
  'body70',
  'hem',
  'heightInHeads',
  'feetWidth',
  'feetHeight',
] as const;

interface BodyRead {
  readonly shading: () => Option.Option<Shading>;
  readonly edges: ReadonlyArray<BodyEdge>;
  readonly feet: Option.Option<PixelBox>;
  readonly lowest: number;
}

const bodyOf = (read: Read, head: Head, sink: Sink): BodyRead => {
  const fills = fillsOf(read);
  const dominant = dominantFill(read, fills, head);
  if (dominant < 0 || fills.parts[dominant]!.border) {
    const why = dominant < 0 ? 'no body under the chin' : "the body's fill reaches the crop's edge";
    for (const ratio of BODY_RATIOS) sink.lacks(ratio, why);
    return { shading: () => Option.none(), edges: [], feet: Option.none(), lowest: read.h };
  }
  const gap = read.line + 2;
  const { rows, ids } = bodyRowsOf(read, fills, dominant, head, gap);
  const edge = read.seal + head.outline;
  bodyWidths(rows, head, edge, sink);
  return {
    shading: () => bodyShadingOf(read, fills, ids, rows),
    edges: bodyEdgesOf(rows, head, edge),
    feet: feetRatios(read, rows, head, gap, sink),
    lowest: rows.at(-1)!.y,
  };
};

const handRatios = (read: Read, head: Head, lowest: number, sink: Sink) => {
  const { W } = head;
  const handLike = (p: Part) => {
    const d = (widthOf(p) + heightOf(p)) / 2;
    const aspect = widthOf(p) / heightOf(p);
    const round = p.area / ((Math.PI / 4) * widthOf(p) * heightOf(p));
    return aspect > 0.8 && aspect < 1.25 && round > 0.85 && d > 0.15 * W && d < 0.8 * W;
  };
  const hands = read.regions.parts.filter(
    (p) =>
      !head.headIds.has(p.id) &&
      !p.border &&
      p.y0 > head.hy0 &&
      p.y1 < lowest + 0.3 * W &&
      handLike(p),
  );
  if (hands.length === 0) sink.lacks('hand', 'no round hand beside the body');
  else
    sink.put(
      'hand',
      hands.reduce((s, p) => s + (widthOf(p) + heightOf(p)) / 2 + 2 * head.rim, 0) /
        hands.length /
        W,
    );
};

export type FigureRead = Omit<
  FigureMeasure,
  'headShading' | 'bodyShading' | 'artifacts' | 'hairBeard'
>;

const readWith = (crop: Raster, rims: boolean) => {
  const maybe = readCrop(crop);
  if (Option.isNone(maybe)) return unread('no dark warm ink in it');
  return Result.map(headOf(maybe.value), ({ head, read }) => {
    const found = new Map<Ratio, number>();
    const missing: Array<Unmeasured> = [];
    const sink: Sink = {
      put: (ratio, value) => found.set(ratio, value),
      lacks: (ratio, why) => missing.push({ ratio, why }),
    };
    const { W } = head;
    sink.put('headHeight', head.H / W);
    sink.put('outline', head.outline / W);
    Option.match(rowExtent(read, new Set([head.face.id]), head.hy1 - 0.2 * W), {
      onNone: () => sink.lacks('jaw', 'no head 0.2 of a head above the chin'),
      onSome: ([lo, hi]) => sink.put('jaw', (hi - lo + 1 + 2 * head.rim) / W),
    });
    const mouth = faceRatios(read, head, sink);
    const radii = hairRatios(read, head, sink, rims);
    const body = bodyOf(read, head, sink);
    handRatios(read, head, body.lowest, sink);
    const figure: FigureRead = {
      head: [head.hx0, head.hy0, head.hx1, head.hy1] as const,
      ink: read.inkColour,
      ratios: RATIOS.flatMap((ratio) => {
        const value = found.get(ratio);
        return value === undefined ? [] : [{ ratio, value }];
      }),
      silhouette: {
        head: radii,
        body: body.edges,
        ...Option.match(body.feet, { onNone: () => ({}), onSome: (feet) => ({ feet }) }),
      },
      ...Option.match(mouth, { onNone: () => ({}), onSome: (pose) => ({ mouth: pose }) }),
      facing: facingOf(read, head),
      ...((head.chin === 'open' && { chin: 'open' as const }) || {}),
      missing,
    };
    return { figure, read, head, body };
  });
};

const artifactsOf = (read: Read, head: Head) => {
  const inkColoured = new Uint8Array(read.ink.length);
  for (let i = 0; i < inkColoured.length; i++)
    inkColoured[i] = closerThanAt(read.r, i, read.inkColour, INK_NEAR) ? 1 : 0;
  return headArtifacts({
    raster: read.r,
    ink: inkColoured,
    head: head.outer,
    face: faceBoxOf(head),
    line: read.line,
  });
};

export const readFigure = (crop: Raster): Result.Result<FigureRead, FigureUnread> =>
  Result.map(readWith(crop, false), (r) => r.figure);

export const measureFigure = (crop: Raster): Result.Result<FigureMeasure, FigureUnread> =>
  Result.map(readWith(crop, true), ({ figure, read, head, body }) => {
    const skin = skinOf(read, head);
    const chin = Math.min(head.hy1, faceBoxOf(head).y1);
    const headShading = shadingOf(
      pixelsOf(read, new Set([head.face.id]), head.eyeY + 0.1 * head.W, chin).filter((p) =>
        skin(p.c),
      ),
    );
    const { mouth, facing, missing, ...lines } = figure;
    return {
      ...lines,
      ...Option.match(headShading, { onNone: () => ({}), onSome: (s) => ({ headShading: s }) }),
      ...Option.match(body.shading(), { onNone: () => ({}), onSome: (s) => ({ bodyShading: s }) }),
      ...Option.match(Option.fromUndefinedOr(mouth), {
        onNone: () => ({}),
        onSome: (pose) => ({ mouth: pose }),
      }),
      facing,
      artifacts: artifactsOf(read, head),
      ...Option.match(hairBeardOf(read, head), {
        onNone: () => ({}),
        onSome: (hairBeard) => ({ hairBeard }),
      }),
      missing,
    };
  });

const reachFrom = (
  w: number,
  h: number,
  seed: (i: number) => boolean,
  admit: (j: number) => boolean,
  most = Number.POSITIVE_INFINITY,
): Uint8Array => {
  const reached = new Uint8Array(w * h);
  const steps = new Int32Array(w * h);
  const queue = new Int32Array(w * h);
  let end = 0;
  for (let i = 0; i < w * h; i++)
    if (seed(i)) {
      reached[i] = 1;
      queue[end++] = i;
    }
  for (let q = 0; q < end; q++) {
    const i = queue[q]!;
    if (steps[i]! >= most) continue;
    const x = i % w;
    const y = (i - x) / w;
    for (let s = 0; s < STEPS.length; s++) {
      const nx = x + STEPS[s]![0];
      const ny = y + STEPS[s]![1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (reached[j] === 1 || !admit(j)) continue;
      reached[j] = 1;
      steps[j] = steps[i]! + 1;
      queue[end++] = j;
    }
  }
  return reached;
};

const headRadii = (
  outer: Outer,
  centre: readonly [number, number],
  W: number,
  span: number,
): Array<number> => {
  const [cx, cy] = centre;
  const { x0, y0, bw, bh, mask } = outer;
  const reach = 1.2 * W;
  const inHead = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < bw && y < bh && mask[y * bw + x] === 1;
  return Array.from({ length: HEAD_RADII }, (_, k) => {
    const angle = (2 * Math.PI * k) / HEAD_RADII;
    const [dx, dy] = [Math.sin(angle), -Math.cos(angle)];
    let [last, gap] = [0, 0];
    for (let t = 0; t <= reach && gap <= 2 * span; t += 0.5) {
      if (inHead(Math.round(cx + dx * t) - x0, Math.round(cy + dy * t) - y0)) [last, gap] = [t, 0];
      else gap += 0.5;
    }
    return (last + 0.5) / W;
  });
};

const RIM_LIFT = 10;

const smallMarks = (read: Read, W: number): ((i: number) => boolean) => {
  const { regions, line } = read;
  const rings = (m: Part) =>
    regions.parts.some(
      (p) =>
        !p.border &&
        p.area >= line * line &&
        p.x0 > m.x0 &&
        p.x1 < m.x1 &&
        p.y0 > m.y0 &&
        p.y1 < m.y1,
    );
  const small = new Set(
    read.marks.parts.filter((p) => p.area < 0.05 * W * W && !rings(p)).map((p) => p.id),
  );
  return (i) => small.has(read.marks.labels[i]!);
};

interface RimMaps {
  readonly nearOuter: Float64Array;
  readonly nearInner: Float64Array;
  readonly nearMark: Float64Array;
}

const rimMaps = (read: Read, W: number): RimMaps => {
  const { w, h, regions, line, seal } = read;
  const ground = new Set(regions.parts.filter((p) => p.border).map((p) => p.id));
  const darkest = lumaOf(read.inkColour) + 40;
  const dark = (i: number) =>
    read.ink[i] === 1 || read.mass[i] === 1 || lumaOf(rgbAt(read.r, i)) <= darkest;
  const nearGround = distanceTo(w, h, (i) => ground.has(regions.labels[i]!));
  const edge = (seal + 1.5) ** 2;
  const reached = reachFrom(w, h, (i) => nearGround[i]! <= edge, dark, 3 * line + seal);
  const isMark = smallMarks(read, W);
  return {
    nearOuter: distanceTo(w, h, (i) => reached[i] === 1 && dark(i)),
    nearInner: distanceTo(w, h, (i) => reached[i] === 0 && dark(i) && !isMark(i)),
    nearMark: distanceTo(w, h, isMark),
  };
};

interface PartBox {
  readonly bw: number;
  readonly bh: number;
  readonly at: (x: number, y: number) => number;
  readonly own: (x: number, y: number) => boolean;
  readonly deepAt: (x: number, y: number) => number;
}

const partBox = (read: Read, part: Part): PartBox => {
  const { w, h, regions } = read;
  const [x0, y0] = [Math.max(0, part.x0 - 1), Math.max(0, part.y0 - 1)];
  const [bw, bh] = [Math.min(w, part.x1 + 2) - x0, Math.min(h, part.y1 + 2) - y0];
  const at = (x: number, y: number) => (y0 + y) * w + x0 + x;
  const own = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < bw && y < bh && regions.labels[at(x, y)] === part.id;
  const depth = distanceTo(bw, bh, (j) => !own(j % bw, Math.floor(j / bw)));
  const deepAt = (x: number, y: number) =>
    Math.sqrt(depth[Math.min(bh - 1, Math.max(0, y)) * bw + Math.min(bw - 1, Math.max(0, x))]!);
  return { bw, bh, at, own, deepAt };
};

const inwardOf = (box: PartBox, x: number, y: number, band: number): Option.Option<number> => {
  const { own, deepAt, at } = box;
  const [gx, gy] = [deepAt(x + 1, y) - deepAt(x - 1, y), deepAt(x, y + 1) - deepAt(x, y - 1)];
  const norm = Math.hypot(gx, gy);
  if (norm === 0) return Option.none();
  let [qx, qy] = [x, y];
  for (let k = 1; k <= band + 2; k++) {
    const [sx, sy] = [Math.round(x + (gx / norm) * k), Math.round(y + (gy / norm) * k)];
    if (!own(sx, sy) || deepAt(sx, sy) < deepAt(qx, qy)) break;
    [qx, qy] = [sx, sy];
  }
  return deepAt(qx, qy) < deepAt(x, y) + 1.5 ? Option.none() : Option.some(at(qx, qy));
};

const rimPixel = (
  read: Read,
  box: PartBox,
  maps: RimMaps,
  band: number,
  x: number,
  y: number,
): boolean => {
  const d = box.deepAt(x, y);
  if (!box.own(x, y) || d < 1.5 || d > band) return false;
  const i = box.at(x, y);
  if (maps.nearInner[i]! >= maps.nearOuter[i]! || maps.nearMark[i]! <= maps.nearInner[i]!)
    return false;
  return Option.match(inwardOf(box, x, y, band), {
    onNone: () => false,
    onSome: (j) => lumaOf(rgbAt(read.r, i)) - lumaOf(rgbAt(read.r, j)) > RIM_LIFT,
  });
};

const innerRim = (read: Read, parts: ReadonlyArray<Part>, W: number): number => {
  const band = Math.max(3, Math.round(0.05 * W));
  const maps = rimMaps(read, W);
  let count = 0;
  for (const part of parts) {
    const box = partBox(read, part);
    for (let y = 0; y < box.bh; y++)
      for (let x = 0; x < box.bw; x++) if (rimPixel(read, box, maps, band, x, y)) count++;
  }
  return count / Math.max(1, band - 1.5);
};

const interiorInk = (
  read: Read,
  face: Part,
  hairIds: ReadonlySet<number>,
  span: number,
): number => {
  if (hairIds.size === 0) return 0;
  const { w, h, ink, regions } = read;
  const nearFace = distanceTo(w, h, (i) => regions.labels[i] === face.id);
  const nearHair = distanceTo(w, h, (i) => hairIds.has(regions.labels[i]!));
  const within = span * span;
  let count = 0;
  for (let i = 0; i < w * h; i++)
    if (ink[i] === 1 && nearFace[i]! <= within && nearHair[i]! <= within) count++;
  return count / Math.max(1, read.line);
};
