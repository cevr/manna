/**
 * A stroke limb drawn on the CPU, one pixel at a time: the reference the GPU
 * path is held to. `limb.ts` measures the limb from its part's paint; this
 * module draws it posed, from that measure and the part's own paint.
 */
import { Option, Record as Rec } from 'effect';
import { labOf, type Rgb } from './cast-sheet-pixels.ts';
import {
  FEATHER,
  INK_L,
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

/** Nearest seeded pixel in Euclidean distance, using separable lower envelopes of squared distances. */
const nearest = (width: number, height: number, seed: (i: number) => boolean) => {
  const count = width * height;
  const far = width * width + height * height + 1;
  const distances = new Float64Array(count);
  const ids = new Int32Array(count).fill(-1);
  for (let i = 0; i < count; i++) {
    distances[i] = far;
    if (seed(i)) {
      distances[i] = 0;
      ids[i] = i;
    }
  }
  const size = Math.max(width, height);
  const values = new Float64Array(size);
  const sources = new Int32Array(size);
  const sites = new Int32Array(size);
  const cuts = new Float64Array(size + 1);
  const line = (start: number, step: number, n: number) => {
    for (let i = 0; i < n; i++) {
      values[i] = distances[start + i * step]!;
      sources[i] = ids[start + i * step]!;
    }
    let k = 0;
    sites[0] = 0;
    cuts[0] = Number.NEGATIVE_INFINITY;
    cuts[1] = Number.POSITIVE_INFINITY;
    for (let q = 1; q < n; q++) {
      let s = 0;
      for (;;) {
        const v = sites[k]!;
        s = (values[q]! + q * q - values[v]! - v * v) / (2 * (q - v));
        if (s > cuts[k]!) break;
        k--;
      }
      sites[++k] = q;
      cuts[k] = s;
      cuts[k + 1] = Number.POSITIVE_INFINITY;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (cuts[k + 1]! < q) k++;
      const v = sites[k]!;
      distances[start + q * step] = (q - v) ** 2 + values[v]!;
      ids[start + q * step] = sources[v]!;
    }
  };
  for (let y = 0; y < height; y++) line(y * width, 1, width);
  for (let x = 0; x < width; x++) line(x, width, height);
  return { ids, distances };
};

/** The part's cloth under its source ink, sampled before posing so a bilinear ink/cloth edge cannot leave a second line inside the union. */
const clothSampler = (limb: PuppetPartLimb, sample: LimbSample): LimbSample => {
  const [x0, y0, width, height] = limb.regions.box;
  const pixels = new Float64Array(width * height * 4);
  const ink = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const p = pixels.subarray(i * 4, i * 4 + 4);
      sample(x0 + x + 0.5, y0 + y + 0.5, p);
      if (p[3]! > 0 && labOf([p[0]! / p[3]!, p[1]! / p[3]!, p[2]! / p[3]!])[0] < INK_L) ink[i] = 1;
    }
  const fromInk = nearest(width, height, (i) => ink[i] === 1);
  // The four neighbours of a bilinear sample reach a diagonal texel: keep
  // that one-texel antialias fringe out of both the ink and its donor cloth.
  const cloth = nearest(
    width,
    height,
    (i) => pixels[i * 4 + 3]! >= 0.5 && fromInk.distances[i]! > 2,
  );
  for (let i = 0; i < width * height; i++) {
    let j = i * 4;
    if (pixels[j + 3]! < 0.5 || fromInk.distances[i]! <= 2) j = cloth.ids[i]! * 4;
    if (j < 0) continue;
    for (let c = 0; c < 3; c++) pixels[i * 4 + c] = pixels[j + c]! / pixels[j + 3]!;
    pixels[i * 4 + 3] = 1;
  }
  return (sx, sy, into) => {
    into.fill(0);
    const bx = Math.floor(sx - x0 - 0.5),
      by = Math.floor(sy - y0 - 0.5);
    const fx = sx - x0 - 0.5 - bx,
      fy = sy - y0 - 0.5 - by;
    for (let dy = 0; dy <= 1; dy++)
      for (let dx = 0; dx <= 1; dx++) {
        const x = Math.max(0, Math.min(width - 1, bx + dx)),
          y = Math.max(0, Math.min(height - 1, by + dy));
        const weight = [1 - fx, fx][dx]! * [1 - fy, fy][dy]!;
        for (let c = 0; c < 4; c++) into[c] = into[c]! + pixels[(y * width + x) * 4 + c]! * weight;
      }
  };
};

