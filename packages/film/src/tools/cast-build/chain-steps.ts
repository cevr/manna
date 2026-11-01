// The clip chain's pure steps (`chain.ts` runs them on a read clip): the
// cut into runs, the gate and One Euro filter on a run's angles, the keys
// a fit is run at, the corrections carried between keys, the figure and
// its IoU, and each band's report. Pure: no file, process or clock.

import { Schema } from 'effect';
import type { Raster } from '../../core/raster.ts';

type Pt = readonly [number, number];

/** The chain's settings; its cache keys and the `eval:clip` stage's config name them. */
export const CHAIN = {
  gate: 0.1,
  minCutoff: 0.1,
  beta: 0.3,
  dCutoff: 1,
  fps: 24,
  every: 16,
  seedConfidence: 0.5,
  figure: 24,
} as const;

const Joint = Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite]);
export const Angles = Schema.Record(Schema.String, Schema.Finite);

/** read.py's JSON with `--all-probs`: every class's probability and each of the member's drawings' world angles, per frame. */
export const ClipRead = Schema.Struct({
  classes: Schema.Array(Schema.String),
  frames: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      joints: Schema.Record(Schema.String, Joint),
      probs: Angles,
      worlds: Schema.Record(Schema.String, Angles),
    }),
  ),
});
export interface ClipRead extends Schema.Schema.Type<typeof ClipRead> {}
export const ClipReadJson = Schema.fromJsonString(ClipRead);

/** A stretch of frames `[from, to)` naming one drawing (`<member>/<entry>`). */
export interface Run {
  readonly from: number;
  readonly to: number;
  readonly drawing: string;
}

/** Each bone's end joint: its confidence gates the bone's angle. */
export const END = new Map<string, string>([
  ['lean', 'neckBase'],
  ['neck', 'chin'],
  ['head', 'crown'],
  ['shoulderRight', 'elbowR'],
  ['elbowRight', 'wristR'],
  ['wristRight', 'handR'],
  ['shoulderLeft', 'elbowL'],
  ['elbowLeft', 'wristL'],
  ['wristLeft', 'handL'],
]);

/** Degrees wrapped to [-180, 180). */
export const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

/** Each frame's drawing (the member's most likely, the first in class order on a tie) and the runs they make. */
export const cutOf = (read: ClipRead, member: string) => {
  const own = read.classes.filter((c) => c.startsWith(`${member}/`));
  const named = read.frames.map((fr) => {
    let best = own[0] ?? '';
    let p = -Infinity;
    for (const c of own) {
      const v = fr.probs[c] ?? -Infinity;
      if (v > p) [best, p] = [c, v];
    }
    return { drawing: best, p };
  });
  const runs: Array<{ -readonly [K in keyof Run]: Run[K] }> = [];
  named.forEach(({ drawing }, f) => {
    const last = runs.at(-1);
    if (last?.drawing === drawing) last.to = f + 1;
    else runs.push({ from: f, to: f + 1, drawing });
  });
  const out: ReadonlyArray<Run> = runs;
  return { named, runs: out };
};

/** While `conf` is under `t`, the last angle read with confidence holds; before any, the read stands. */
export const gate = (x: ReadonlyArray<number>, conf: ReadonlyArray<number>, t: number) => {
  const y = [...x];
  let good: number | undefined;
  for (let i = 0; i < y.length; i++) {
    if (conf[i]! >= t) good = y[i];
    else if (good !== undefined) y[i] = good;
  }
  return y;
};

