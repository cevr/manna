// A drawn key cut into a part sheet's frame. The key is a drawing of a kept
// view in a new pose of one limb (an image model's output, at its own scale and
// place). `fitKey` registers it to the kept view by a similarity (scale and
// shift) fitted over the pixels the pose leaves still; `keyInFrame` resamples
// it into a frame laid over the kept view (3x3 samples a pixel, bilinear);
// `cutLimb` cuts the limb out of it: the limb's paint flooded from its two
// bones inside two capsules round them (ink and skin as walls, the paper
// reached from the border as ground), then the ink within 10 px of that
// paint, then the holes closed, cropped to its box. The hand past the wrist is
// left out. Pure.

import { type Rgb, labOf, rgbAt } from './cast-sheet-pixels.ts';
import type { Raster } from './raster.ts';

export type KeyPt = readonly [number, number];

/** Drawn px = s × view px + (dx, dy); `error` the mean channel difference over the still pixels; `ground` the drawing's paper. */
export interface KeyFit {
  readonly s: number;
  readonly dx: number;
  readonly dy: number;
  readonly error: number;
  readonly ground: Rgb;
}

/** A limb's bones in the frame's px: root to elbow (radius `rUpper`), elbow to wrist (radius `rFore`). */
export interface Limb {
  readonly root: KeyPt;
  readonly elbow: KeyPt;
  readonly wrist: KeyPt;
  readonly rUpper: number;
  readonly rFore: number;
}

/** The cut limb's pixels (opaque inside, clear outside) and its box's top left in the frame. */
export interface LimbCut {
  readonly raster: Raster;
  readonly at: KeyPt;
}

const rgbOrGround = (r: Raster, x: number, y: number, ground: Rgb): Rgb => {
  if (x < 0 || y < 0 || x >= r.width || y >= r.height) return ground;
  return rgbAt(r, y * r.width + x);
};
const median = (vs: readonly number[]) => [...vs].sort((a, b) => a - b)[vs.length >> 1] ?? 0;
type Box = readonly [x0: number, y0: number, x1: number, y1: number];
/** The box (inclusive) of the pixels `keep` holds; [∞, ∞, -1, -1] when it holds none. */
const boxWhere = (width: number, n: number, keep: (i: number) => boolean): Box => {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -1, -1];
  for (let i = 0; i < n; i++) {
    if (!keep(i)) continue;
    const [x, y] = [i % width, Math.floor(i / width)];
    [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  }
  return [x0, y0, x1, y1];
};
const away = (c: Rgb, d: Rgb) =>
  Math.abs(c[0] - d[0]) + Math.abs(c[1] - d[1]) + Math.abs(c[2] - d[2]);

/** The paper: the median of the border's pixels, channel by channel. */
export const groundOfKey = (r: Raster): Rgb => {
  const cs: Rgb[] = [];
  for (let x = 0; x < r.width; x += 2) cs.push(rgbAt(r, x), rgbAt(r, (r.height - 1) * r.width + x));
  for (let y = 0; y < r.height; y += 2)
    cs.push(rgbAt(r, y * r.width), rgbAt(r, y * r.width + r.width - 1));
  return [median(cs.map((c) => c[0])), median(cs.map((c) => c[1])), median(cs.map((c) => c[2]))];
};

/** The box (inclusive) of the pixels more than 60 away from the paper. */
const boxOf = (r: Raster, ground: Rgb) =>
  boxWhere(r.width, r.width * r.height, (i) => away(rgbAt(r, i), ground) > 60);

/**
 * `drawn` registered to `view`: a start from the figures' boxes (heights
 * matched, right edges and tops met), then a grid search in three stages over
 * scale and shift, scored on every second pixel of `view` that `still` keeps.
 */