/** Fill missing paint from the nearest cloth, then ink the completed union once. The hand's existing outline stays painted; only a cut exposed by its turn needs the union's ink. */
const outline = (
  pixels: Float64Array,
  hands: Float64Array,
  folds: Float64Array,
  handGround: Float64Array,
  width: number,
  height: number,
  ink: Rgb,
  inkWidth: number,
) => {
  const boundary = nearest(
    width,
    height,
    (i) => hands[i * 4 + 3]! + pixels[i * 4 + 3]! * (1 - hands[i * 4 + 3]!) < 0.5,
  );
  const handCuts = nearest(width, height, (i) => handGround[i]! >= 0.5);
  for (let i = 0; i < width * height; i++) {
    const into = pixels.subarray(i * 4, i * 4 + 4);
    const band = clamp01(inkWidth + 0.5 - Math.sqrt(boundary.distances[i]!));
    overInto(into, hands.subarray(i * 4, i * 4 + 4));
    const handCut = clamp01(inkWidth + 0.5 - Math.sqrt(handCuts.distances[i]!));
    const handAlpha = hands[i * 4 + 3]!;
    inked(
      into,
      ink,
      Math.max(band * (1 - handAlpha + handAlpha * handCut), folds[i]! * (1 - handAlpha)),
    );
  }
  return pixels;
};

/**
 * Premultiplied raster of a posed limb over its painted stub in `box`.
 * The upper arm, forearm, elbow fan and cuff fill one mask with the part's
 * cloth. Its painted hand lies over the sleeve. Only the union's boundary
 * band and the forearm's fold receive stroke ink, at the measured width.
 */
