// A puppet posed at random for a pose reader's training set: each bone's
// number drawn within its own limits (`limitsOf`, from the puppet's drawn
// rest), the figure drawn by `rasterOf` at a random scale and place on the
// reader's canvas, over its paper jittered in tone, then a 1 px blur
// (`sample`); or a held sequence of eased key poses at one place
// (`sequence`). Each comes with its truth: the numbers, each bone's world
// angle, each joint's canvas px, and the joints its puppet lacks (`masked`).
// One seed draws one sample (`mulberry32`): the same seed gives the same
// bytes. Pure.

import { type Puppet, type PuppetPose, boneTransforms, rasterOf } from './puppet.ts';
import type { Raster } from './raster.ts';

type Pt = readonly [number, number];
type Rgb = readonly [number, number, number];

/** The reader's canvas: a 253 × 678 sheet padded 140 px left and right (raised arms reach past the sheet). */
export const SAMPLE_SIZE: Pt = [533, 678];

/** A drawing to sample: its puppet, the paper it lies on, and the canvas (`SAMPLE_SIZE` unless named). */
export interface PoseSpec {
  readonly puppet: Puppet;
  readonly paper: Rgb;
  readonly size?: Pt;
}

/** A sample's truth: where and how large the figure stands, its paper, its numbers, each bone's world angle, each joint's canvas px, and the joints its puppet lacks. */
interface PoseTruth {
  readonly root: Pt;
  readonly scale: number;
  readonly paper: Rgb;
  readonly numbers: Readonly<Record<string, number>>;
  readonly world: Readonly<Record<string, number>>;
  readonly joints: Readonly<Record<string, Pt>>;
  readonly masked: ReadonlyArray<string>;
}

interface PoseSample {
  readonly img: Raster;
  readonly truth: PoseTruth;
}

