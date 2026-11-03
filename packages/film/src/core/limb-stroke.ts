/**
 * A stroke limb drawn on the CPU, one pixel at a time: the reference the GPU
 * path is held to. `limb.ts` measures the limb from its part's paint; this
 * module draws it posed, from that measure and the part's own paint.
 */
import { Option, Record as Rec } from 'effect';
import type { Rgb } from './cast-sheet-pixels.ts';
import {
  FEATHER,
  type LimbSideName,
  type LimbStations,
  type PuppetPartLimb,
  clamp01,
  dot,
  limbBlend,
  limbShares,
  opens,
  sub,
  unit,
} from './limb.ts';

type Pt = readonly [number, number];

/** An affine map `[a, b, c, d, e, f]`: x' = a x + c y + e, y' = b x + d y + f. */
type Affine = Float64Array;

/**
 * Where a pixel of the drawn frame lies on a limb's part at rest, by each
 * rigid piece of the posed limb: the upper arm (its shoulder bone's drawn map
 * inverted), the forearm (its elbow bone's) and the hand (its wrist bone's).
 */
export interface LimbFrames {
  readonly upper: Affine;
  readonly fore: Affine;
  readonly hand: Affine;
}

/** The premultiplied bilinear sample of a limb's part at the rest point `(sx, sy)` into `into` (rewritten whole): colour 0..255, alpha 0..1. */
export type LimbSample = (sx: number, sy: number, into: Float64Array) => void;

const SIDES = ['inner', 'outer'] as const;

const mapped = (m: Affine, x: number, y: number): Pt => [
  m[0]! * x + m[2]! * y + m[4]!,
  m[1]! * x + m[3]! * y + m[5]!,
];

/** The station line of `side` on segment `fore` (0 the upper arm, 1 the forearm) at `u`: linear between that segment's two stations, held past them. */
const stationAt = (s: LimbStations, side: LimbSideName, fore: number, u: number) => {
  const [a, b] = [
    [s.shoulder, s.elbowUpper],
    [s.elbowFore, s.cuff],
  ][fore]!;
  const t = clamp01((u - a!.u) / (b!.u - a!.u));
  return a![side] + t * (b![side] - a![side]);
};

/**
 * `side`'s half-width at `u` on segment `fore`, and whether the paint shows
 * that side's edge there: each knot's measured width where it ends on an
 * edge, the segment's station line across a fold (whose edge the drawn view
 * hides), linear between knots.
 */
const widthAt = (
  limb: PuppetPartLimb,
  side: LimbSideName,
  fore: number,
  u: number,
): readonly [number, boolean] => {
  const s = limb[side];
  const n = s.widths.length;
  const f = Math.max(0, Math.min(n - 1, u / limb.step - 0.5));
  const k0 = Math.floor(f);
  const at = (k: number) => {
    if (s.ends[k] === 'fold') return stationAt(limb.stations, side, fore, (k + 0.5) * limb.step);
    return s.widths[k]!;
  };
  const w0 = at(k0);
  return [w0 + (f - k0) * (at(Math.min(n - 1, k0 + 1)) - w0), s.ends[Math.round(f)] !== 'fold'];
};

/** `top` (premultiplied) laid over `under`, into `under`. */
const overInto = (under: Float64Array, top: Float64Array) => {
  const keep = 1 - top[3]!;
  for (let c = 0; c < 4; c++) under[c] = top[c]! + under[c]! * keep;
};

/** `top` (premultiplied) at weight `w` added to `into`, held to alpha 1: two regions' shares of one texel, which sum to one. */
const added = (into: Float64Array, top: Float64Array, w: number) => {
  for (let c = 0; c < 4; c++) into[c] = into[c]! + top[c]! * w;
  const a = into[3]!;
  if (a > 1) for (let c = 0; c < 4; c++) into[c] = into[c]! / a;
};