export const fitKey = (
  drawn: Raster,
  view: Raster,
  still: (x: number, y: number) => boolean,
): KeyFit => {
  const ground = groundOfKey(drawn);
  const [, vy0, vx1, vy1] = boxOf(view, groundOfKey(view));
  const [, dy0, dx1, dy1] = boxOf(drawn, ground);
  const pts: KeyPt[] = [];
  for (let y = 0; y < view.height; y += 2)
    for (let x = 0; x < view.width; x += 2) if (still(x, y)) pts.push([x, y]);
  const error = (s: number, dx: number, dy: number) => {
    let e = 0;
    for (const [x, y] of pts) {
      const at = rgbOrGround(drawn, Math.round(s * x + dx), Math.round(s * y + dy), ground);
      e += away(rgbAt(view, y * view.width + x), at);
    }
    return e / pts.length / 3;
  };
  const s0 = (dy1 - dy0) / (vy1 - vy0);
  const start = { s: s0, dx: dx1 - s0 * vx1, dy: dy0 - s0 * vy0 };
  let best = { ...start, error: error(start.s, start.dx, start.dy) };
  for (const [ds, step] of [
    [0.04, 12],
    [0.012, 4],
    [0.004, 1.5],
  ] as const) {
    const c = best;
    for (let i = -4; i <= 4; i++)
      for (let j = -4; j <= 4; j++)
        for (let k = -4; k <= 4; k++) {
          const t = { s: c.s * (1 + (i * ds) / 4), dx: c.dx + j * step, dy: c.dy + k * step };
          const e = error(t.s, t.dx, t.dy);
          if (e < best.error) best = { ...t, error: e };
        }
  }
  return { ...best, ground };
};

const bilinear = (r: Raster, x: number, y: number, ground: Rgb): Rgb => {
  const [x0, y0] = [Math.floor(x), Math.floor(y)];
  const [fx, fy] = [x - x0, y - y0];
  const mix = (k: 0 | 1 | 2) =>
    (rgbOrGround(r, x0, y0, ground)[k] * (1 - fx) + rgbOrGround(r, x0 + 1, y0, ground)[k] * fx) *
      (1 - fy) +
    (rgbOrGround(r, x0, y0 + 1, ground)[k] * (1 - fx) +
      rgbOrGround(r, x0 + 1, y0 + 1, ground)[k] * fx) *
      fy;
  return [mix(0), mix(1), mix(2)];
};

/**
 * `drawn` resampled by `fit` into a `width` × `height` frame whose pixel
 * (x, y) lies on the view's (x - origin[0], y - origin[1]); opaque, 3x3
 * bilinear samples a pixel.
 */
export const keyInFrame = (
  drawn: Raster,
  fit: KeyFit,
  frame: readonly [width: number, height: number],
  origin: KeyPt,
): Raster => {
  const [width, height] = frame;
  const rgba = new Uint8Array(width * height * 4);
  const N = 3;
  for (let cy = 0; cy < height; cy++)
    for (let cx = 0; cx < width; cx++) {
      let [r, g, b] = [0, 0, 0];
      for (let a = 0; a < N; a++)
        for (let bb = 0; bb < N; bb++) {
          const vx = cx - origin[0] + (a + 0.5) / N - 0.5;
          const vy = cy - origin[1] + (bb + 0.5) / N - 0.5;
          const c = bilinear(drawn, fit.s * vx + fit.dx, fit.s * vy + fit.dy, fit.ground);
          [r, g, b] = [r + c[0], g + c[1], b + c[2]];
        }
      const i = (cy * width + cx) * 4;
      rgba.set([Math.round(r / (N * N)), Math.round(g / (N * N)), Math.round(b / (N * N)), 255], i);
    }
  return { width, height, rgba };
};

const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** The pixels reached from `seeds` through 4-neighbours that `pass` lets in. */
const flood = (
  width: number,
  height: number,
  seeds: readonly number[],
  pass: (i: number) => boolean,
) => {
  const reached = new Uint8Array(width * height);
  const stack = seeds.filter(pass);
  for (const i of stack) reached[i] = 1;
  while (stack.length > 0) {
    const i = stack.pop() ?? 0;
    const [x, y] = [i % width, Math.floor(i / width)];
    for (const [dx, dy] of STEPS) {
      const [nx, ny] = [x + dx, y + dy];
      const k = ny * width + nx;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || reached[k] || !pass(k)) continue;
      reached[k] = 1;
      stack.push(k);
    }
  }
  return reached;
};

const borderOf = (width: number, height: number) =>
  Array.from({ length: width * height }, (_, i) => i).filter((i) => {
    const [x, y] = [i % width, Math.floor(i / width)];
    return x === 0 || y === 0 || x === width - 1 || y === height - 1;
  });

const segDist = (p: KeyPt, a: KeyPt, b: KeyPt) => {
  const [vx, vy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy)),
  );
  return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy);
};

