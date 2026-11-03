/**
 * A stroke limb drawn on the CPU, one pixel at a time: the reference the GPU
 * path is held to. `limb.ts` measures the limb from its part's paint; this
 * module draws it posed, from that measure and the part's own paint.
 */
import { labOf, type Rgb } from './cast-sheet-pixels.ts';
import {
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

/** Convex support envelope of the measured station disks. Their common tangents meet the round ends without a square tube cutting across a cap. */
const hullOf = (points: Array<Pt>): Array<Pt> => {
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a: Pt, b: Pt, c: Pt) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = (ordered: Array<Pt>) => {
    const out: Array<Pt> = [];
    for (const p of ordered) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0)
        out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(points), ...half(points.toReversed())];
};

/** Horizontal spans of a rounded segment in its own pixels. The polygon's sagitta and row spacing are each at most a quarter output pixel. */
const capsuleOf = (limb: PuppetPartLimb, k: number, scale: number) => {
  const { chain } = limb;
  const a = [chain.shoulder, chain.elbow][k]!;
  const b = [chain.elbow, chain.cuff][k]!;
  const d = unit(sub(b, a)),
    n = opens(d);
  const [first, last] = [
    [limb.stations.shoulder, limb.stations.elbowUpper],
    [limb.stations.elbowFore, limb.stations.cuff],
  ][k]!;
  const u0 = [0, chain.upper][k]!;
  const stations = [first!, last!];
  for (let j = 0; j < limb.outer.widths.length; j++) {
    const u = (j + 0.5) * limb.step;
    if (u <= first!.u || u >= last!.u) continue;
    stations.push({
      u,
      inner: widthAt(limb, 'inner', k, u)[0],
      outer: widthAt(limb, 'outer', k, u)[0],
    });
  }
  const points: Array<Pt> = [];
  const step = 0.25 / scale;
  for (const s of stations) {
    const r = (s.inner + s.outer) / 2,
      v = (s.outer - s.inner) / 2;
    const cx = a[0] + (s.u - u0) * d[0] + v * n[0],
      cy = a[1] + (s.u - u0) * d[1] + v * n[1];
    const count = Math.max(
      8,
      Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - step / Math.max(step, r)))),
    );
    for (let j = 0; j < count; j++)
      points.push([
        cx + r * Math.cos((2 * Math.PI * j) / count),
        cy + r * Math.sin((2 * Math.PI * j) / count),
      ]);
  }
  const hull = hullOf(points);
  const lo = Math.min(...hull.map((p) => p[1])),
    hi = Math.max(...hull.map((p) => p[1]));
  const count = Math.ceil((hi - lo) / step) + 1;
  const left = new Float64Array(count).fill(Infinity),
    right = new Float64Array(count).fill(-Infinity);
  for (let i = 0; i < hull.length; i++) {
    let p = hull[i]!,
      q = hull[(i + 1) % hull.length]!;
    if (p[1] > q[1]) [p, q] = [q, p];
    if (p[1] === q[1]) continue;
    const from = Math.max(0, Math.ceil((p[1] - lo) / step)),
      to = Math.min(count - 1, Math.ceil((q[1] - lo) / step));
    for (let j = from; j <= to; j++) {
      const y = Math.min(hi, lo + j * step);
      if (y > q[1]) continue;
      const x = p[0] + ((y - p[1]) / (q[1] - p[1])) * (q[0] - p[0]);
      left[j] = Math.min(left[j]!, x);
      right[j] = Math.max(right[j]!, x);
    }
  }
  return (q: Pt) => {
    if (q[1] < lo - limb.inkWidth || q[1] > hi + limb.inkWidth)
      return -2 * (limb.inkWidth * scale + 1);
    const y = Math.max(lo, Math.min(hi, q[1]));
    const i = Math.min(count - 2, Math.floor((y - lo) / step));
    const span = Math.min(step, hi - (lo + i * step));
    const t = clamp01((y - lo - i * step) / span);
    const l = left[i]! + t * (left[i + 1]! - left[i]!);
    const r = right[i]! + t * (right[i + 1]! - right[i]!);
    const dl = (left[i + 1]! - left[i]!) / span,
      dr = (right[i + 1]! - right[i]!) / span;
    return (
      Math.min(
        (q[0] - l) / Math.hypot(1, dl),
        (r - q[0]) / Math.hypot(1, dr),
        q[1] - lo,
        hi - q[1],
      ) * scale
    );
  };
};

