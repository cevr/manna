import { type Vec2, vec2 } from 'math';
import { type Boil, type Hand, type Path, type Pt, boilPhase, resample } from './ink.ts';
import { offscreen, patternOf } from './paper.ts';
import { probeOf, recordInk } from './probe.ts';
import { hash2, noise1, rng } from '../core/random.ts';

interface CutoutStyle {
  color: string;
  torn?: number;
  rim?: number;
  rimColor?: string;
  shadow?: number;
  grain?: number;
  alpha?: number;
  boil?: Boil;
}

const PAPER_CORE = '#fbf6ea';

const heights = new WeakMap<CanvasRenderingContext2D, number>();

export const raised = (ctx: CanvasRenderingContext2D, height: number, draw: () => void) => {
  const before = heights.get(ctx);
  heights.set(ctx, (before ?? 1) * height);
  try {
    draw();
  } finally {
    if (before === undefined) heights.delete(ctx);
    else heights.set(ctx, before);
  }
};

export const heightOf = (ctx: CanvasRenderingContext2D) => heights.get(ctx) ?? 1;

const normal: Vec2 = [0, 0];

const TEAR_TICK_PHASE = 0.9;

const tear = (shape: Path, amount: number, rough: number, seed: number, phase: number): Pt[] => {
  const closed = [...shape, shape[0] ?? [0, 0]];
  const pts = resample(closed, 3);
  const n = pts.length;
  if (n < 3) return pts;
  let area = 0;
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i] ?? [0, 0];
    const b = pts[i + 1] ?? [0, 0];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const out = area > 0 ? -1 : 1;
  const res: Pt[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i] ?? [0, 0];
    const prev = pts[(i - 1 + n) % n] ?? p;
    const next = pts[(i + 1) % n] ?? p;
    if (i > 0) s += 3;
    normal[0] = next[1] - prev[1];
    normal[1] = -(next[0] - prev[0]);
    vec2.normalize(normal, normal);
    const nx = normal[0] * out;
    const ny = normal[1] * out;
    const d =
      amount +
      rough * (0.65 * noise1(s * 0.035, seed) + 0.35 * (hash2(i, seed) * 2 - 1)) +
      0.4 * noise1(s * 0.05 + phase, seed + 5);
    res.push([p[0] + nx * d, p[1] + ny * d]);
  }
  return res;
};

const trace = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>) => {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
  ctx.closePath();
};

let pastel: HTMLCanvasElement | undefined;

const pastelTile = (): HTMLCanvasElement => {
  if (pastel !== undefined) return pastel;
  const { c, ctx } = offscreen(320, 320);
  const r = rng(4242);
  ctx.lineCap = 'round';
  for (let i = 0; i < 2600; i++) {
    const x = r() * 320;
    const y = r() * 320;
    const len = 4 + r() * 16;
    const a = -0.5 + (r() - 0.5) * 0.35;
    ctx.strokeStyle = r() > 0.5 ? '#ffffff' : '#000000';
    ctx.globalAlpha = 0.05 + r() * 0.12;
    ctx.lineWidth = 0.6 + r() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  pastel = c;
  return c;
};

interface Face {
  readonly tile: HTMLCanvasElement;
  readonly opaque: boolean;
}

const FACES = 128;
const faces = new Map<string, Map<number, Face>>();
let faceCount = 0;

const faceOf = (color: string, grain: number): Face => {
  const have = faces.get(color)?.get(grain);
  if (have !== undefined) return have;
  if (faceCount >= FACES) {
    faces.clear();
    faceCount = 0;
  }
  const { c, ctx } = offscreen(320, 320);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 320, 320);
  const opaque = ctx.getImageData(0, 0, 1, 1).data[3] === 255;
  ctx.globalAlpha = grain;
  ctx.globalCompositeOperation = 'soft-light';
  ctx.drawImage(pastelTile(), 0, 0);
  const face: Face = { tile: c, opaque };
  const byGrain = faces.get(color) ?? new Map<number, Face>();
  byGrain.set(grain, face);
  faces.set(color, byGrain);
  faceCount++;
  return face;
};

export type FaceState = Pick<
  CanvasRenderingContext2D,
  | 'globalAlpha'
  | 'globalCompositeOperation'
  | 'filter'
  | 'shadowColor'
  | 'shadowBlur'
  | 'shadowOffsetX'
  | 'shadowOffsetY'
>;

const shadowless = (s: FaceState) =>
  s.shadowColor === 'rgba(0, 0, 0, 0)' ||
  s.shadowColor === 'transparent' ||
  (s.shadowBlur === 0 && s.shadowOffsetX === 0 && s.shadowOffsetY === 0);

