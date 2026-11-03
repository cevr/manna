import { type Vec2, vec2 } from 'math';
import { probeOf, recordInk } from './probe.ts';
import { hash2, noise1 } from '../core/random.ts';
import { clamp, frameAtOrBefore, lerp } from '../core/time.ts';

export type Pt = readonly [number, number];
export type Path = ReadonlyArray<Pt>;

export const resample = (path: Path, spacing = 4): Pt[] => {
  const first = path[0];
  if (first === undefined) return [];
  const out: Pt[] = [first];
  let carry = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (a === undefined || b === undefined) continue;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let d = spacing - carry;
    while (d <= seg) {
      const t = d / seg;
      out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
      d += spacing;
    }
    carry = seg - (d - spacing);
  }
  const last = path[path.length - 1];
  if (last === undefined) return out;
  if (carry < ON_END) out[out.length - 1] = last;
  else out.push(last);
  return out;
};

const ON_END = 1e-6;

export const length = (path: Path): number => {
  let sum = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (a !== undefined && b !== undefined) sum += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return sum;
};

export const line = (a: Pt, b: Pt, bow = 0.02, seed = 0): Pt[] => {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const k = bow * (hash2(seed, 1) * 2 - 1);
  const c: Pt = [mx - dy * k, my + dx * k];
  return quad(a, c, b);
};

export const quad = (a: Pt, c: Pt, b: Pt, n = 24): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([
      u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
    ]);
  }
  return out;
};

export const spline = (pts: Path, perSeg = 12, closed = false): Pt[] => {
  const n = pts.length;
  if (n < 3) return [...pts];
  const at = (i: number): Pt => {
    const j = closed ? ((i % n) + n) % n : clamp(i, 0, n - 1);
    return pts[j] ?? pts[0] ?? [0, 0];
  };
  const out: Pt[] = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(closed ? at(0) : at(n - 1));
  return out;
};

export const ellipse = (
  cx: number,
  cy: number,
  rx: number,
  ry = rx,
  seed = 0,
  overshoot = 0.18,
): Pt[] => {
  const start = hash2(seed, 7) * Math.PI * 2;
  const sweep = Math.PI * 2 + overshoot;
  const n = Math.max(24, Math.round((rx + ry) * 0.25));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = start + (sweep * i) / n;
    const r = 1 + 0.025 * noise1(i * 0.35, seed);
    out.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
  }
  return out;
};

export const ellipseShape = (cx: number, cy: number, rx: number, ry = rx, n = 48): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
};

export const rectShape = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

export const plate = (x: number, y: number, w: number, h: number): Pt[] =>
  rectShape(x - w / 2, y - h / 2, w, h);

export const rounded = (x: number, y: number, w: number, h: number, r: number): Pt[] => {
  const k = Math.min(r, w / 2, h / 2);
  const corner = (cx: number, cy: number, from: number): Pt[] =>
    Array.from({ length: 7 }, (_, i): Pt => {
      const a = from + (Math.PI / 2) * (i / 6);
      return [cx + Math.cos(a) * k, cy + Math.sin(a) * k];
    });
  const l = x - w / 2 + k;
  const rr = x + w / 2 - k;
  const t = y - h / 2 + k;
  const b = y + h / 2 - k;
  return [
    ...corner(rr, t, -Math.PI / 2),
    ...corner(rr, b, 0),
    ...corner(l, b, Math.PI / 2),
    ...corner(l, t, Math.PI),
  ];
};

export const blob = (x: number, y: number, w: number, h: number, seed: number): Pt[] =>
  spline(
    Array.from({ length: 11 }, (_, i): Pt => {
      const a = (2 * Math.PI * i) / 11;
      const k = 0.78 + 0.3 * hash2(i, seed);
      return [x + ((Math.cos(a) * w) / 2) * k, y + ((Math.sin(a) * h) / 2) * k];
    }),
    6,
    true,
  );

const normal: Vec2 = [0, 0];

export const BOIL_FPS = 12;

export const boilTick = (T: number): number => frameAtOrBefore(T, BOIL_FPS);

export interface Hand {
  readonly boil: number;
  readonly seed: number;
}

export const sub = (hand: Hand, k: number): Hand => ({ boil: hand.boil, seed: hand.seed + k });

export type Boil = 'tick' | 'crawl' | 'none';

const TICK_PHASE = 3.7;

const NOISE_SLOPE = 3;

export const CRAWL_MAX = 0.3;

export const boilPhase = (boil: Boil, tick: number, perTick = TICK_PHASE): number => {
  if (boil === 'none') return 0;
  if (boil === 'tick') return tick * perTick;
  return tick * (CRAWL_MAX / (STROKE_JITTER * NOISE_SLOPE));
};

