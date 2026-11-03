import { CANON_HEADS, type Slot, type Stature } from './cast-sheet.ts';
import type { Raster } from './raster.ts';

type Rgb = readonly [number, number, number];

const GROUND_PAPER: Rgb = [243, 234, 216];
const MANNEQUIN: Rgb = [228, 220, 206];
const MANNEQUIN_INK: Rgb = [120, 98, 84];

interface UnderlaySize {
  readonly width: number;
  readonly height: number;
  readonly hand: number;
}

const UNDERLAY_SIZE: UnderlaySize = { width: 1536, height: 1024, hand: 0.33 };

interface Pose {
  readonly x: number;
  readonly turn: number;
  readonly back: boolean;
  readonly shown: boolean;
}

const turnOf = (slot: Slot, profile: boolean): number =>
  ({ front: 0, back: 0, free: 0, left: profile ? -1 : -0.6, right: profile ? 1 : 0.6 })[slot];

const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

interface Frame {
  readonly h: number;
  readonly heads: number;
  readonly hw: number;
  readonly hcy: number;
  readonly chin: number;
  readonly hem: number;
  readonly ground: number;
  readonly t: number;
  readonly shoulder: number;
  readonly hemHalf: number;
}

const frameOf = (p: Pose, ground: number, h: number, heads: number): Frame => {
  const top = ground - heads * h;
  const t = Math.abs(p.turn);
  return {
    h,
    heads,
    hw: 0.84 * h,
    hcy: top + h / 2,
    chin: top + h * 0.96,
    hem: ground - 0.1 * h,
    ground,
    t,
    shoulder: (0.4 - 0.1 * t) * h,
    hemHalf: (0.5 - 0.12 * t) * h,
  };
};

const inHead = (p: Pose, f: Frame, x: number, y: number) => {
  if (inEllipse(x, y, p.x, f.hcy, f.hw / 2, f.h / 2)) return true;
  if (p.turn === 0 || p.back) return false;
  const nx = p.x + Math.sign(p.turn) * (f.hw / 2) * (f.t === 1 ? 1 : 0.94);
  return inEllipse(x, y, nx, f.hcy + 0.08 * f.h, 0.09 * f.h, 0.07 * f.h);
};

const inBody = (p: Pose, f: Frame, x: number, y: number) => {
  if (y < f.chin || y > f.hem) return false;
  const half = f.shoulder + (f.hemHalf - f.shoulder) * ((y - f.chin) / (f.hem - f.chin));
  const knee = f.chin + 0.25 * f.h;
  const round = y < knee ? Math.sqrt(Math.max(0, 1 - ((knee - y) / (0.25 * f.h)) ** 2)) : 1;
  return Math.abs(x - p.x) <= half * (0.75 + 0.25 * round);
};

const inCapsule = (
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
) => {
  const [dx, dy] = [bx - ax, by - ay];
  const k = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return (x - ax - k * dx) ** 2 + (y - ay - k * dy) ** 2 <= r * r;
};

const inArms = (p: Pose, f: Frame, x: number, y: number, handShare: number) => {
  const r = (handShare * f.h) / 2;
  const handY = f.chin + 0.5 * (f.hem - f.chin);
  const sides = f.t === 1 ? [Math.sign(p.turn)] : [-1, 1];
  return sides.some((side) => {
    const reach = f.t === 1 ? 0.1 * f.h : (f.shoulder + f.hemHalf) / 2;
    const [sx, sy] = [p.x + side * (f.t === 1 ? 0 : f.shoulder - r), f.chin + 0.12 * f.h];
    const hx = p.x + side * reach;
    return inCapsule(x, y, sx, sy, hx, handY - 1.2 * r, r) || inEllipse(x, y, hx, handY, r, r);
  });
};

const inFeet = (p: Pose, f: Frame, x: number, y: number) => {
  const dir = Math.sign(p.turn);
  return [-1, 1].some((side) => {
    const fx = p.back
      ? p.x + side * 0.28 * f.h
      : p.x + side * (0.28 - 0.18 * f.t) * f.h + dir * 0.18 * f.h * f.t;
    const rx = p.back ? 0.12 * f.h : (0.14 + 0.1 * f.t) * f.h;
    return inEllipse(x, y, fx, f.ground - 0.06 * f.h, rx, 0.07 * f.h);
  });
};

