import { hash2, rng } from '../core/random.ts';
import type { Pt } from './ink.ts';

/** A seeded generator of floats in [0, 1): the film's `rng`. */
export type Rng = () => number;

/** A particle's life in seconds, drawn from its own rng (`() => 0.8` for one life for all). */
export type Life = (r: Rng) => number;

/**
 * Called for every live particle: its age and life in seconds, a fresh rng
 * for it (the same numbers at every t), and its index.
 */
export type Each = (age: number, life: number, r: Rng, i: number) => void;

/** Salt for the rng a particle's birth and life are drawn from, kept apart from the one `fn` gets. */
const LIFE_SALT = 911;

/** Particle `i`'s rng under `seed`, `salt` keeping its streams apart. */
const particleRng = (seed: number, i: number, salt = 0): Rng =>
  rng((hash2(hash2(seed, salt) * 4294967296, i) * 4294967296) >>> 0);

/**
 * Where a particle is `t` s after it leaves (x, y) at (vx, vy) px/s, under
 * gravity `g` px/s² (positive is down) and linear drag `drag` 1/s.
 */
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

/** Its velocity at `t`, px/s, for a streak that points along the motion. */
export const flyV = (vx: number, vy: number, t: number, g = 0, drag = 0): Pt => {
  if (drag <= 0) return [vx, vy + g * t];
  const e = Math.exp(-drag * t);
  const vt = g / drag;
  return [vx * e, vt + (vy - vt) * e];
};

/** `n` one-shot particles: `fn(r, i)` with an rng per particle, the same numbers at every t. */
export const burst = (n: number, seed: number, fn: (r: Rng, i: number) => void): void => {
  for (let i = 0; i < n; i++) fn(particleRng(seed, i), i);
};

/**
 * `count` particles that repeat every `period` s, a loop with no seam:
 * particle `i` is born at its own phase in the period and lives `life` s.
 * `fn` is called for every live copy, with the same rng for `i` each period.
 */
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

/**
 * An emitter that runs from `t0` to `t1`: particles born `rate` per second
 * from `t0`, the last at or before `t1`, each living `life` s. `fn` is called
 * for every particle alive at `t`, so it is empty before `t0` and again once
 * the last one born outlives its life.
 */
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
