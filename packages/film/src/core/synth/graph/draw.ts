import { fnv1a, hash2, rng } from '../../random.ts';
import { exp, log } from './math.ts';
import { type Pick, type Value, isPick, isVary } from './nodes.ts';

const TWO_32 = 4294967296;

export const streamSeed = (seed: number, name: string): number =>
  (hash2(seed, fnv1a(name)) * TWO_32) >>> 0;

export const uniform = (seed: number, field: string): number => rng(streamSeed(seed, field))();

export interface Draws {
  readonly seed: number;
  readonly variant: number;
}

const picked = <U>(pick: Pick<U>, draws: Draws, field: string): U => {
  const k = pick.of.length;
  const index =
    pick.by === 'seed'
      ? (((draws.variant - 1) % k) + k) % k
      : Math.min(k - 1, Math.floor(uniform(draws.seed, field) * k));
  return pick.of[index] ?? pick.of[0];
};

export const drawValue = <U>(
  value: Value<U>,
  toNumber: (u: U) => number,
  draws: Draws,
  field: string,
): number => {
  if (isPick(value)) return toNumber(picked(value, draws, field));
  if (!isVary(value)) return toNumber(value);
  const lo = toNumber(value.min);
  const hi = toNumber(value.max);
  const u = uniform(draws.seed, field);
  if (value.curve === 'log') return exp(log(lo) + u * (log(hi) - log(lo)));
  return lo + u * (hi - lo);
};

export const drawInt = (value: Value<number>, draws: Draws, field: string): number => {
  if (isPick(value)) return picked(value, draws, field);
  if (!isVary(value)) return value;
  const lo = Math.min(value.min, value.max);
  const hi = Math.max(value.min, value.max);
  return Math.min(hi, lo + Math.floor(uniform(draws.seed, field) * (hi - lo + 1)));
};

export const plain = (u: number): number => u;