/** `top` (premultiplied) laid over `under`, into `under`. */
const overInto = (under: Float64Array, top: Float64Array) => {
  const keep = 1 - top[3]!;
  for (let c = 0; c < 4; c++) under[c] = top[c]! + under[c]! * keep;
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

/** Filter the hand's whole-texel ownership together with its paint, so a transformed cuff edge never samples lining into the hand or steps between texels. */
const sampleHand = (
  limb: PuppetPartLimb,
  sample: LimbSample,
  q: Pt,
  into: Float64Array,
  scratch: Float64Array,
) => {
  const bx = Math.floor(q[0] - 0.5),
    by = Math.floor(q[1] - 0.5);
  const fx = q[0] - 0.5 - bx,
    fy = q[1] - 0.5 - by;
  const shares = [
    limbShares(limb, bx, by)[2],
    limbShares(limb, bx + 1, by)[2],
    limbShares(limb, bx, by + 1)[2],
    limbShares(limb, bx + 1, by + 1)[2],
  ];
  if (shares.every((s) => s === 1)) return;
  into.fill(0);
  if (shares.every((s) => s === 0)) return;
  for (let k = 0; k < 4; k++) {
    const dx = k & 1,
      dy = k >> 1;
    const weight = [1 - fx, fx][dx]! * [1 - fy, fy][dy]! * shares[k]!;
    if (weight === 0) continue;
    sample(bx + dx + 0.5, by + dy + 0.5, scratch);
    for (let c = 0; c < 4; c++) into[c] = into[c]! + scratch[c]! * weight;
  }
};

/** Close the union with a measured pen-radius disk. Eroding its dilation joins concave boundaries by tangent arcs without removing a narrow connection. */
const closedField = (pixels: Float64Array, width: number, height: number, radius: number) => {
  const inside = nearest(width, height, (i) => pixels[i * 4 + 3]! >= 0.5);
  const outside = nearest(width, height, (i) => inside.distances[i]! > radius * radius);
  return Float64Array.from(outside.distances, (d) => Math.sqrt(d) - radius - 0.5);
};

/** Change coverage without blending displaced pictures; newly filled ground takes sampled cloth. */
const coverField = (
  pixels: Float64Array,
  field: Float64Array,
  width: number,
  fill: (x: number, y: number, into: Float64Array) => void,
) => {
  const donor = new Float64Array(4);
  for (let i = 0; i < field.length; i++) {
    const o = i * 4,
      alpha = clamp01(field[i]! + 0.5),
      before = pixels[o + 3]!;
    if (alpha === before) continue;
    if (alpha === 0) {
      pixels.fill(0, o, o + 4);
      continue;
    }
    if (before === 0) fill((i % width) + 0.5, Math.floor(i / width) + 0.5, donor);
    for (let c = 0; c < 3; c++) {
      let colour = donor[c]!;
      if (before > 0) colour = pixels[o + c]! / before;
      pixels[o + c] = colour * alpha;
    }
    pixels[o + 3] = alpha;
  }
};

/** One completed silhouette receives ink once; transition geometry interpolates distance, never two images or their outlines. */
const outline = (
  pixels: Float64Array,
  hands: Float64Array,
  painted: Float64Array,
  folds: Float64Array,
  handGround: Float64Array,
  width: number,
  height: number,
  ink: Rgb,
  inkWidth: number,
  blend: number,
  fill: (x: number, y: number, into: Float64Array) => void,
) => {
  const radius = inkWidth / 2;
  const garment = closedField(pixels, width, height, radius);
  const eroded = nearest(width, height, (i) => garment[i]! >= radius);
  const opened = Float64Array.from(eroded.distances, (d) => radius + 0.5 - Math.sqrt(d));
  coverField(pixels, opened, width, fill);
  for (let i = 0; i < width * height; i++)
    overInto(pixels.subarray(i * 4, i * 4 + 4), hands.subarray(i * 4, i * 4 + 4));
  // A round ink join has the pen's radius: half its measured width.
  const field = closedField(pixels, width, height, inkWidth / 2);
  let reference = field;
  if (blend < 1) reference = closedField(painted, width, height, inkWidth / 2);
  const mixed = new Float64Array(field.length);
  for (let i = 0; i < width * height; i++) {
    const d = field[i]!;
    let distance = d;
    if (blend < 1) distance = reference[i]! * (1 - blend) + d * blend;
    mixed[i] = distance;
  }
  coverField(pixels, mixed, width, fill);
  const boundary = nearest(width, height, (i) => pixels[i * 4 + 3]! < 0.5);
  const handCuts = nearest(width, height, (i) => handGround[i]! >= 0.5);
  for (let i = 0; i < width * height; i++) {
    const into = pixels.subarray(i * 4, i * 4 + 4);
    const band = clamp01(inkWidth + 0.5 - Math.sqrt(boundary.distances[i]!));
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
 * Measured round-ended capsules and the painted stub fill one cloth mask;
 * the hand lies over it. From the transition midpoint to its end, one
 * distance field moves from the painted silhouette to this capsule union.
 * Only the completed boundary and the forearm fold receive stroke ink.
 */
export const limbStroke = (
  limb: PuppetPartLimb,
  frames: LimbFrames,
  numbers: Readonly<Record<string, number>>,
  sample: LimbSample,
  box: readonly [number, number, number, number],
  stubPixels: Float64Array,
  paintedPixels: Float64Array,
) => {
  const { fold } = limbBlend(limb, numbers);
  const { chain, ink, inkWidth } = limb;
  const sampleCloth = clothSampler(limb, sample);
  const length = chain.upper + chain.fore;
  const segs = [
    [chain.shoulder, unit(sub(chain.elbow, chain.shoulder)), 0],
    [chain.elbow, unit(sub(chain.cuff, chain.elbow)), chain.upper],
  ] as const;
  const upper = new Float64Array(4);
  const [fore, hand, past] = [new Float64Array(4), new Float64Array(4), new Float64Array(4)];
  /** Segment `k`'s `(u, v)` at rest point `q`. */
  const along = (k: number, q: Pt): Pt => {
    const [from, d, u0] = segs[k]!;
    const r = sub(q, from);
    return [u0 + dot(r, d), dot(r, opens(d))];
  };
  const scale = 1 / Math.hypot(frames.upper[0]!, frames.upper[1]!);
  const capsules = [capsuleOf(limb, 0, scale), capsuleOf(limb, 1, scale)];
  /** The two measured round-ended support envelopes, sampled on their own rigid frames. */
  const tube = (k: number, q: Pt, into: Float64Array) => {
    let distance = capsules[k]!(q);
    if (k === 0) distance = Math.min(distance, along(0, q)[0] * scale);
    const coverage = clamp01(distance + 0.5);
    into.fill(0);
    if (coverage === 0) return distance;
    sampleCloth(q[0], q[1], into);
    for (let c = 0; c < 4; c++) into[c] = into[c]! * coverage;
    return distance;
  };
  const [x0, y0, width, height] = box;
  const pixels = new Float64Array(width * height * 4);
  const folds = new Float64Array(width * height);
  const hands = new Float64Array(pixels.length);
  const handGround = new Float64Array(width * height);
  const onFore = new Uint8Array(width * height);
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
      const upperDistance = tube(0, qu, upper);
      past.set(stub);
      if (
        stub[3]! > 0 &&
        labOf([stub[0]! / stub[3]!, stub[1]! / stub[3]!, stub[2]! / stub[3]!])[0] < INK_L
      ) {
        sampleCloth(qu[0], qu[1], past);
        for (let c = 0; c < 4; c++) past[c] = past[c]! * stub[3]!;
      }
      overInto(upper, past);
      const foreDistance = tube(1, qf, fore);
      onFore[i] = Number(foreDistance > upperDistance);
      sample(qh[0], qh[1], hand);
      const handAlpha = hand[3]!;
      sampleHand(limb, sample, qh, hand, past);
      handGround[i] = Math.max(0, handAlpha - hand[3]!);
      into.set(upper);
      overInto(into, fore);
      hands.set(hand, o);
      const [u, v] = along(1, qf);
      const [w] = widthAt(limb, 'outer', 1, u);
      if (u >= chain.upper && u <= length && v >= 0)
        folds[i] = clamp01(v - (w - inkWidth) + 0.5) * fore[3]! * upper[3]! * fold;
    }
  return outline(
    pixels,
    hands,
    paintedPixels,
    folds,
    handGround,
    width,
    height,
    ink,
    inkWidth * scale,
    limbBlend(
      {
        bones: limb.bones,
        fade: [(limb.fade[0] + limb.fade[1]) / 2, limb.fade[1]],
        fold: limb.fold,
      },
      numbers,
    ).sleeve,
    (x, y, into) => {
      const k = Math.min(onFore.length - 1, Math.floor(y) * width + Math.floor(x));
      let inv = frames.upper;
      if (onFore[k]) inv = frames.fore;
      const q = mapped(inv, x + x0, y + y0);
      sampleCloth(q[0], q[1], into);
    },
  );
};
