import type { Vec2 } from 'math';
import { fbm, hash2, rng } from '../core/random.ts';

export interface PaperStyle {
  base: string;
  tone: string;
  seed: number;
}

export interface Offscreen {
  readonly c: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
}

export const offscreen = (w: number, h: number): Offscreen => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx === null) throw new Error('2d context unavailable');
  return { c, ctx };
};

const patterns = new WeakMap<
  CanvasRenderingContext2D,
  WeakMap<HTMLCanvasElement, CanvasPattern | null>
>();

export const patternOf = (
  ctx: CanvasRenderingContext2D,
  tile: HTMLCanvasElement,
): CanvasPattern | null => {
  let mine = patterns.get(ctx);
  if (mine === undefined) {
    mine = new WeakMap();
    patterns.set(ctx, mine);
  }
  const have = mine.get(tile);
  if (have !== undefined) return have;
  const made = ctx.createPattern(tile, 'repeat');
  mine.set(tile, made);
  return made;
};

export const keepAtMost = <K, V>(kept: Map<K, V>, key: K, value: V, most: number): V => {
  if (kept.size >= most) {
    const oldest = kept.keys().next();
    if (oldest.done !== true) kept.delete(oldest.value);
  }
  kept.set(key, value);
  return value;
};

const noiseKept = new Map<string, Uint8ClampedArray>();

const NOISE_KEPT = 14;

const noisePixels = (
  key: string,
  length: number,
  fill: (data: Uint8ClampedArray) => void,
): Uint8ClampedArray => {
  const have = noiseKept.get(key);
  if (have !== undefined) return have;
  const data = new Uint8ClampedArray(length);
  fill(data);
  return keepAtMost(noiseKept, key, data, NOISE_KEPT);
};

export const makePaper = (w: number, h: number, style: PaperStyle): HTMLCanvasElement => {
  const { c, ctx } = offscreen(w, h);
  ctx.fillStyle = style.base;
  ctx.fillRect(0, 0, w, h);

  const lw = Math.ceil(w / 8);
  const lh = Math.ceil(h / 8);
  const low = offscreen(lw, lh);
  const img = low.ctx.createImageData(lw, lh);
  img.data.set(
    noisePixels(`mottle ${lw} ${lh} ${style.seed}`, lw * lh * 4, (data) => {
      for (let y = 0; y < lh; y++) {
        for (let x = 0; x < lw; x++) {
          const n = fbm(x / 28, y / 28, style.seed, 5);
          const i = (y * lw + x) * 4;
          const v = n > 0 ? 255 : 0;
          data[i] = v;
          data[i + 1] = v;
          data[i + 2] = v;
          data[i + 3] = Math.min(255, Math.abs(n) * 60);
        }
      }
    }),
  );
  low.ctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalCompositeOperation = 'soft-light';
  ctx.drawImage(low.c, 0, 0, w, h);
  ctx.restore();

  const r = rng(style.seed + 1);
  ctx.save();
  ctx.strokeStyle = style.tone;
  ctx.lineCap = 'round';
  const fibres = Math.round((w * h) / 2600);
  for (let i = 0; i < fibres; i++) {
    const x = r() * w;
    const y = r() * h;
    const len = 6 + r() * 22;
    const a = r() * Math.PI * 2;
    const bend = (r() - 0.5) * 0.8;
    ctx.globalAlpha = 0.03 + r() * 0.06;
    ctx.lineWidth = 0.5 + r() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(a + bend) * len * 0.5,
      y + Math.sin(a + bend) * len * 0.5,
      x + Math.cos(a) * len,
      y + Math.sin(a) * len,
    );
    ctx.stroke();
  }
  const flecks = Math.round((w * h) / 9000);
  for (let i = 0; i < flecks; i++) {
    ctx.globalAlpha = 0.05 + r() * 0.12;
    ctx.fillStyle = r() > 0.35 ? style.tone : '#ffffff';
    const s = 0.6 + r() * 1.6;
    ctx.fillRect(r() * w, r() * h, s, s);
  }
  ctx.restore();
  return c;
};

export interface Grain {
  readonly size: number;
  readonly sheets: ReadonlyArray<HTMLCanvasElement>;
}

const grainTile = (size: number, seed: number): HTMLCanvasElement => {
  const { c, ctx } = offscreen(size, size);
  const img = ctx.createImageData(size, size);
  img.data.set(
    noisePixels(`grain ${size} ${seed}`, size * size * 4, (data) => {
      for (let i = 0; i < size * size; i++) {
        const v = hash2(i, seed) * 255;
        data[i * 4] = v;
        data[i * 4 + 1] = v;
        data[i * 4 + 2] = v;
        data[i * 4 + 3] = 255;
      }
    }),
  );
  ctx.putImageData(img, 0, 0);
  return c;
};

export const makeGrain = (
  size: number,
  count: number,
  seed: number,
  w: number,
  h: number,
): Grain => ({
  size,
  sheets: Array.from({ length: count }, (_, k) => {
    const tile = grainTile(size, seed + k * 977);
    const { c, ctx } = offscreen(w + size, h + size);
    const pattern = ctx.createPattern(tile, 'repeat');
    if (pattern !== null) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    return c;
  }),
});

export const grainShift = (out: Vec2, boil: number, size: number): Vec2 => {
  out[0] = (size - ((boil * 137) % size)) % size;
  out[1] = (size - ((boil * 71) % size)) % size;
  return out;
};

const shift: Vec2 = [0, 0];

export const grain = (
  ctx: CanvasRenderingContext2D,
  film: Grain,
  boil: number,
  w: number,
  h: number,
  strength = 0.07,
) => grainRect(ctx, film, boil, 0, 0, w, h, strength);

export const grainRect = (
  ctx: CanvasRenderingContext2D,
  film: Grain,
  boil: number,
  x: number,
  y: number,
  w: number,
  h: number,
  strength = 0.07,
  sy = y,
) => {
  const sheet = film.sheets[boil % film.sheets.length];
  if (sheet === undefined || w <= 0 || h <= 0) return;
  grainShift(shift, boil, film.size);
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.globalCompositeOperation = 'overlay';
  ctx.drawImage(sheet, shift[0] + x, shift[1] + sy, w, h, x, y, w, h);
  ctx.restore();
};

const vignette = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
  strength = 0.35,
) => {
  const g = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.35,
    w / 2,
    h / 2,
    Math.hypot(w, h) * 0.6,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, color);
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
};

export const makeVignette = (
  w: number,
  h: number,
  color: string,
  strength = 0.35,
): HTMLCanvasElement => {
  const { c, ctx } = offscreen(w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  vignette(ctx, w, h, color, strength);
  return c;
};

export const makeLight = (w: number, h: number, color: string, edge: string): HTMLCanvasElement => {
  const { c, ctx } = offscreen(w, h);
  const g = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.25,
    w / 2,
    h / 2,
    Math.hypot(w, h) / 2,
  );
  g.addColorStop(0, color);
  g.addColorStop(1, edge);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return c;
};

export const makeProduct = (
  w: number,
  h: number,
  first: HTMLCanvasElement,
  amount: number,
  second: HTMLCanvasElement,
): HTMLCanvasElement => {
  const { c, ctx } = offscreen(w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  shadeBy(ctx, first, amount);
  shadeBy(ctx, second);
  return c;
};

export const shadeBy = (ctx: CanvasRenderingContext2D, sheet: HTMLCanvasElement, amount = 1) => {
  ctx.save();
  ctx.globalAlpha = amount;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(sheet, 0, 0);
  ctx.restore();
};
