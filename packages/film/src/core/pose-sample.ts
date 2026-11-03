import { type Puppet, type PuppetPose, boneTransforms, rasterOf } from './puppet.ts';
import type { Raster } from './raster.ts';

type Pt = readonly [number, number];
type Rgb = readonly [number, number, number];

export const SAMPLE_SIZE: Pt = [533, 678];

export interface PoseSpec {
  readonly puppet: Puppet;
  readonly paper: Rgb;
  readonly size?: Pt;
}

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

const mulberry32 = (seed: number) => {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

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

const worldOf = (p: Puppet, numbers: Readonly<Record<string, number>>) => {
  const w: Record<string, number> = {};
  for (const b of p.bones) w[b.name] = (numbers[b.name] ?? 0) + (b.parent ? w[b.parent]! : 0);
  return w;
};

const deg = (p: Pt, q: Pt) => (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
const wrapDeg = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const aroundRest = ([lo, hi]: Pt): Pt => [
  +Math.max(-170, Math.min(lo, -20)).toFixed(1),
  +Math.min(170, Math.max(hi, 20)).toFixed(1),
];

const limitsOf = (p: Puppet) => {
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

const armLimits = (b: Bone, shoulder: Bone, hip: Pt): Pt => {
  const left = shoulder.pivot[0] < hip[0];
  const a0 = deg(shoulder.pivot, shoulder.tip);
  if (b === shoulder) {
    const [lo, hi] = left ? [64, 214] : [-34, 116];
    const c = wrapDeg(a0 - (lo + hi) / 2) + (lo + hi) / 2;
    return aroundRest([lo - c, hi - c]);
  }
  const f0 = wrapDeg(deg(b.pivot, b.tip) - a0);
  const [lo, hi] = left ? [-150, 10] : [-10, 150];
  return aroundRest([lo - f0, hi - f0]);
};

const placeOf = (p: Puppet, scale: number, cx: number, bottom: number): Pt => [
  cx + scale * (p.root[0] - p.width / 2),
  bottom + scale * (p.root[1] - p.height),
];

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

const keyPose = (p: Puppet, limits: Record<string, Pt>, rnd: () => number) =>
  Object.fromEntries(
    p.bones.map((b) => {
      const [lo, hi] = limits[b.name]!;
      return [b.name, +(lo + (hi - lo) * rnd()).toFixed(3)];
    }),
  );

export const sample = (spec: PoseSpec, seed: number): PoseSample => {
  const rnd = mulberry32(seed);
  const numbers = keyPose(spec.puppet, limitsOf(spec.puppet), rnd);
  const { scale, root, paper } = placed(spec, rnd);
  return frameOf(spec, numbers, root, scale, paper);
};