export const limbStroke = (
  limb: PuppetPartLimb,
  frames: LimbFrames,
  numbers: Readonly<Record<string, number>>,
  sample: LimbSample,
  box: readonly [number, number, number, number],
  stubPixels: Float64Array,
) => {
  const { fold } = limbBlend(limb, numbers);
  const { chain, ink, inkWidth } = limb;
  const sampleCloth = clothSampler(limb, sample);
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
  /** Tube `k`'s cloth at rest point `q`, clipped to its measured widths and sleeve region. */
  const tube = (k: number, q: Pt, into: Float64Array) => {
    into.fill(0);
    const [u, v] = along(k, q);
    const within = [u <= chain.upper, u >= chain.upper && u <= length + 2 * inkWidth + FEATHER][k]!;
    if (!within) return;
    const side = SIDES[Number(v >= 0)]!;
    const [w, edge] = widthAt(limb, side, k, u);
    const a = Math.abs(v);
    const cov = clamp01(w + [0.5, 1.5][Number(edge)]! - a);
    if (cov === 0) return;
    sampleCloth(q[0], q[1], into);
    const share = cov * limbShares(limb, Math.floor(q[0]), Math.floor(q[1]))[1];
    const alpha = into[3]!;
    if (alpha > 0) for (let c = 0; c < 3; c++) into[c] = (into[c]! / alpha) * share;
    into[3] = share;
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
   * distance. Clear source points receive their nearest painted cloth.
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
    sampleCloth(e[0] + d * cutUpper[0], e[1] + d * cutUpper[1], joint);
    sampleCloth(e[0] + d * cutFore[0], e[1] + d * cutFore[1], past);
    for (let c = 0; c < 4; c++) joint[c] = (1 - t) * joint[c]! + t * past[c]!;
    if (joint[3]! <= 0) joint.set([0, 0, 0, 1]);
    const a = joint[3]!;
    for (let c = 0; c < 4; c++) joint[c] = (joint[c]! / a) * cov;
  };
  /** Cloth across the cuff's opening, to one measured ink width past its end, as opaque as the paint a feather inside it. Its exposed edge belongs to the union's outline. */
  const cuffFill = (qf: Pt) => {
    cuff.fill(0);
    const [u, v] = along(1, qf);
    if (!(u > length && u <= length + inkWidth)) return;
    if (Math.abs(v) > limb.stations.cuff[SIDES[Number(v >= 0)]!]) return;
    const inside = restAt(1, length - FEATHER, v);
    sample(inside[0], inside[1], past);
    const a = past[3]!;
    sampleCloth(inside[0], inside[1], cuff);
    for (let c = 0; c < 4; c++) cuff[c] = cuff[c]! * a;
  };
  const wristTurn = wrap(
    (Option.getOrElse(Rec.get(numbers, limb.bones[2]), () => 0) * Math.PI) / 180,
  );
  const wristSign = 2 * Number(wristTurn >= 0) - 1;
  const wristFrom = Math.atan2(wristSign * opens(dF)[1], wristSign * opens(dF)[0]);
  /** The swept cuff opening fills a wrist turn with lining, under the hand, before the one outline is drawn. */
  const wristJoin = (qf: Pt) => {
    past.fill(0);
    const r = sub(qf, chain.cuff);
    const distance = Math.hypot(...r);
    const swept = wrap(wristSign * (Math.atan2(r[1], r[0]) - wristFrom) - Math.PI) + Math.PI;
    if (wristTurn === 0 || swept > Math.abs(wristTurn)) return;
    const radius = limb.stations.cuff[SIDES[Number(wristTurn >= 0)]!];
    const coverage = clamp01(radius + 0.5 - distance);
    if (coverage === 0) return;
    const q = restAt(1, length - 2 * inkWidth, wristSign * distance);
    sampleCloth(q[0], q[1], past);
    for (let c = 0; c < 4; c++) past[c] = past[c]! * coverage;
  };
  const [x0, y0, width, height] = box;
  const pixels = new Float64Array(width * height * 4);
  const folds = new Float64Array(width * height);
  const hands = new Float64Array(pixels.length);
  const handGround = new Float64Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const o = i * 4;
      const into = pixels.subarray(o, o + 4);
      const stub = stubPixels.subarray(o, o + 4);
      const px = x0 + x + 0.5;
      const py = y0 + y + 0.5;
      const qu = mapped(frames.upper, px, py);
      const qf = mapped(frames.fore, px, py);
      const qh = mapped(frames.hand, px, py);
      tube(0, qu, upper);
      added(upper, stub, 1);
      join(qu);
      cuffFill(qf);
      tube(1, qf, fore);
      sample(qh[0], qh[1], hand);
      const handShare = limbShares(limb, Math.floor(qh[0]), Math.floor(qh[1]))[2];
      handGround[i] = hand[3]! * (1 - handShare);
      for (let c = 0; c < 4; c++) hand[c] = hand[c]! * handShare;
      into.set(joint);
      overInto(into, upper);
      overInto(into, cuff);
      overInto(into, fore);
      wristJoin(qf);
      overInto(into, past);
      hands.set(hand, o);
      const [u, v] = along(1, qf);
      const [w] = widthAt(limb, 'outer', 1, u);
      if (u >= chain.upper && u <= length && v >= 0)
        folds[i] = clamp01(v - (w - inkWidth) + 0.5) * fore[3]! * upper[3]! * fold;
    }
  const scale = 1 / Math.hypot(frames.upper[0]!, frames.upper[1]!);
  return outline(pixels, hands, folds, handGround, width, height, ink, inkWidth * scale);
};
