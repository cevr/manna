import { hash2, rng } from '../core/random.ts';
import type { Pt } from './ink.ts';

export type Rng = () => number;

export type Life = (r: Rng) => number;

export type Each = (age: number, life: number, r: Rng, i: number) => void;

const LIFE_SALT = 911;

const particleRng = (seed: number, i: number, salt = 0): Rng =>
  rng((hash2(hash2(seed, salt) * 4294967296, i) * 4294967296) >>> 0);

export const fly = (
  x: number,
  y: number,
  vx: number,
  vy: number,
  t: number,
  g = 0,
  drag = 0,
): Pt => {
  if (drag <= 0) return [x + vx * t, y + vy * t + 0.5 * g * t * t];
  const f = (1 - Math.exp(-drag * t)) / drag;
  const vt = g / drag;
  return [x + vx * f, y + vt * t + (vy - vt) * f];
};

export const flyV = (vx: number, vy: number, t: number, g = 0, drag = 0): Pt => {
  if (drag <= 0) return [vx, vy + g * t];
  const e = Math.exp(-drag * t);
  const vt = g / drag;
  return [vx * e, vt + (vy - vt) * e];
};

export const burst = (n: number, seed: number, fn: (r: Rng, i: number) => void): void => {
  for (let i = 0; i < n; i++) fn(particleRng(seed, i), i);
};

export const cycle = (
  t: number,
  period: number,
  count: number,
  seed: number,
  life: Life,
  fn: Each,
): void => {
  for (let i = 0; i < count; i++) {
    const g = particleRng(seed, i, LIFE_SALT);
    const born = g() * period;
    const l = life(g);
    for (let age = (((t - born) % period) + period) % period; age < l; age += period)
      fn(age, l, particleRng(seed, i), i);
  }
};

export const stream = (
  t: number,
  t0: number,
  t1: number,
  rate: number,
  seed: number,
  life: Life,
  fn: Each,
): void => {
  const n = Math.floor((Math.min(t, t1) - t0) * rate);
  for (let i = 0; i <= n; i++) {
    const age = t - (t0 + i / rate);
    const l = life(particleRng(seed, i, LIFE_SALT));
    if (age >= 0 && age < l) fn(age, l, particleRng(seed, i), i);
  }
};