/** Premultiplied `colour` at alpha `a` laid over `into`, keeping `into`'s alpha: ink painted on cloth. */
const inked = (into: Float64Array, colour: Rgb, a: number) => {
  for (let c = 0; c < 3; c++) into[c] = into[c]! * (1 - a) + colour[c]! * a * into[3]!;
};

/**
 * A posed limb's stroke, one pixel at a time: `(x, y, stub, into)` writes
 * into `into` (premultiplied) the stroke at the drawn point `(x, y)`, laid
 * over `stub`, the part's stub as the painted path draws it there, at the
 * bone numbers `numbers`. Bottom to top:
 * - the elbow's join (`join`), on the bend's convex side, where the two
 *   tubes' end lines part (at rest, the outer corner);
 * - the upper arm's tube, on the shoulder bone, added to the stub (their
 *   shares part each texel between them);
 * - the cuff's ink, across the sleeve's opening past its end, under the
 *   hand: shown where the hand's paint does not cover it;
 * - the forearm's tube, on the elbow bone, with the hand, on the wrist bone,
 *   added to it (their shares part each texel between them).
 * Each tube spans its segment's u, out to each side's width (`widthAt`): an
 * edge side shows the paint as it is, ink and all; a fold side ends at its
 * width, inked over `inkWidth` where the paint runs on past it (a cut inside
 * the drawn fold), the forearm's at `limbBlend`'s fold where it lies over
 * the upper arm (the fold line) and wholly over the ground. The fill is the
 * part's own paint at the rest point, so its shade planes and texture are as
 * painted.
 */
