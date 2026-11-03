import { rng } from '../core/random.ts';
import type { Camera } from './camera.ts';
import { keepAtMost, offscreen, patternOf } from './paper.ts';

export const FIBRE_SIZE = 320;

export const PLANE_FIBRE = 1;

let tile: HTMLCanvasElement | undefined;

const wrapped = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  reach: number,
  paint: (x: number, y: number) => void,
) => {
  for (const dx of [-FIBRE_SIZE, 0, FIBRE_SIZE])
    for (const dy of [-FIBRE_SIZE, 0, FIBRE_SIZE]) {
      const px = x + dx;
      const py = y + dy;
      if (px + reach < 0 || py + reach < 0) continue;
      if (px - reach > FIBRE_SIZE || py - reach > FIBRE_SIZE) continue;
      paint(px, py);
    }
};

const fibreTile = (): HTMLCanvasElement => {
  if (tile !== undefined) return tile;
  const { c, ctx } = offscreen(FIBRE_SIZE, FIBRE_SIZE);
  const r = rng(7331);
  for (let i = 0; i < 26; i++) {
    const x = r() * FIBRE_SIZE;
    const y = r() * FIBRE_SIZE;
    const radius = 25 + r() * 50;
    const tone = r() > 0.5 ? 255 : 0;
    const alpha = 0.12 + r() * 0.08;
    wrapped(ctx, x, y, radius, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, radius);
      g.addColorStop(0, `rgba(${tone}, ${tone}, ${tone}, ${alpha})`);
      g.addColorStop(1, `rgba(${tone}, ${tone}, ${tone}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
    });
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 3200; i++) {
    const x = r() * FIBRE_SIZE;
    const y = r() * FIBRE_SIZE;
    const len = 2 + r() * 7;
    const a = r() * Math.PI;
    const dx = Math.cos(a) * len;
    const dy = Math.sin(a) * len;
    ctx.strokeStyle = r() > 0.5 ? '#ffffff' : '#000000';
    ctx.globalAlpha = 0.08 + r() * 0.14;
    ctx.lineWidth = 1 + r();
    wrapped(ctx, x, y, len + 2, (px, py) => {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + dx, py + dy);
      ctx.stroke();
    });
  }
  tile = c;
  return c;
};

const SCALES_KEPT = 12;

const scaled = new Map<number, HTMLCanvasElement>();

const scaledTile = (period: number): HTMLCanvasElement => {
  const have = scaled.get(period);
  if (have !== undefined) return have;
  if (period === FIBRE_SIZE) return fibreTile();
  const { c, ctx } = offscreen(period, period);
  ctx.imageSmoothingQuality = 'high';
  for (const dx of [-period, 0, period])
    for (const dy of [-period, 0, period]) ctx.drawImage(fibreTile(), dx, dy, period, period);
  return keepAtMost(scaled, period, c, SCALES_KEPT);
};

const wrap = (n: number, period: number) => ((n % period) + period) % period;

export const planeFibre = (
  ctx: CanvasRenderingContext2D,
  view: Camera,
  w: number,
  h: number,
  strength = PLANE_FIBRE,
) => {
  if (strength <= 0) return;
  const zoom = view.zoom ?? 1;
  const rot = view.rot ?? 0;
  const m = ctx.getTransform();
  ctx.save();
  ctx.globalAlpha *= strength;
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = 'soft-light';
  if (rot === 0 && m.b === 0 && m.c === 0 && m.a === m.d && m.a > 0) {
    const period = Math.max(8, Math.round(FIBRE_SIZE * zoom * m.a));
    const pattern = patternOf(ctx, scaledTile(period));
    if (pattern !== null) {
      const cx = Math.round(view.x / FIBRE_SIZE) * FIBRE_SIZE;
      const cy = Math.round(view.y / FIBRE_SIZE) * FIBRE_SIZE;
      const ox = Math.round(wrap(m.a * (w / 2 + zoom * (cx - view.x)) + m.e, period));
      const oy = Math.round(wrap(m.d * (h / 2 + zoom * (cy - view.y)) + m.f, period));
      ctx.setTransform(1, 0, 0, 1, ox, oy);
      ctx.fillStyle = pattern;
      ctx.fillRect(m.e - ox, m.f - oy, m.a * w, m.d * h);
    }
    ctx.restore();
    return;
  }
  const pattern = patternOf(ctx, fibreTile());
  if (pattern !== null) {
    const spread = (Math.abs(Math.cos(rot)) + Math.abs(Math.sin(rot))) / zoom;
    const hw = (w / 2) * spread + 2;
    const hh = (h / 2) * spread + 2;
    ctx.translate(w / 2, h / 2);
    if (rot !== 0) ctx.rotate(rot);
    ctx.scale(zoom, zoom);
    ctx.translate(-view.x, -view.y);
    ctx.fillStyle = pattern;
    ctx.fillRect(view.x - hw, view.y - hh, hw * 2, hh * 2);
  }
  ctx.restore();
};
