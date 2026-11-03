import { type Box, type Hex, mix } from '@manna/film/canvas';
import { clamp, hash2 } from '@manna/film/core';
import type { Ramp } from './palette.ts';

export interface Easel {
  readonly ctx: CanvasRenderingContext2D;
  readonly view: Box;
  readonly px: number;
}

export type Shape = (ctx: CanvasRenderingContext2D) => void;

export interface Stroke {
  readonly ramp: Ramp;
  readonly tone: (x: number, y: number) => number;
  readonly box: Box;
  readonly seed: number;
  readonly dir?: number;
  readonly spread?: number;
  readonly size?: number;
  readonly ratio?: number;
  readonly jitter?: number;
  readonly turn?: (x: number, y: number) => number;
  readonly load?: number;
  readonly accent?: { readonly color: Hex; readonly share: number };
  readonly density?: number;
}

export const paintAt = (ramp: Ramp, t: number): Hex => {
  const k = clamp(t) * 4;
  const i = Math.min(3, Math.floor(k));
  return mix(ramp[i] ?? ramp[0], ramp[i + 1] ?? ramp[4], k - i);
};

const MOST = 4000;

const LAID = 0.34;

export const BRUSH_PX = 960;

const LOADS = 8;

const UNDER = 12;

const TAU = Math.PI * 2;

interface Area {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

const underpaint = (
  ctx: CanvasRenderingContext2D,
  s: Stroke,
  a: Area,
  cell: number,
  dir: number,
) => {
  const under: number[][] = Array.from({ length: UNDER }, () => []);
  for (let y = Math.floor(a.y0 / cell) * cell; y < a.y1; y += cell)
    for (let x = Math.floor(a.x0 / cell) * cell; x < a.x1; x += cell) {
      const level = Math.min(
        UNDER - 1,
        Math.floor(clamp(s.tone(x + cell / 2, y + cell / 2)) * UNDER),
      );
      under[level]?.push(x, y);
    }
  for (const [n, cells] of under.entries()) {
    if (cells.length === 0) continue;
    ctx.fillStyle = paintAt(s.ramp, (n + 0.5) / UNDER);
    ctx.beginPath();
    for (let c = 0; c < cells.length; c += 2) {
      const cx = (cells[c] ?? 0) + cell / 2;
      const cy = (cells[c + 1] ?? 0) + cell / 2;
      ctx.moveTo(cx + Math.cos(dir) * cell * 0.95, cy + Math.sin(dir) * cell * 0.95);
      ctx.ellipse(cx, cy, cell * 0.95, cell * 0.74, dir, 0, TAU);
    }
    ctx.fill();
  }
};

const sortDabs = (s: Stroke, a: Area, pitch: number) => {
  const dir = s.dir ?? -0.5;
  const spread = s.spread ?? 0.25;
  const jitter = s.jitter ?? 0.07;
  const per = Math.max(1, Math.round(s.density ?? 1));
  const len = pitch * 3.1;
  const share = s.accent?.share ?? 0;
  const loads: number[][] = Array.from({ length: LOADS * 2 }, () => []);
  const i0 = Math.floor(a.x0 / pitch) - 1;
  const i1 = Math.ceil(a.x1 / pitch) + 1;
  const j0 = Math.floor(a.y0 / pitch) - 1;
  const j1 = Math.ceil(a.y1 / pitch) + 1;
  const keep = Math.min(LAID, MOST / Math.max(1, (i1 - i0 + 1) * (j1 - j0 + 1) * per));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++)
      for (let k = 0; k < per; k++) {
        if (hash2(i * 3 + k * 5, j * 5 + s.seed * 3 + 11) >= keep) continue;
        const h = hash2(i * 7919 + s.seed + k * 104729, j * 6271 - s.seed);
        const h2 = hash2(j * 31 + k, i * 17 + s.seed);
        const h3 = hash2(i + 3 * k, j + s.seed * 13);
        const x = (i + h) * pitch;
        const y = (j + h2) * pitch;
        const tone = clamp(s.tone(x, y) + (h3 - 0.5) * 2 * jitter);
        const accented = hash2(i * 13 + k, j * 29 + s.seed) < share;
        const load = Math.min(LOADS - 1, Math.floor(tone * LOADS)) + (accented ? LOADS : 0);
        const turn = s.turn?.(x, y) ?? 0;
        loads[load]?.push(x, y, dir + turn + (h2 - 0.5) * 2 * spread, len * (0.7 + 0.6 * h3), h);
      }
  return loads;
};