const inside = (p: Pose, f: Frame, x: number, y: number, handShare: number) =>
  p.shown &&
  y >= f.hcy - f.h &&
  y <= f.ground &&
  Math.abs(x - p.x) <= 1.2 * f.h &&
  (inHead(p, f, x, y) || inBody(p, f, x, y) || inArms(p, f, x, y, handShare) || inFeet(p, f, x, y));

const eyeAt = (p: Pose, f: Frame, x: number, y: number) => {
  if (p.back) return false;
  const { h, hw } = f;
  const ey = f.ground - f.heads * h + h * 0.52;
  const r = 0.045 * h;
  const s = Math.sign(p.turn);
  const centres =
    p.turn === 0
      ? [p.x - 0.2 * hw, p.x + 0.2 * hw]
      : Math.abs(p.turn) === 1
        ? [p.x + s * 0.3 * hw]
        : [p.x + s * 0.05 * hw, p.x + s * 0.34 * hw];
  return centres.some((cx) => inEllipse(x, y, cx, ey, r, r * 1.3));
};

const EDGE = 3;

const edgeAt = (mask: Uint8Array, W: number, H: number, x: number, y: number) => {
  for (let dy = -EDGE; dy <= EDGE; dy++)
    for (let dx = -EDGE; dx <= EDGE; dx++) {
      const [nx, ny] = [x + dx, y + dy];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || mask[ny * W + nx] === 0) return true;
    }
  return false;
};

interface UnderlayViews {
  readonly slots: ReadonlyArray<Slot>;
  readonly profiles: ReadonlyArray<number>;
  readonly shown: ReadonlyArray<number>;
  readonly statures?: ReadonlyArray<Stature>;
}

const CANON_STATURE: Stature = { height: 1, heads: CANON_HEADS };

export const mannequinUnderlay = (
  { slots, profiles, shown, statures = [] }: UnderlayViews,
  size: UnderlaySize = UNDERLAY_SIZE,
): Raster => {
  const { width: W, height: H } = size;
  const ground = Math.round(0.91 * H);
  const step = W / slots.length;
  const sized = slots.map((_, k) => statures[k] ?? CANON_STATURE);
  const grown = Math.min(
    ...sized.map((s) => (0.8 * H) / s.height),
    ...sized.map((s) => ((step / 2.1) * s.heads) / s.height),
  );
  const poses: ReadonlyArray<Pose> = slots.map((slot, k) => ({
    x: step * (k + 0.5),
    turn: turnOf(slot, profiles.includes(k + 1)),
    back: slot === 'back',
    shown: shown.includes(k + 1),
  }));
  const column = (x: number) => Math.min(poses.length - 1, Math.max(0, Math.floor(x / step)));
  const nearest = (x: number) => poses[column(x)]!;
  const frames = poses.map((p, k) => {
    const s = sized[k]!;
    return frameOf(p, ground, (s.height * grown) / s.heads, s.heads);
  });
  const mask = new Uint8Array(W * H);
  const arms = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [p, f] = [nearest(x), frames[column(x)]!];
      mask[y * W + x] = inside(p, f, x, y, size.hand) ? 1 : 0;
      arms[y * W + x] = mask[y * W + x] === 1 && inArms(p, f, x, y, size.hand) ? 1 : 0;
    }
  const colourAt = (x: number, y: number): Rgb => {
    if (mask[y * W + x] === 0) return GROUND_PAPER;
    const inked =
      edgeAt(mask, W, H, x, y) ||
      (arms[y * W + x] === 1 && edgeAt(arms, W, H, x, y)) ||
      eyeAt(nearest(x), frames[column(x)]!, x, y);
    return inked ? MANNEQUIN_INK : MANNEQUIN;
  };
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [r, g, b] = colourAt(x, y);
      const i = (y * W + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  return { width: W, height: H, rgba };
};
