import { Array as Arr, Option } from 'effect';
import { hash2 } from './random.ts';

export type Track = (t: number) => number;

type Point = readonly [time: number, value: number];

interface Secant {
  readonly t0: number;
  readonly t1: number;
  readonly v0: number;
  readonly v1: number;
  readonly h: number;
  readonly d: number;
}

interface Span extends Secant {
  readonly m0: number;
  readonly m1: number;
}

const slopeAt = (before: Secant, after: Secant): number => {
  if (before.d * after.d <= 0) return 0;
  const w0 = 2 * after.h + before.h;
  const w1 = after.h + 2 * before.h;
  return (w0 + w1) / (w0 / before.d + w1 / after.d);
};

const along = (s: Span, t: number): number => {
  const u = (t - s.t0) / s.h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    s.v0 + (s.v1 - s.v0) * (3 * u2 - 2 * u3) + s.h * (s.m0 * (u3 - 2 * u2 + u) + s.m1 * (u3 - u2))
  );
};

export const curve = (keys: ReadonlyArray<Point>): Track => {
  const secants = Arr.zipWith(keys, keys.slice(1), ([t0, v0], [t1, v1]) => ({
    t0,
    t1,
    v0,
    v1,
    h: t1 - t0,
    d: (v1 - v0) / (t1 - t0),
  }));
  const slopes = [0, ...Arr.zipWith(secants, secants.slice(1), slopeAt), 0];
  const spans: ReadonlyArray<Span> = Arr.zipWith(
    secants,
    Arr.zip(slopes, slopes.slice(1)),
    (s, [m0, m1]) => ({ ...s, m0, m1 }),
  );
  const end = Option.match(Arr.last(keys), { onNone: () => 0, onSome: ([, v]) => v });
  return (t) =>
    Option.match(
      Arr.findFirst(spans, (s) => t < s.t1),
      {
        onNone: () => end,
        onSome: (s) => {
          if (t <= s.t0) return s.v0;
          return along(s, t);
        },
      },
    );
};

interface Move {
  readonly at: number;
  readonly dur: number;
  readonly to: number;
  readonly anticipate?: number;
  readonly overshoot?: number;
}

const DIP_AT = 0.2;
const PAST_AT = 0.6;

const MIN_DUR = 0.001;

export const act = (from: number, moves: ReadonlyArray<Move>): Track => {
  if (moves.length === 0) return () => from;
  const keys: Point[] = [];
  let value = from;
  let free = -Infinity;
  for (const move of moves) {
    const start = Math.max(move.at, free);
    const dur = Math.max(move.dur, MIN_DUR);
    const size = move.to - value;
    if (free < start) keys.push([start, value]);
    if (move.anticipate) keys.push([start + DIP_AT * dur, value - move.anticipate * size]);
    if (move.overshoot) keys.push([start + PAST_AT * dur, move.to + move.overshoot * size]);
    keys.push([start + dur, move.to]);
    value = move.to;
    free = start + dur;
  }
  return curve(keys);
};

export const lag =
  (track: Track, delay: number): Track =>
  (t) =>
    track(t - delay);

interface Idle {
  readonly breath: number;
  readonly sway: number;
  readonly tilt: number;
  readonly drift: number;
}

const SPREAD = 0.6180339887498949;
const PHASE_STEP = 0.5698402909980532;

const frac = (x: number): number => x - Math.floor(x);

interface Wave {
  readonly lo: number;
  readonly hi: number;
  readonly u: number;
  readonly v: number;
}

const BREATH: Wave = { lo: 3.2, hi: 3.9, u: 0.5, v: 0.5 };
const TILT: Wave = { lo: 4.2, hi: 4.9, u: 0.13, v: 0.71 };
const SWAY_SHORT: Wave = { lo: 5.6, hi: 7.0, u: 0.37, v: 0.29 };
const SWAY_LONG: Wave = { lo: 8.2, hi: 10.5, u: 0.83, v: 0.07 };
const DRIFT: Wave = { lo: 13, hi: 18, u: 0.61, v: 0.43 };

const SWAY_SHORT_DEG = 0.6;
const SWAY_LONG_DEG = 0.4;
const TILT_DEG = 2;

const waveOf = (wave: Wave, seed: number): Track => {
  const period = wave.lo + (wave.hi - wave.lo) * frac(wave.u + seed * SPREAD);
  const phase = 2 * Math.PI * frac(wave.v + seed * PHASE_STEP);
  return (t) => Math.sin((2 * Math.PI * t) / period + phase);
};

export const idle = (seed: number): ((t: number) => Idle) => {
  const breath = waveOf(BREATH, seed);
  const tilt = waveOf(TILT, seed);
  const swayShort = waveOf(SWAY_SHORT, seed);
  const swayLong = waveOf(SWAY_LONG, seed);
  const drift = waveOf(DRIFT, seed);
  return (t) => ({
    breath: breath(t),
    sway: SWAY_SHORT_DEG * swayShort(t) + SWAY_LONG_DEG * swayLong(t),
    tilt: TILT_DEG * tilt(t),
    drift: drift(t),
  });
};

const SHUT = 0.11;
const OPEN = 0.19;

const EVERY = 3.5;
const JITTER = 0.25;

const BLINK_SALT = 6151;

const APART = 0.5;

const smooth = (x: number): number => x * x * (3 - 2 * x);

const lids = (a: number): number => {
  if (a <= 0 || a >= SHUT + OPEN) return 0;
  if (a < SHUT) return smooth(a / SHUT);
  return smooth(1 - (a - SHUT) / OPEN);
};

export const blink = (seed: number, on: ReadonlyArray<number> = []): Track => {
  const offset = EVERY * frac(0.5 + seed * SPREAD);
  const startOf = (k: number) =>
    offset + k * EVERY + JITTER * (2 * hash2(Math.imul(seed, BLINK_SALT) + 1, k) - 1);
  const ownNear = (t: number) => {
    const k = Math.floor((t - offset) / EVERY);
    return [startOf(k - 1), startOf(k), startOf(k + 1)];
  };
  const cued = [...on]
    .sort((a, b) => a - b)
    .filter((c) => ownNear(c).every((s) => Math.abs(c - s) >= APART))
    .reduce<ReadonlyArray<number>>(
      (kept, c) =>
        Option.match(Arr.last(kept), {
          onNone: () => [c],
          onSome: (last) => {
            if (c - last < APART) return kept;
            return [...kept, c];
          },
        }),
      [],
    );
  return (t) => {
    let shut = 0;
    for (const s of ownNear(t)) shut = Math.max(shut, lids(t - s));
    for (const c of cued) shut = Math.max(shut, lids(t - c));
    return shut;
  };
};