const layDabs = (
  ctx: CanvasRenderingContext2D,
  s: Stroke,
  loads: ReadonlyArray<ReadonlyArray<number>>,
) => {
  const ratio = s.ratio ?? 0.26;
  ctx.globalAlpha *= s.load ?? 0.8;
  for (const [n, dabs] of loads.entries()) {
    if (dabs.length === 0) continue;
    const own = paintAt(s.ramp, ((n % LOADS) + 0.5) / LOADS);
    ctx.fillStyle = n >= LOADS ? mix(own, s.accent?.color ?? own, 0.4) : own;
    ctx.beginPath();
    for (let d = 0; d < dabs.length; d += 5) {
      const x = dabs[d] ?? 0;
      const y = dabs[d + 1] ?? 0;
      const rot = dabs[d + 2] ?? 0;
      const l = dabs[d + 3] ?? 1;
      const w = l * ratio * (0.8 + 0.4 * (dabs[d + 4] ?? 0));
      ctx.moveTo(x + Math.cos(rot) * l * 0.5, y + Math.sin(rot) * l * 0.5);
      ctx.ellipse(x, y, l * 0.5, w * 0.5, rot, 0, TAU);
    }
    ctx.fill();
  }
};

export const paint = (e: Easel, shape: Shape, s: Stroke) => {
  const { ctx, view } = e;
  const a: Area = {
    x0: Math.max(s.box.x, view.x),
    y0: Math.max(s.box.y, view.y),
    x1: Math.min(s.box.x + s.box.w, view.x + view.w),
    y1: Math.min(s.box.y + s.box.h, view.y + view.h),
  };
  if (a.x1 <= a.x0 || a.y1 <= a.y0) return;
  const pitch = 2 ** Math.round(Math.log2(Math.max(0.05, (s.size ?? 16) * 0.4 * e.px)));
  ctx.save();
  ctx.beginPath();
  shape(ctx);
  ctx.clip();
  underpaint(ctx, s, a, pitch * 4, s.dir ?? -0.5);
  layDabs(ctx, s, sortDabs(s, a, pitch));
  ctx.restore();
};

export interface Place {
  readonly x: number;
  readonly y: number;
  readonly rot?: number;
  readonly scale?: number;
  readonly flip?: boolean;
}

export const within = (e: Easel, p: Place, draw: (e: Easel) => void) => {
  const { ctx, view } = e;
  const rot = p.rot ?? 0;
  const s = p.scale ?? 1;
  const fx = p.flip === true ? -1 : 1;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(rot);
  ctx.scale(s * fx, s);
  const c = Math.cos(-rot);
  const n = Math.sin(-rot);
  const corners = [
    [view.x, view.y],
    [view.x + view.w, view.y],
    [view.x, view.y + view.h],
    [view.x + view.w, view.y + view.h],
  ].map(([wx = 0, wy = 0]): [number, number] => {
    const dx = wx - p.x;
    const dy = wy - p.y;
    return [((c * dx - n * dy) / s) * fx, (n * dx + c * dy) / s];
  });
  draw({ ctx, view: boxOf(corners), px: e.px / s });
  ctx.restore();
};

export const curve =
  (pts: ReadonlyArray<readonly [number, number]>, tension = 1): Shape =>
  (ctx) => {
    const n = pts.length;
    if (n < 3) return;
    const p = (i: number) => pts[((i % n) + n) % n] ?? [0, 0];
    const [sx, sy] = p(0);
    ctx.moveTo(sx, sy);
    for (let i = 0; i < n; i++) {
      const [ax, ay] = p(i - 1);
      const [bx, by] = p(i);
      const [cx, cy] = p(i + 1);
      const [dx, dy] = p(i + 2);
      const k = tension / 6;
      ctx.bezierCurveTo(
        bx + (cx - ax) * k,
        by + (cy - ay) * k,
        cx - (dx - bx) * k,
        cy - (dy - by) * k,
        cx,
        cy,
      );
    }
    ctx.closePath();
  };

export const poly =
  (pts: ReadonlyArray<readonly [number, number]>): Shape =>
  (ctx) => {
    for (const [i, [x, y]] of pts.entries()) {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

export const rect =
  (b: Box): Shape =>
  (ctx) =>
    ctx.rect(b.x, b.y, b.w, b.h);

export const oval =
  (x: number, y: number, rx: number, ry: number, rot = 0): Shape =>
  (ctx) => {
    ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
    ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
  };

export const boxOf = (pts: ReadonlyArray<readonly [number, number]>, pad = 0): Box => {
  const xs = pts.map(([x]) => x);
  const ys = pts.map(([, y]) => y);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
};

export const along = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax;
  const dy = by - ay;
  return clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1));
};

export const pool = (x: number, y: number, cx: number, cy: number, r: number) => {
  const d = clamp(Math.hypot(x - cx, y - cy) / r);
  return (1 - d) * (1 - d);
};

export const glow = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: Hex,
  alpha: number,
) => {
  if (alpha <= 0 || r <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = clamp(alpha);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(0.35, mix(color, '#000000', 0.55));
  g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  ctx.restore();
};

export const shade = (ctx: CanvasRenderingContext2D, shape: Shape, color: Hex, alpha: number) => {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp(alpha);
  ctx.fillStyle = color;
  ctx.beginPath();
  shape(ctx);
  ctx.fill();
  ctx.restore();
};