const normalAt = (pts: ReadonlyArray<Pt>, i: number, ring: boolean) => {
  const last = pts.length - 1;
  const p = pts[i] ?? [0, 0];
  const before = ring && i === 0 ? last - 1 : i - 1;
  const after = ring && i === last ? 1 : i + 1;
  const prev = pts[before] ?? p;
  const next = pts[after] ?? p;
  normal[0] = -(next[1] - prev[1]);
  normal[1] = next[0] - prev[0];
  vec2.normalize(normal, normal);
};

const alongNoise = (
  s: number,
  len: number,
  freq: number,
  phase: number,
  seed: number,
  ring: boolean,
) => {
  const here = noise1(s * freq + phase, seed);
  if (!ring || len <= 0) return here;
  const u = s / len;
  return here * (1 - u) + noise1((s - len) * freq + phase, seed) * u;
};

const wobble = (
  pts: ReadonlyArray<Pt>,
  amp: number,
  freq: number,
  hand: Hand,
  phase: number,
  ring: boolean,
): Pt[] => {
  if (amp === 0 || pts.length < 2) return [...pts];
  const len = ring ? length(pts) : 0;
  const out: Pt[] = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i] ?? [0, 0];
    const prev = pts[i - 1] ?? p;
    if (i > 0) s += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    normalAt(pts, i, ring);
    const d = amp * alongNoise(s, len, freq, phase, hand.seed, ring);
    out.push([p[0] + normal[0] * d, p[1] + normal[1] * d]);
  }
  return out;
};

export const STROKE_JITTER = 1.1;

export interface StrokeStyle {
  color: string;
  width: number;
  progress?: number;
  jitter?: number;
  boil?: Boil;
  taper?: number;
  closed?: boolean;
  pressure?: number;
  alpha?: number;
  marks?: ReadonlyArray<Hand>;
}

export const stroke = (
  ctx: CanvasRenderingContext2D,
  path: Path,
  style: StrokeStyle,
  hand: Hand,
) => {
  const progress = style.progress ?? 1;
  if (progress <= 0 || path.length < 2) return;
  const base = resample(path, Math.max(2, style.width * 0.6));
  const ring = style.closed === true && progress >= 1;
  const pts = wobble(
    base,
    style.jitter ?? STROKE_JITTER,
    0.012,
    hand,
    boilPhase(style.boil ?? 'tick', hand.boil),
    ring,
  );
  const total = length(pts);
  const drawn = trim(pts, total * clamp(progress));
  if (drawn.length < 2) return;

  const taper = style.taper ?? 0.18;
  const pressure = style.pressure ?? 0.3;
  const drawnLen = length(drawn);
  const left: Pt[] = [];
  const right: Pt[] = [];
  let s = 0;
  for (let i = 0; i < drawn.length; i++) {
    const p = drawn[i] ?? [0, 0];
    const prev = drawn[i - 1] ?? p;
    if (i > 0) s += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    normalAt(drawn, i, ring);
    const nx = normal[0];
    const ny = normal[1];
    const tail = ring ? 1 : taperCurve(s / (total * taper || 1));
    const head = ring ? 1 : taperCurve((drawnLen - s) / (total * taper || 1));
    const swell = 1 + pressure * alongNoise(s, drawnLen, 0.01, 0, hand.seed + 11, ring);
    const w = (style.width / 2) * Math.min(tail, head) * swell;
    left.push([p[0] + nx * w, p[1] + ny * w]);
    right.push([p[0] - nx * w, p[1] - ny * w]);
  }

  inkOutline(ctx, left, right, drawn, style);
};

const inkOutline = (
  ctx: CanvasRenderingContext2D,
  left: Path,
  right: Path,
  drawn: Path,
  style: StrokeStyle,
) => {
  ctx.save();
  ctx.globalAlpha *= style.alpha ?? 1;
  ctx.fillStyle = style.color;
  ctx.beginPath();
  const l0 = left[0] ?? [0, 0];
  ctx.moveTo(l0[0], l0[1]);
  for (const p of left) ctx.lineTo(p[0], p[1]);
  for (let i = right.length - 1; i >= 0; i--) {
    const p = right[i] ?? [0, 0];
    ctx.lineTo(p[0], p[1]);
  }
  ctx.closePath();
  ctx.fill();
  const probe = probeOf(ctx);
  if (probe !== undefined)
    recordInk(
      ctx,
      probe,
      'stroke',
      drawn,
      style.width,
      ctx.globalAlpha,
      style.marks?.map((h) => h.seed),
    );
  ctx.restore();
};

const taperCurve = (u: number) => {
  const t = clamp(u);
  return 0.35 + 0.65 * (t * t * (3 - 2 * t));
};

export const trim = (pts: Path, len: number): Pt[] => {
  const first = pts[0];
  if (first === undefined) return [];
  const out: Pt[] = [first];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] ?? first;
    const b = pts[i] ?? first;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + seg >= len) {
      const t = seg === 0 ? 0 : (len - acc) / seg;
      out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
      return out;
    }
    acc += seg;
    out.push(b);
  }
  return out;
};