/** A seeded uniform draw in [0, 1): mulberry32, so one seed gives one sequence on every host. */
const mulberry32 = (seed: number) => {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** The reader's joints by name: the bone each lies on, at its pivot or its tip. */
const JOINTS = {
  hip: ['lean', 'pivot'],
  neckBase: ['neck', 'pivot'],
  chin: ['head', 'pivot'],
  crown: ['head', 'tip'],
  shoulderR: ['shoulderRight', 'pivot'],
  elbowR: ['elbowRight', 'pivot'],
  wristR: ['wristRight', 'pivot'],
  handR: ['wristRight', 'tip'],
  shoulderL: ['shoulderLeft', 'pivot'],
  elbowL: ['elbowLeft', 'pivot'],
  wristL: ['wristLeft', 'pivot'],
  handL: ['wristLeft', 'tip'],
} as const satisfies Readonly<Record<string, readonly [string, 'pivot' | 'tip']>>;

/** Each joint's canvas px at `pose`, for the joints of bones the puppet has: a pivot moves with its parent, a tip with its bone. */
export const jointsOf = (p: Puppet, pose: PuppetPose) => {
  const m = boneTransforms(p.bones, pose.numbers);
  const idx = new Map(p.bones.map((b, i) => [b.name, i]));
  const out: Record<string, Pt> = {};
  for (const [joint, [bone, end]] of Object.entries(JOINTS)) {
    const i = idx.get(bone);
    if (i === undefined) continue;
    const b = p.bones[i]!;
    const parent = b.parent === undefined ? undefined : idx.get(b.parent);
    const k = end === 'tip' ? i : parent;
    const [x, y] = end === 'tip' ? b.tip : b.pivot;
    const [X, Y] =
      k === undefined
        ? [x, y]
        : [
            m[k * 6]! * x + m[k * 6 + 2]! * y + m[k * 6 + 4]!,
            m[k * 6 + 1]! * x + m[k * 6 + 3]! * y + m[k * 6 + 5]!,
          ];
    out[joint] = [
      pose.root[0] + pose.scale * (X - p.root[0]),
      pose.root[1] + pose.scale * (Y - p.root[1]),
    ];
  }
  return out;
};

/** Each bone's world angle, degrees: its number plus its forebears'. */
const worldOf = (p: Puppet, numbers: Readonly<Record<string, number>>) => {
  const w: Record<string, number> = {};
  for (const b of p.bones) w[b.name] = (numbers[b.name] ?? 0) + (b.parent ? w[b.parent]! : 0);
  return w;
};

const deg = (p: Pt, q: Pt) => (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
const wrapDeg = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
/** A range widened to hold [-20, 20] (the drawn rest and its neighbours) and capped at ±170. */
const aroundRest = ([lo, hi]: Pt): Pt => [
  +Math.max(-170, Math.min(lo, -20)).toFixed(1),
  +Math.min(170, Math.max(hi, 20)).toFixed(1),
];

/**
 * A puppet's limits, each bone's number range in degrees relative to its
 * drawn rest: lean and neck [-8, 8], head [-15, 15], wrists [-40, 40]. Each
 * arm takes a side by its shoulder pivot's x against the hip's (left of it
 * on screen, or right of it, mirrored): the upper arm's screen angle ranges
 * over [64, 214] on the left and [-34, 116] on the right, the forearm's bend
 * against it over [-150, 10] and [-10, 150]. Each range is made relative to
 * the drawn rest's angle, so a drawing already bent is not bent past it.
 */
export const limitsOf = (p: Puppet) => {
  const by = new Map(p.bones.map((b) => [b.name, b]));
  const hip = by.get('lean')?.pivot ?? p.root;
  const out: Record<string, Pt> = {};
  for (const b of p.bones) {
    if (b.name === 'lean' || b.name === 'neck') out[b.name] = [-8, 8];
    else if (b.name === 'head') out[b.name] = [-15, 15];
    else if (b.name.startsWith('wrist')) out[b.name] = [-40, 40];
    else if (b.name.startsWith('shoulder') || b.name.startsWith('elbow'))
      out[b.name] = armLimits(
        b,
        by.get(`shoulder${b.name.endsWith('Right') ? 'Right' : 'Left'}`) ?? b,
        hip,
      );
    else out[b.name] = [0, 0];
  }
  return out;
};

type Bone = Puppet['bones'][number];

/** An arm bone's range: its side by its shoulder's pivot against the hip, made relative to its drawn rest. */
const armLimits = (b: Bone, shoulder: Bone, hip: Pt): Pt => {
  const left = shoulder.pivot[0] < hip[0];
  const a0 = deg(shoulder.pivot, shoulder.tip);
  if (b === shoulder) {
    const [lo, hi] = left ? [64, 214] : [-34, 116];
    // the rest angle unwrapped next to the range's middle
    const c = wrapDeg(a0 - (lo + hi) / 2) + (lo + hi) / 2;
    return aroundRest([lo - c, hi - c]);
  }
  const f0 = wrapDeg(deg(b.pivot, b.tip) - a0);
  const [lo, hi] = left ? [-150, 10] : [-10, 150];
  return aroundRest([lo - f0, hi - f0]);
};

/** The canvas root of a puppet drawn at `scale` with its sheet's centre at canvas x `cx` and its sheet's bottom at canvas y `bottom`. */
const placeOf = (p: Puppet, scale: number, cx: number, bottom: number): Pt => [
  cx + scale * (p.root[0] - p.width / 2),
  bottom + scale * (p.root[1] - p.height),
];

/** The drawn raster over `paper`, then a 1 px blur (3 × 3 binomial), opaque. */
const onPaper = (r: Raster, paper: Rgb): Raster => {
  const { width: W, height: H } = r;
  const flat = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const k = r.rgba[i * 4 + 3]! / 255;
    for (let c = 0; c < 3; c++) flat[i * 3 + c] = r.rgba[i * 4 + c]! * k + paper[c]! * (1 - k);
  }
  const out = new Uint8Array(W * H * 4);
  const K = [1, 2, 1] as const;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const X = Math.min(W - 1, Math.max(0, x + dx));
            const Y = Math.min(H - 1, Math.max(0, y + dy));
            s += K[dx + 1]! * K[dy + 1]! * flat[(Y * W + X) * 3 + c]!;
          }
        out[(y * W + x) * 4 + c] = Math.round(s / 16);
      }
      out[(y * W + x) * 4 + 3] = 255;
    }
  return { width: W, height: H, rgba: out };
};