export const preblends = (s: FaceState): boolean =>
  s.globalAlpha === 1 &&
  s.globalCompositeOperation === 'source-over' &&
  s.filter === 'none' &&
  shadowless(s);

type Linear = Pick<DOMMatrixReadOnly, 'a' | 'b' | 'c' | 'd'>;

export const stretchOf = (m: Linear): number => {
  const p = m.a * m.a + m.b * m.b;
  const q = m.c * m.c + m.d * m.d;
  const r = m.a * m.c + m.b * m.d;
  return Math.sqrt((p + q) / 2 + Math.sqrt(((p - q) / 2) ** 2 + r * r));
};

const PREBLEND_STRETCH = 1.05;

export const magnifies = (m: Linear): boolean => stretchOf(m) > PREBLEND_STRETCH;

const PLACED = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

const pastelAt = (pattern: CanvasPattern, hand: Hand) => {
  PLACED.e = hand.seed % 320;
  PLACED.f = (hand.seed >> 8) % 320;
  pattern.setTransform(PLACED);
};

export const blendedFace = (
  ctx: CanvasRenderingContext2D,
  face: ReadonlyArray<Pt>,
  style: CutoutStyle,
  grain: number,
  hand: Hand,
): boolean => {
  if (grain <= 0 || !preblends(ctx) || magnifies(ctx.getTransform())) return false;
  const blended = faceOf(style.color, grain);
  if (!blended.opaque) return false;
  const pattern = patternOf(ctx, blended.tile);
  if (pattern === null) return false;
  pastelAt(pattern, hand);
  ctx.fillStyle = pattern;
  trace(ctx, face);
  ctx.fill();
  return true;
};

export const layeredFace = (
  ctx: CanvasRenderingContext2D,
  face: ReadonlyArray<Pt>,
  style: CutoutStyle,
  grain: number,
  hand: Hand,
) => {
  ctx.fillStyle = style.color;
  trace(ctx, face);
  ctx.fill();
  if (grain <= 0) return;
  ctx.save();
  trace(ctx, face);
  ctx.clip();
  const pattern = patternOf(ctx, pastelTile());
  if (pattern !== null) {
    pastelAt(pattern, hand);
    ctx.globalAlpha *= grain;
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = pattern;
    ctx.fill();
  }
  ctx.restore();
};

export const cutout = (
  ctx: CanvasRenderingContext2D,
  shape: Path,
  style: CutoutStyle,
  hand: Hand,
) => {
  if (shape.length < 3) return;
  const torn = style.torn ?? 4;
  const rim = style.rim ?? 3;
  const phase = boilPhase(style.boil ?? 'tick', hand.boil, TEAR_TICK_PHASE);
  const face = tear(shape, 0, torn, hand.seed, phase);
  ctx.save();
  ctx.globalAlpha *= style.alpha ?? 1;

  const lift = style.shadow ?? 0.5;
  const under = rim > 0 ? tear(shape, rim, torn * 1.3, hand.seed + 17, phase) : face;
  if (lift > 0) {
    const height = heightOf(ctx);
    ctx.save();
    ctx.shadowColor = `rgba(40, 28, 16, ${(0.28 * lift) / Math.sqrt(height)})`;
    ctx.shadowBlur = 10 * lift * height;
    ctx.shadowOffsetX = 2 * lift * height;
    ctx.shadowOffsetY = 5 * lift * height;
    ctx.fillStyle = rim > 0 ? (style.rimColor ?? PAPER_CORE) : style.color;
    trace(ctx, under);
    ctx.fill();
    ctx.restore();
  } else if (rim > 0) {
    ctx.fillStyle = style.rimColor ?? PAPER_CORE;
    trace(ctx, under);
    ctx.fill();
  }

  const grain = style.grain ?? 0.6;
  if (!blendedFace(ctx, face, style, grain, hand)) layeredFace(ctx, face, style, grain, hand);
  const probe = probeOf(ctx);
  if (probe !== undefined) recordInk(ctx, probe, 'fill', shape, 0, ctx.globalAlpha);
  ctx.restore();
};

export interface Place {
  x: number;
  y: number;
  rot?: number;
  scale?: number;
  sx?: number;
  sy?: number;
}

export const at = (ctx: CanvasRenderingContext2D, p: Place, draw: () => void) => {
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.rot !== undefined) ctx.rotate(p.rot);
  const s = p.scale ?? 1;
  ctx.scale(s * (p.sx ?? 1), s * (p.sy ?? 1));
  draw();
  ctx.restore();
};