export const limbStroke = (
  limb: PuppetPartLimb,
  frames: LimbFrames,
  numbers: Readonly<Record<string, number>>,
  sample: LimbSample,
) => {
  const { fold } = limbBlend(limb, numbers);
  const { chain, ink, inkWidth } = limb;
  const length = chain.upper + chain.fore;
  const segs = [
    [chain.shoulder, unit(sub(chain.elbow, chain.shoulder)), 0],
    [chain.elbow, unit(sub(chain.cuff, chain.elbow)), chain.upper],
  ] as const;
  const [upper, joint, cuff] = [new Float64Array(4), new Float64Array(4), new Float64Array(4)];
  const [fore, hand, past] = [new Float64Array(4), new Float64Array(4), new Float64Array(4)];
  /** Segment `k`'s `(u, v)` at rest point `q`. */
  const along = (k: number, q: Pt): Pt => {
    const [from, d, u0] = segs[k]!;
    const r = sub(q, from);
    return [u0 + dot(r, d), dot(r, opens(d))];
  };
  /** Segment `k`'s rest point at `(u, v)`. */
  const restAt = (k: number, u: number, v: number): Pt => {
    const [from, d, u0] = segs[k]!;
    const n = opens(d);
    return [from[0] + (u - u0) * d[0] + v * n[0], from[1] + (u - u0) * d[1] + v * n[1]];
  };
  /** Tube `k` at rest point `q` into `into`, its synthetic ink at `shown`. */
  const tube = (k: number, q: Pt, shown: number, into: Float64Array) => {
    into.fill(0);
    const [u, v] = along(k, q);
    const within = [u <= chain.upper, u >= chain.upper && u <= length + FEATHER][k]!;
    if (!within) return;
    const side = SIDES[Number(v >= 0)]!;
    const [w, edge] = widthAt(limb, side, k, u);
    const a = Math.abs(v);
    const cov = clamp01(w + [0.5, 1.5][Number(edge)]! - a);
    if (cov === 0) return;
    sample(q[0], q[1], into);
    if (!edge) {
      const beyond = restAt(k, u, (2 * Number(v >= 0) - 1) * (w + 2));
      sample(beyond[0], beyond[1], past);
      inked(into, ink, clamp01(a - (w - inkWidth) + 0.5) * past[3]! * shown);
    }
    const share = cov * limbShares(limb, Math.floor(q[0]), Math.floor(q[1]))[1];
    for (let c = 0; c < 4; c++) into[c] = into[c]! * share;
  };
  const [dU, dF] = [segs[0][1], segs[1][1]];
  const turn = (Option.getOrElse(Rec.get(numbers, limb.bones[1]), () => 0) * Math.PI) / 180;
  const wrap = (a: number) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
  /** The forearm's turn from the upper arm in the pose, (−π, π]: positive opens the outer side. */
  const bend = wrap(Math.atan2(dU[0] * dF[1] - dU[1] * dF[0], dot(dU, dF)) + turn);
  /** The convex side of the bend (the one whose normals sweep with it): the outer while the bend is positive, else the inner. */
  const convex = Number(bend >= 0);
  const sign = 2 * convex - 1;
  const from = Math.atan2(sign * opens(dU)[1], sign * opens(dU)[0]);
  const cutUpper: Pt = [sign * opens(dU)[0], sign * opens(dU)[1]];
  const cutFore: Pt = [sign * opens(dF)[0], sign * opens(dF)[1]];
  /**
   * The join at the upper arm's rest point `qu` into `joint`: on the bend's
   * convex side, the fan the cut swept from the upper arm's end to the
   * forearm's start, its radius running from the upper arm's elbow station
   * to the forearm's across the fan, its fill the two cuts' paint at that
   * distance, inked at its rim.
   */
  const join = (qu: Pt) => {
    joint.fill(0);
    const r = sub(qu, chain.elbow);
    const d = Math.hypot(r[0], r[1]);
    const swept = wrap(sign * (Math.atan2(r[1], r[0]) - from) - Math.PI) + Math.PI;
    if (!(swept <= Math.abs(bend)) || bend === 0) return;
    const t = swept / Math.abs(bend);
    const side = SIDES[convex]!;
    const { elbowUpper, elbowFore } = limb.stations;
    const radius = elbowUpper[side] + t * (elbowFore[side] - elbowUpper[side]);
    const cov = clamp01(radius + 0.5 - d);
    if (cov === 0) return;
    const e = chain.elbow;
    sample(e[0] + d * cutUpper[0], e[1] + d * cutUpper[1], joint);
    sample(e[0] + d * cutFore[0], e[1] + d * cutFore[1], past);
    for (let c = 0; c < 4; c++) joint[c] = (1 - t) * joint[c]! + t * past[c]!;
    if (joint[3]! <= 0) joint.set([...ink, 1]);
    const a = joint[3]!;
    for (let c = 0; c < 4; c++) joint[c] = (joint[c]! / a) * cov;
    inked(joint, ink, clamp01(d - (radius - inkWidth) + 0.5));
  };
  /** The cuff's ink at the forearm's rest point `qf` into `cuff`: across the sleeve's opening, to `inkWidth` past its end, as opaque as the sleeve is a feather inside it. */
  const cuffInk = (qf: Pt) => {
    cuff.fill(0);
    const [u, v] = along(1, qf);
    if (!(u > length && u <= length + inkWidth)) return;
    const inside = restAt(1, length - FEATHER, v);
    sample(inside[0], inside[1], past);
    const a = past[3]!;
    cuff.set([ink[0] * a, ink[1] * a, ink[2] * a, a]);
  };
  return (x: number, y: number, stub: Float64Array, into: Float64Array) => {
    const qu = mapped(frames.upper, x, y);
    const qf = mapped(frames.fore, x, y);
    const qh = mapped(frames.hand, x, y);
    tube(0, qu, 1, upper);
    added(upper, stub, 1);
    join(qu);
    cuffInk(qf);
    tube(1, qf, Math.max(fold, 1 - upper[3]!), fore);
    sample(qh[0], qh[1], hand);
    added(fore, hand, limbShares(limb, Math.floor(qh[0]), Math.floor(qh[1]))[2]);
    into.set(joint);
    overInto(into, upper);
    overInto(into, cuff);
    overInto(into, fore);
  };
};
