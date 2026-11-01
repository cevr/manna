/**
 * The octave class of `detect`, drawn: plucks whose half period or double
 * stands near the period's own key, each read at its fundamental within 3
 * cents, or 5 when stiff (the stretched upper partials pull a period
 * reading sharp). Its own seeded draw (xorshift32), apart from the unit's
 * acceptance file, over two families:
 *
 * - strong even partials over a weak fundamental and weak odd partials,
 *   which lift the half period's key near the period's (read an octave up
 *   unless the period's key at the double lag wins);
 * - high plucks, 500 to 700 Hz, with 6 to 8 partials, whose short period
 *   puts the sample nearest each key well under it.
 *
 * Each across the six strings' bands, 44.1 or 48 kHz, a decay, a start
 * after the pluck, harmonic or stiff (inharmonicity B in (0, 1e-4]), clean
 * or under white noise at 30 dB SNR or better: the domain in which the
 * octave rule holds that the double stands no higher at the true period.
 */

import { describe, expect, it } from 'bun:test';
import { Array as Arr, Option } from 'effect';

import { detect } from './pitch';
import { STRINGS } from './tuning';

const FRAME = 2048;
const CASES = 300;
const SEED = 20_261_031;

/** xorshift32 in [0, 1). */
const draw = (seed: number) => {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 2 ** 32;
  };
};

type Draw = () => number;

const between = (next: Draw, low: number, high: number) => low + (high - low) * next();

interface Pluck {
  readonly hz: number;
  readonly rate: number;
  readonly partials: ReadonlyArray<number>;
  readonly phases: ReadonlyArray<number>;
  readonly decay: number;
  readonly start: number;
  /** Noise RMS over signal RMS; 0 is clean. */
  readonly noise: number;
  /** Inharmonicity B: partial n sits at n·hz·√((1 + B n²)/(1 + B)). */
  readonly stiffness: number;
}

const rateOf = (next: Draw) => {
  if (next() < 0.5) return 44_100;
  return 48_000;
};

/** Half the plucks clean, half under noise 30 to 60 dB below the signal. */
const noiseOf = (next: Draw) => {
  if (next() < 0.5) return 0;
  return 10 ** (-between(next, 30, 60) / 20);
};

/** Half the plucks harmonic, half stiff: B in (0, 1e-4], wound to plain steel strings. */
const stiffnessOf = (next: Draw) => {
  if (next() < 0.5) return 0;
  return 1e-4 * (1 - next());
};

const common = (next: Draw, hz: number, partials: ReadonlyArray<number>): Pluck => ({
  hz,
  rate: rateOf(next),
  partials,
  phases: partials.map(() => between(next, 0, 2 * Math.PI)),
  decay: between(next, 0.8, 3),
  start: between(next, 0.05, 0.8),
  noise: noiseOf(next),
  stiffness: stiffnessOf(next),
});

/** Fundamental 0.25 to 0.4, even partials 0.6 to 1, odd ones above it 0.02 to 0.1. */
const evenHeavy = (next: Draw): Pluck => {
  const open = STRINGS[Math.floor(next() * STRINGS.length)]?.hz ?? 110;
  const hz = open * 2 ** (between(next, -50, 50) / 1200);
  const count = 4 + Math.floor(next() * 3);
  const partials = Array.from({ length: count }, (_, k) => {
    if (k === 0) return between(next, 0.25, 0.4);
    if (k % 2 === 1) return between(next, 0.6, 1);
    return between(next, 0.02, 0.1);
  });
  return common(next, hz, partials);
};

/** 500 to 700 Hz, 6 to 8 partials, the fundamental 0.25 to 0.4, the rest 0.2 to 1. */
const high = (next: Draw): Pluck => {
  const hz = between(next, 500, 700);
  const count = 6 + Math.floor(next() * 3);
  const partials = Array.from({ length: count }, (_, k) => {
    if (k === 0) return between(next, 0.25, 0.4);
    return between(next, 0.2, 1);
  });
  return common(next, hz, partials);
};

const frameOf = (p: Pluck, next: Draw) => {
  const out = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) {
    const t = p.start + i / p.rate;
    let sample = 0;
    p.partials.forEach((amplitude, k) => {
      const stretch = Math.sqrt((1 + p.stiffness * (k + 1) ** 2) / (1 + p.stiffness));
      sample +=
        amplitude * Math.sin(2 * Math.PI * p.hz * (k + 1) * stretch * t + (p.phases[k] ?? 0));
    });
    out[i] = sample * Math.exp(-t / p.decay);
  }
  const rms = Math.sqrt(out.reduce((sum, x) => sum + x * x, 0) / FRAME);
  // Uniform noise of RMS `p.noise · rms`: a uniform on [-a, a] has RMS a/√3.
  const reach = p.noise * rms * Math.sqrt(3);
  return Float32Array.from(out, (x) => ((x + reach * (2 * next() - 1)) / rms) * 0.2);
};

/** A pluck's bar in cents: 3 harmonic, 5 stiff. */
const barOf = (p: Pluck) => {
  if (p.stiffness === 0) return 3;
  return 5;
};

/** The pluck and what `detect` read, when that is no pitch or past its bar. */
const miss = (p: Pluck, next: Draw) =>
  Option.match(detect(frameOf(p, next), p.rate), {
    onNone: () => Option.some({ hz: p.hz, stiffness: p.stiffness, found: Number.NaN }),
    onSome: (found) =>
      Option.some({ hz: p.hz, stiffness: p.stiffness, found }).pipe(
        Option.filter(() => Math.abs(1200 * Math.log2(found / p.hz)) >= barOf(p)),
      ),
  });

describe('detect over the octave class', () => {
  it.each([
    ['strong even partials over a weak fundamental', evenHeavy, 0],
    ['high plucks with many partials', high, 1],
  ] as const)('reads %s at the fundamental within its bar', (_, family, offset) => {
    const next = draw(SEED + offset);
    const misses = Arr.getSomes(Array.from({ length: CASES }, () => miss(family(next), next)));
    expect({ seed: SEED + offset, misses: misses.slice(0, 5), count: misses.length }).toEqual({
      seed: SEED + offset,
      misses: [],
      count: 0,
    });
  });
});
