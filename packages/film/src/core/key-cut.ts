// A drawn key cut into a part sheet's frame. The key is a drawing of a kept
// view in a new pose of one limb (an image model's output, at its own scale and
// place). `fitKey` registers it to the kept view by a similarity (scale and
// shift) fitted over the pixels the pose leaves still; `keyInFrame` resamples
// it into a frame laid over the kept view (3x3 samples a pixel, bilinear);
// `cutLimb` cuts the limb out of it: the limb's paint flooded from its two
// bones inside two capsules round them (ink and skin as walls, the paper
// reached from the border as ground), then the ink within 10 px of that
// paint, then the holes closed, cropped to its box. The hand past the wrist is
// left out. Given the kept view's ink, the cut's silhouette is inked at the
// house width (`INK_WIDTH`) before the crop. Pure.

import { Option } from 'effect';
import { type Rgb, labOf, rgbAt } from './cast-sheet-pixels.ts';
import { rgbOfLab } from './part-sheet.ts';
import type { Raster } from './raster.ts';

/**
 * The house ink's width across a figure's outline, sheet px: the kept front's arm read across its
 * outline (the median run of L* < 40, 0.25 px steps from its alpha edge inward).
 */
export const INK_WIDTH = 7.75;
/** How far past the house line a drawn outline may run and still be taken into it, px. */
const OUTLINE_SLACK = 6;

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

/** The line's depth: a hair past `INK_WIDTH`, so a reading on 0.25 px steps from the edge keeps it. */
const LINE = INK_WIDTH + 0.02;

/** Each mask px's depth (its centre's distance to the nearest open px square) and its unit normal. */
interface DepthField {
  readonly depth: Float64Array;
  readonly nx: Float64Array;
  readonly ny: Float64Array;
}

/**
 * The depth field of `mask` in a `w` x `h` frame, stamped from every open px (off the frame is
 * open) beside the mask, `reach` px round it.
 */
const depthField = (
  w: number,
  h: number,
  mask: Uint8Array,
  open: (i: number) => boolean,
  reach: number,
): DepthField => {
  const n = w * h;
  const inMask = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const isOpen = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h || (!mask[y * w + x] && open(y * w + x));
  const field = {
    depth: new Float64Array(n).fill(Infinity),
    nx: new Float64Array(n),
    ny: new Float64Array(n),
  };
  const stamp = (bx: number, by: number) => {
    for (let y = Math.max(0, by - reach); y <= Math.min(h - 1, by + reach); y++)
      for (let x = Math.max(0, bx - reach); x <= Math.min(w - 1, bx + reach); x++) {
        const i = y * w + x;
        const [cx, cy] = [x + 0.5, y + 0.5];
        const [qx, qy] = [Math.max(bx, Math.min(bx + 1, cx)), Math.max(by, Math.min(by + 1, cy))];
        const d = Math.hypot(cx - qx, cy - qy);
        if (!mask[i] || d >= (field.depth[i] ?? 0)) continue;
        field.depth[i] = d;
        field.nx[i] = (cx - qx) / d;
        field.ny[i] = (cy - qy) / d;
      }
  };
  const besideMask = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (inMask(x + dx, y + dy)) return true;
    return false;
  };
  for (let y = -1; y <= h; y++)
    for (let x = -1; x <= w; x++) if (isOpen(x, y) && besideMask(x, y)) stamp(x, y);
  return field;
};

/**
 * The colour of the px across the line at depth `d`, mixed in Lab from `ink` toward `base` so the
 * bilinear crossing of L* 40 falls at `LINE`.
 */
const crossingColour = (ink: Rgb, base: Rgb, d: number): Rgb => {
  const t = LINE - d;
  const target = (() => {
    if (t >= 0) return (40 - t * base[0]) / (1 - t);
    return ink[0] + (40 - ink[0]) / (1 + t);
  })();
  const share = Math.max(0, Math.min(1, (target - ink[0]) / (base[0] - ink[0])));
  const mix = (c: 0 | 1 | 2) => ink[c] + share * (base[c] - ink[c]);
  return rgbOfLab([mix(0), mix(1), mix(2)]);
};