/** Each pixel's class: ink (L* under 40), skin (warm and light), figure (away from the paper), inside the capsules. */
const classesOf = (r: Raster, ground: Rgb, limb: Limb) => {
  const n = r.width * r.height;
  const [ink, skin, fig, cap] = [
    new Uint8Array(n),
    new Uint8Array(n),
    new Uint8Array(n),
    new Uint8Array(n),
  ];
  const { root, elbow, wrist } = limb;
  const fl = Math.hypot(wrist[0] - elbow[0], wrist[1] - elbow[1]);
  const fd = [(wrist[0] - elbow[0]) / fl, (wrist[1] - elbow[1]) / fl] as const;
  for (let i = 0; i < n; i++) {
    const p: KeyPt = [(i % r.width) + 0.5, Math.floor(i / r.width) + 0.5];
    const [l, a, b] = labOf(rgbAt(r, i));
    ink[i] = Number(l < 40);
    skin[i] = Number(l >= 40 && a > 14 && b > 18);
    fig[i] = Number(l < 40 || away(rgbAt(r, i), ground) > 45);
    const past = (p[0] - elbow[0]) * fd[0] + (p[1] - elbow[1]) * fd[1] > fl + 1;
    cap[i] = Number(
      !past && (segDist(p, root, elbow) <= limb.rUpper || segDist(p, elbow, wrist) <= limb.rFore),
    );
  }
  return { ink, skin, fig, cap };
};

/** Every pixel within `radius` of one `of` marks. */
const grown = (width: number, height: number, of: Uint8Array, radius: number) => {
  const out = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    if (!of[i]) continue;
    const [x, y] = [i % width, Math.floor(i / width)];
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        const [nx, ny] = [x + dx, y + dy];
        if (dx * dx + dy * dy <= radius * radius && nx >= 0 && ny >= 0 && nx < width && ny < height)
          out[ny * width + nx] = 1;
      }
  }
  return out;
};

const cropped = (r: Raster, mask: Uint8Array): LimbCut => {
  const [bx0, by0, x1, y1] = boxWhere(r.width, mask.length, (i) => mask[i] === 1);
  const [x0, y0] = [Math.min(bx0, r.width), Math.min(by0, r.height)];
  const [width, height] = [Math.max(0, x1 - x0 + 1), Math.max(0, y1 - y0 + 1)];
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y + y0) * r.width + x + x0;
      if (mask[i]) rgba.set([...rgbAt(r, i), 255], (y * width + x) * 4);
    }
  return { raster: { width, height, rgba }, at: [x0, y0] };
};

/** `limb` cut out of `r` (a key in its frame, on paper `ground`). */
export const cutLimb = (r: Raster, ground: Rgb, limb: Limb): LimbCut => {
  const { width, height } = r;
  const { ink, skin, fig, cap } = classesOf(r, ground, limb);
  const border = borderOf(width, height);
  // the figure: all that the paper reached from the border does not take
  const groundFlood = flood(width, height, border, (i) => !fig[i]);
  const isFig = (i: number) => !groundFlood[i];
  // the limb's paint, flooded from its bones at tenths of their length
  const seeds: number[] = [];
  for (let t = 1; t <= 9; t++)
    for (const [a, b] of [
      [limb.root, limb.elbow],
      [limb.elbow, limb.wrist],
    ] as const)
      seeds.push(
        Math.floor(a[1] + ((b[1] - a[1]) * t) / 10) * width +
          Math.floor(a[0] + ((b[0] - a[0]) * t) / 10),
      );
  const mask = flood(width, height, seeds, (i) => !!cap[i] && isFig(i) && !ink[i] && !skin[i]);
  // the ink within 10 px of the paint, inside the capsules
  const near = grown(width, height, mask, 10);
  for (let i = 0; i < mask.length; i++) if (near[i] && ink[i] && cap[i]) mask[i] = 1;
  // the holes closed: what the outside cannot reach, inside the capsules and not skin
  const outside = flood(width, height, border, (i) => !mask[i]);
  for (let i = 0; i < mask.length; i++) if (!outside[i] && cap[i] && !skin[i]) mask[i] = 1;
  return cropped(r, mask);
};

/**
 * Where a circle hand stands on a limb: `reach` px past the wrist along elbow to wrist, so the
 * hand meets the cuff at the same distance in every pose. (The drawn key keeps no hand: the cut
 * stops at the wrist, and the kept hand is laid over at this point.)
 */
export const handPast = (elbow: KeyPt, wrist: KeyPt, reach: number): KeyPt => {
  const [dx, dy] = [wrist[0] - elbow[0], wrist[1] - elbow[1]];
  const n = Math.hypot(dx, dy) || 1;
  return [wrist[0] + (reach * dx) / n, wrist[1] + (reach * dy) / n];
};
