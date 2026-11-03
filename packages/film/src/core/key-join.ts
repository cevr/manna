import type { Rgb } from './cast-sheet-pixels.ts';
import type { Raster } from './raster.ts';

export const KEY_JOIN_INK = 96;

export const inkLike = (r: number, g: number, b: number, ink: Rgb) =>
  Math.hypot(r - ink[0], g - ink[1], b - ink[2]) <= KEY_JOIN_INK;

export const keyJoin = (body: Raster, key: Raster, ink: Rgb, width: number): Raster => {
  const { width: W, height: H } = body;
  const rgba = Uint8Array.from(body.rgba);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (body.rgba[i + 3]! < 128 || covers(key, x, y)) continue;
      const best = nearestCovered(key, x, y, width);
      if (best < 0) continue;
      const [r, g, b] = [body.rgba[i]!, body.rgba[i + 1]!, body.rgba[i + 2]!];
      const to = key.rgba.subarray(best, best + 3);
      const rim = () =>
        Math.hypot(r - ink[0], g - ink[1], b - ink[2]) <
          Math.hypot(r - to[0]!, g - to[1]!, b - to[2]!) && besideInk(body, key, ink, x, y);
      if (inkLike(r, g, b, ink) || rim()) rgba.set(to, i);
    }
  return { width: W, height: H, rgba };
};

const besideInk = (body: Raster, key: Raster, ink: Rgb, x: number, y: number) => {
  for (let qy = Math.max(0, y - 1); qy <= Math.min(body.height - 1, y + 1); qy++)
    for (let qx = Math.max(0, x - 1); qx <= Math.min(body.width - 1, x + 1); qx++) {
      const q = (qy * body.width + qx) * 4;
      if ((qx === x && qy === y) || body.rgba[q + 3]! < 128 || covers(key, qx, qy)) continue;
      if (inkLike(body.rgba[q]!, body.rgba[q + 1]!, body.rgba[q + 2]!, ink)) return true;
    }
  return false;
};

const covers = (key: Raster, x: number, y: number) => key.rgba[(y * key.width + x) * 4 + 3]! >= 128;

const nearestCovered = (key: Raster, x: number, y: number, width: number) => {
  const r = Math.ceil(width);
  let best = -1;
  let bestD = width * width;
  for (let qy = Math.max(0, y - r); qy <= Math.min(key.height - 1, y + r); qy++)
    for (let qx = Math.max(0, x - r); qx <= Math.min(key.width - 1, x + r); qx++) {
      const d = (qx - x) ** 2 + (qy - y) ** 2;
      if (d < bestD || (d === bestD && best < 0)) {
        if (covers(key, qx, qy)) [best, bestD] = [(qy * key.width + qx) * 4, d];
      }
    }
  return best;
};