/**
 * `r` with the outline of `mask`'s silhouette inked at `INK_WIDTH` in `ink` (Lab). The silhouette's
 * edge is every side of the mask but its cut ends: where `open` px (out of the mask) meet it. Px
 * under the line's depth less half a px are ink; the px across it is mixed toward the ink so the
 * bilinear L* 40 crossing falls at `LINE`. A drawn outline that runs on past the line (its ink
 * unbroken from the line, ending within `OUTLINE_SLACK`) gives way to the paint behind it, so the
 * drawing's line and the house line are one. Deeper px, and ink that runs on deeper (a fold, dark
 * paint), are untouched.
 */
const outlined = (r: Raster, mask: Uint8Array, open: (i: number) => boolean, ink: Rgb): Raster => {
  const { width: w, height: h } = r;
  const n = w * h;
  const { depth, nx, ny } = depthField(w, h, mask, open, Math.ceil(LINE + OUTLINE_SLACK + 2));
  const depthAt = (i: number) => depth[i] ?? Infinity;
  const labs = Array.from({ length: n }, (_, i) => labOf(rgbAt(r, i)));
  const isInk = (i: number) => (labs[i]?.[0] ?? 100) < 40;
  const rgba = Uint8Array.from(r.rgba);
  const full = rgbOfLab(ink);
  /** The px `k` px along px `i`'s normal (inward for k > 0), or -1 off the mask. */
  const along = (i: number, k: number) => {
    const x = Math.floor((i % w) + 0.5 + (nx[i] ?? 0) * k);
    const y = Math.floor(Math.floor(i / w) + 0.5 + (ny[i] ?? 0) * k);
    if (x < 0 || y < 0 || x >= w || y >= h || mask[y * w + x] !== 1) return -1;
    return y * w + x;
  };
  /**
   * For an ink px at or past the line: the paint behind it when it is a drawn outline running on
   * past the line (ink unbroken back to the line, and paint within the slack behind it), else -1.
   */
  const behindOf = (i: number) => {
    const d = depthAt(i);
    for (let k = 1; k <= d - LINE + 0.5; k++) {
      const j = along(i, -k);
      if (j < 0 || !(depthAt(j) < LINE + 0.5 || isInk(j))) return -1;
    }
    for (let k = 1; k <= LINE + 1.5 + OUTLINE_SLACK - d; k++) {
      const j = along(i, k);
      if (j < 0) return -1;
      if (!isInk(j)) return j;
    }
    return -1;
  };
  /** Paint (not ink) stands behind itself; ink stands behind its paint, if any. */
  const paintBehind = (i: number) => {
    if (isInk(i)) return behindOf(i);
    return i;
  };
  for (let i = 0; i < n; i++) {
    const d = depthAt(i);
    if (!mask[i] || d > LINE + 0.5 + OUTLINE_SLACK) continue;
    const behind = paintBehind(i);
    const crossing = d < LINE + 0.5;
    if (d <= LINE - 0.5 || (behind < 0 && crossing)) rgba.set(full, i * 4);
    else if (behind >= 0 && crossing)
      rgba.set(crossingColour(ink, labs[behind] ?? [100, 0, 0], d), i * 4);
    else if (behind >= 0 && behind !== i) rgba.set(rgbAt(r, behind), i * 4);
  }
  return { ...r, rgba };
};

/** `limb` cut out of `r` (a key in its frame, on paper `ground`); with `line` (the ink's Lab), its silhouette inked at `INK_WIDTH`. */
export const cutLimb = (
  r: Raster,
  ground: Rgb,
  limb: Limb,
  line: Option.Option<Rgb> = Option.none(),
): LimbCut => {
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
  // the silhouette's edge: where the limb meets the paper, or a drawn edge inside the capsules; not
  // where a capsule cut the figure through (the shoulder's end, the wrist's)
  const lined = Option.match(line, {
    onNone: () => r,
    onSome: (lab) => outlined(r, mask, (i) => !isFig(i) || cap[i] === 1, lab),
  });
  return cropped(lined, mask);
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