/** One sample's place: the scale (the largest that fits the sheet on the canvas, 13 px spare across, times U(0.82, 1)), the root (centred ±15 px, the bottom anywhere it fits) and the paper (tone ±6, each channel ±4). */
const placed = (spec: PoseSpec, rnd: () => number) => {
  const { puppet: p } = spec;
  const [W, H] = spec.size ?? SAMPLE_SIZE;
  const s0 = Math.min(H / p.height, (W - 13) / p.width);
  const scale = +(s0 * (0.82 + 0.18 * rnd())).toFixed(5);
  const cx = W / 2 + (rnd() - 0.5) * 30;
  const bottom = H - (H - p.height * scale) * rnd();
  const [rx, ry] = placeOf(p, scale, cx, bottom);
  const root: Pt = [+rx.toFixed(3), +ry.toFixed(3)];
  const tone = (rnd() - 0.5) * 12;
  const channel = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v + tone + (rnd() - 0.5) * 8)));
  const paper: Rgb = [channel(spec.paper[0]), channel(spec.paper[1]), channel(spec.paper[2])];
  return { scale, root, paper };
};

/** The frame at a pose and paper: the figure over paper and its truth. */
const frameOf = (
  spec: PoseSpec,
  numbers: Readonly<Record<string, number>>,
  root: Pt,
  scale: number,
  paper: Rgb,
): PoseSample => {
  const { puppet: p } = spec;
  const pose: PuppetPose = { numbers, root, scale };
  const joints = jointsOf(p, pose);
  return {
    img: onPaper(rasterOf(p, pose, spec.size ?? SAMPLE_SIZE), paper),
    truth: {
      root,
      scale,
      paper,
      numbers,
      world: worldOf(p, numbers),
      joints,
      masked: Object.keys(JOINTS).filter((j) => !(j in joints)),
    },
  };
};

/** A pose drawn uniform within the limits, to three decimals. */
const keyPose = (p: Puppet, limits: Record<string, Pt>, rnd: () => number) =>
  Object.fromEntries(
    p.bones.map((b) => {
      const [lo, hi] = limits[b.name]!;
      return [b.name, +(lo + (hi - lo) * rnd()).toFixed(3)];
    }),
  );

/** One sample at `seed`: a pose within the limits, at a random scale, place and paper. */
export const sample = (spec: PoseSpec, seed: number): PoseSample => {
  const rnd = mulberry32(seed);
  const numbers = keyPose(spec.puppet, limitsOf(spec.puppet), rnd);
  const { scale, root, paper } = placed(spec, rnd);
  return frameOf(spec, numbers, root, scale, paper);
};

/**
 * A held sequence of `frames` at `seed`, at 24 fps: one scale, place and
 * paper; key poses drawn within the limits, each held 0-15 frames, then
 * eased (smoothstep) to the next over 6-30 frames.
 */
export const sequence = (
  spec: PoseSpec,
  seed: number,
  frames: number,
): ReadonlyArray<PoseSample> => {
  const { puppet: p } = spec;
  const rnd = mulberry32(seed);
  const limits = limitsOf(p);
  const { scale, root, paper } = placed(spec, rnd);
  const out: Array<Readonly<Record<string, number>>> = [];
  let a = keyPose(p, limits, rnd);
  while (out.length < frames) {
    const hold = Math.floor(16 * rnd());
    const move = 6 + Math.floor(25 * rnd());
    const b = keyPose(p, limits, rnd);
    for (let i = 0; i < hold; i++) out.push(a);
    for (let i = 1; i <= move; i++) {
      const t = i / move;
      const e = t * t * (3 - 2 * t);
      out.push(
        Object.fromEntries(
          p.bones.map((x) => [x.name, +(a[x.name]! + (b[x.name]! - a[x.name]!) * e).toFixed(3)]),
        ),
      );
    }
    a = b;
  }
  return out.slice(0, frames).map((n) => frameOf(spec, n, root, scale, paper));
};