/** `x` (degrees) unwrapped: each step taken the short way round, as numpy's `unwrap` does on radians. */
const unwrap = (x: ReadonlyArray<number>) => {
  const r = x.map((d) => (d * Math.PI) / 180);
  const out = [r[0]!];
  let shift = 0;
  for (let i = 1; i < r.length; i++) {
    const dd = r[i]! - r[i - 1]!;
    let mod = ((((dd + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    if (mod === -Math.PI && dd > 0) mod = Math.PI;
    if (Math.abs(dd) >= Math.PI) shift += mod - dd;
    out.push(r[i]! + shift);
  }
  return out.map((v) => (v * 180) / Math.PI);
};

/** The causal One Euro filter on unwrapped degrees, wrapped back. */
export const oneEuro = (x: ReadonlyArray<number>, c = CHAIN) => {
  const u = unwrap(x);
  const te = 1 / c.fps;
  const alpha = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff) / te);
  const y = [u[0]!];
  let d = 0;
  for (let t = 1; t < u.length; t++) {
    d += alpha(c.dCutoff) * ((u[t]! - u[t - 1]!) * c.fps - d);
    const a = alpha(c.minCutoff + c.beta * Math.abs(d));
    y.push(y[t - 1]! + a * (u[t]! - y[t - 1]!));
  }
  return y.map(wrap);
};

/** The frames route A fits: every `every`th of each run and its last. */
export const keysOf = (runs: ReadonlyArray<Run>, every: number = CHAIN.every) =>
  [
    ...new Set(
      runs.flatMap(({ from, to }) => [
        ...Array.from({ length: Math.ceil((to - from) / every) }, (_, i) => from + i * every),
        to - 1,
      ]),
    ),
  ].toSorted((a, b) => a - b);

/** A fit's correction: its numbers (wrapped), root and scale less the seed's. */
export interface Correction {
  readonly numbers: Readonly<Record<string, number>>;
  readonly root: Pt;
  readonly scale: number;
}

const lerp = (a: Correction, b: Correction, u: number): Correction => ({
  numbers: Object.fromEntries(
    Object.entries(a.numbers).map(([k, v]) => [k, v + u * wrap((b.numbers[k] ?? 0) - v)]),
  ),
  root: [a.root[0] + u * (b.root[0] - a.root[0]), a.root[1] + u * (b.root[1] - a.root[1])],
  scale: a.scale + u * (b.scale - a.scale),
});

/** Each frame's correction: its run's keys' corrections, carried linearly between them. */
export const carried = (
  runs: ReadonlyArray<Run>,
  keys: ReadonlyArray<number>,
  at: ReadonlyMap<number, Correction>,
): ReadonlyArray<Correction> =>
  runs.flatMap(({ from, to }) => {
    const ks = keys.filter((k) => k >= from && k < to);
    return Array.from({ length: to - from }, (_, i) => {
      const f = from + i;
      const lo = ks.findLast((k) => k <= f);
      const hi = ks.find((k) => k >= f);
      if (lo === undefined) return at.get(hi!)!;
      if (hi === undefined || hi === lo) return at.get(lo)!;
      return lerp(at.get(lo)!, at.get(hi)!, (f - lo) / (hi - lo));
    });
  });

/** A frame's paper: the mean of its four corners. */
export const paperOf = (t: Raster): [number, number, number] => {
  const at = [0, t.width - 1, (t.height - 1) * t.width, t.height * t.width - 1];
  const c = (k: number) => at.reduce((s, i) => s + t.rgba[i * 4 + k]!, 0) / 4;
  return [c(0), c(1), c(2)];
};

/** A frame's figure: each pixel whose RGB distance (L1) to the paper is over `threshold`. */
export const figureOf = (t: Raster, threshold: number = CHAIN.figure) => {
  const paper = paperOf(t);
  const m = new Uint8Array(t.width * t.height);
  for (let i = 0; i < m.length; i++) {
    let d = 0;
    for (let c = 0; c < 3; c++) d += Math.abs(t.rgba[i * 4 + c]! - paper[c]!);
    m[i] = d > threshold ? 1 : 0;
  }
  return m;
};

/** The IoU of a figure mask and a drawn raster's alpha over 127 (1 when both are empty). */
export const iouOf = (mask: Uint8Array, drawn: Raster) => {
  let i = 0;
  let u = 0;
  for (let k = 0; k < mask.length; k++) {
    const a = mask[k] === 1;
    const b = drawn.rgba[k * 4 + 3]! > 127;
    if (a && b) i++;
    if (a || b) u++;
  }
  return u ? i / u : 1;
};

/** A band of frames, inclusive: `[first, last]`. */
export type Band = readonly [number, number];

/** A scored frame: the drawing it names, its probability and the posed puppet's IoU. */
export interface ChainFrame {
  readonly f: number;
  readonly drawing: string;
  readonly p: number;
  readonly iou: number;
}

/** The mean IoU and each drawing's count over each band, by `<first>-<last>`. */
export const bandsOf = (frames: ReadonlyArray<ChainFrame>, bands: ReadonlyArray<Band>) => {
  const iou: Record<string, number> = {};
  const named: Record<string, Record<string, number>> = {};
  for (const [a, b] of bands) {
    const at = frames.filter((fr) => fr.f >= a && fr.f <= b);
    const label = `${a}-${b}`;
    iou[label] = at.reduce((s, fr) => s + fr.iou, 0) / at.length;
    const counts: Record<string, number> = {};
    for (const fr of at) counts[fr.drawing] = (counts[fr.drawing] ?? 0) + 1;
    named[label] = counts;
  }
  return { iou, named };
};
