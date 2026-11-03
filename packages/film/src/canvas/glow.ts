import { type Clear, type Hex, clearOf } from './colour.ts';
import { keepAtMost } from './paper.ts';

export const GRADIENTS_KEPT = 64;

type UnitKind = 'glow' | 'sky' | 'ground';

const kept: Record<UnitKind, WeakMap<CanvasRenderingContext2D, Map<string, CanvasGradient>>> = {
  glow: new WeakMap(),
  sky: new WeakMap(),
  ground: new WeakMap(),
};

export const unitGradient = <A>(
  ctx: CanvasRenderingContext2D,
  kind: UnitKind,
  key: string,
  make: (ctx: CanvasRenderingContext2D, of: A) => CanvasGradient,
  of: A,
): CanvasGradient => {
  const by = kept[kind];
  let mine = by.get(ctx);
  if (mine === undefined) {
    mine = new Map();
    by.set(ctx, mine);
  }
  const hit = mine.get(key);
  if (hit !== undefined) return hit;
  return keepAtMost(mine, key, make(ctx, of), GRADIENTS_KEPT);
};

const glowGradient = (ctx: CanvasRenderingContext2D, color: Hex) => {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, color);
  g.addColorStop(1, clearOf(color));
  return g;
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
  const g = unitGradient(ctx, 'glow', color, glowGradient, color);
  ctx.save();
  ctx.globalAlpha *= Math.min(1, alpha);
  ctx.translate(x, y);
  ctx.scale(r, r);
  ctx.fillStyle = g;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
};

const skyKey = (stops: ReadonlyArray<readonly [number, Hex | Clear]>) => {
  let key = '';
  for (const [at, color] of stops) key += `${at} ${color};`;
  return key;
};

const washGradient = (
  ctx: CanvasRenderingContext2D,
  stops: ReadonlyArray<readonly [number, Hex | Clear]>,
) => {
  const g = ctx.createLinearGradient(0, 0, 0, 1);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
};

export const wash = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  stops: ReadonlyArray<readonly [number, Hex | Clear]>,
) => {
  if (w <= 0 || h <= 0) return;
  const g = unitGradient(ctx, 'sky', skyKey(stops), washGradient, stops);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, h);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, 1);
  ctx.restore();
};

export const sky = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  stops: ReadonlyArray<readonly [number, Hex | Clear]>,
) => wash(ctx, 0, 0, w, h, stops);
