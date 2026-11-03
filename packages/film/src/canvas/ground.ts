import { unitGradient } from './glow.ts';

const GROUND_TINT: readonly [number, number, number] = [40, 28, 16];

export const GROUND_ALPHA = 0.28;

export const GROUND_FLAT = 0.12;

const shadowGradient = (ctx: CanvasRenderingContext2D, [r, g, b]: typeof GROUND_TINT) => {
  const made = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  made.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${GROUND_ALPHA})`);
  made.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${GROUND_ALPHA * 0.4})`);
  made.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  return made;
};

export const ground = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number) => {
  if (w <= 0) return;
  const rx = w / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, rx * GROUND_FLAT);
  ctx.fillStyle = unitGradient(ctx, 'ground', '', shadowGradient, GROUND_TINT);
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
};
