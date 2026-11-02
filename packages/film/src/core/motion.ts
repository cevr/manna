// Acting with no simulation: every number here is a closed-form function of
// t and a seed, as `canvas/particles.ts`'s particles are, so a figure driven
// by them draws the same at any t, in any order across render workers, and
// the lab scrubs to any t. A puppet's bones take these numbers in degrees:
// `curve` and `act` key a performance (each move with its anticipation and
// overshoot), `lag` makes a child bone follow its parent through, `idle`
// keeps a figure alive between moves (breath, sway, a head tilt, the
// weight's drift), and `blink` times a figure's blinks.

import { Array as Arr, Option } from 'effect';
import { hash2 } from './random.ts';

/** A number over time: seconds in, degrees (or a share) out. */
export type Track = (t: number) => number;

/** A key of a `curve`: its time in seconds and its value. */
type Point = readonly [time: number, value: number];

/** The stretch between two keys: its ends, its length and its mean slope. */
interface Secant {
  readonly t0: number;
  readonly t1: number;
  readonly v0: number;
  readonly v1: number;
  readonly h: number;
  readonly d: number;
}

/** A stretch with the curve's slope (value a second) at each end. */
interface Span extends Secant {
  readonly m0: number;
  readonly m1: number;
}

/**
 * The slope at a key between two stretches: level where the curve turns,
 * else the weighted harmonic mean of the two (PCHIP's), which keeps the
 * stretches on either side from swinging past their keys.
 */
const slopeAt = (before: Secant, after: Secant): number => {
  if (before.d * after.d <= 0) return 0;
  const w0 = 2 * after.h + before.h;
  const w1 = after.h + 2 * before.h;
  return (w0 + w1) / (w0 / before.d + w1 / after.d);
};

/** The span's value at `t` inside it, written from its first key's value so a hold stays exactly on it. */
const along = (s: Span, t: number): number => {
  const u = (t - s.t0) / s.h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    s.v0 + (s.v1 - s.v0) * (3 * u2 - 2 * u3) + s.h * (s.m0 * (u3 - 2 * u2 + u) + s.m1 * (u3 - u2))
  );
};

/**
 * A smooth curve through `keys` (in time order), held flat before the first
 * and after the last: a monotone cubic Hermite (Fritsch and Carlson's
 * tangents, as PCHIP weighs them), so it runs through a key it passes with no
 * break in speed, comes level at a key it turns on, and never swings past a
 * key between two keys. A hold is two equal keys; an anticipation or an
 * overshoot is a key of its own (`act` lays them).
 */
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

/** One move of an `act`. */
export interface Move {
  /** When it starts, s. A move cued before the last one settles starts when that one settles. */
  readonly at: number;
  /** How long it takes to settle, s. */
  readonly dur: number;
  /** The value it settles on. */
  readonly to: number;
  /** How far it first dips the other way, as a share of the move (0.15 is 15 %); none by default. */
  readonly anticipate?: number;
  /** How far it passes its target before it settles back, as a share of the move; none by default. */
  readonly overshoot?: number;
}

/** Where in a move's time its anticipation bottoms out and its overshoot peaks. */
const DIP_AT = 0.2;
const PAST_AT = 0.6;

/** The shortest move, s: a zero-length one would divide by zero. */
const MIN_DUR = 0.001;

/**
 * A performance on one bone: it holds `from`, then makes each move in turn
 * from where the last one settled, through `curve`. An anticipation dips the
 * other way a fifth of the move's time in, an overshoot passes the target
 * three fifths in, and the move settles at its end.
 */
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

/**
 * `track` `delay` s later: a child bone keyed to its parent's move (a wrist
 * to its arm, a head to its body) starts after the parent and is still
 * moving when the parent has stopped, its follow-through.
 */
export const lag =
  (track: Track, delay: number): Track =>
  (t) =>
    track(t - delay);

/** A figure's idle at one moment. */
export interface Idle {
  /** The breath, -1 (out) to 1 (in): one breath every 3.2-3.9 s. */
  readonly breath: number;
  /** The body's sway in degrees, at most 1 either way: two waves, of 5.6-7 s and 8.2-10.5 s, so no two swings match. */
  readonly sway: number;
  /** The head's tilt in degrees, 2 either way: one swing every 4.2-4.9 s. */
  readonly tilt: number;
  /** The weight's drift, -1 to 1: one shift across and back every 13-18 s. */
  readonly drift: number;
}

/**
 * Seed n draws its periods (and its blinks' place) at n × SPREAD mod 1, the
 * golden ratio's step, which keeps any run of seeds 1, 2, 3 … the furthest
 * apart on a line, so their waves drift out of step fast; and its phases at
 * n × PHASE_STEP mod 1, the plastic number's step, so two seeds whose
 * periods lie close start apart.
 */
const SPREAD = 0.6180339887498949;
const PHASE_STEP = 0.5698402909980532;

const frac = (x: number): number => x - Math.floor(x);

/** A sine wave's period range, s, and the offsets that keep its draw apart from the other waves'. */
interface Wave {
  readonly lo: number;
  readonly hi: number;
  readonly u: number;
  readonly v: number;
}

// Each wave's periods lie apart from every other's, so a figure's breath,
// sway, tilt and drift never move in step.
const BREATH: Wave = { lo: 3.2, hi: 3.9, u: 0.5, v: 0.5 };
const TILT: Wave = { lo: 4.2, hi: 4.9, u: 0.13, v: 0.71 };
const SWAY_SHORT: Wave = { lo: 5.6, hi: 7.0, u: 0.37, v: 0.29 };
const SWAY_LONG: Wave = { lo: 8.2, hi: 10.5, u: 0.83, v: 0.07 };
const DRIFT: Wave = { lo: 13, hi: 18, u: 0.61, v: 0.43 };

/** The sway's two waves, degrees: they reach 1 together. */
const SWAY_SHORT_DEG = 0.6;
const SWAY_LONG_DEG = 0.4;
const TILT_DEG = 2;

/** `wave` for seed `seed`: -1 to 1 over t. */
const waveOf = (wave: Wave, seed: number): Track => {
  const period = wave.lo + (wave.hi - wave.lo) * frac(wave.u + seed * SPREAD);
  const phase = 2 * Math.PI * frac(wave.v + seed * PHASE_STEP);
  return (t) => Math.sin((2 * Math.PI * t) / period + phase);
};

/**
 * A figure's idle for `seed` (an integer; give each figure of a cast its
 * own, 1, 2, 3 …): its breath, sway, head tilt and weight drift over t,
 * each a wave with its own period and phase, drawn from the seed. The
 * figure's bones take these as its body allows: the breath on the chest and
 * shoulders, the sway and the drift on the lean, the tilt on the head.
 */
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

/** A blink's lids: shut in 110 ms, open again in 190 ms. */
const SHUT = 0.11;
const OPEN = 0.19;

/** Blinks fall every 3.5 s, each moved up to 0.25 s either way, so the gaps run 3 to 4 s. */
const EVERY = 3.5;
const JITTER = 0.25;

/** Salts for a blink's place, kept apart from each other. */
const BLINK_SALT = 6151;

const smooth = (x: number): number => x * x * (3 - 2 * x);

/**
 * How far a figure's eyes are shut at `t`, 0 open to 1 shut, for `seed` (an
 * integer, as `idle` takes): a blink every 3 to 4 s at times drawn from the
 * seed, the lids shutting in 110 ms and opening in 190 ms. A head drawn
 * with its eyes shut shows while it reads past one half.
 */
export const blink = (seed: number): Track => {
  const offset = EVERY * frac(0.5 + seed * SPREAD);
  const startOf = (k: number) =>
    offset + k * EVERY + JITTER * (2 * hash2(Math.imul(seed, BLINK_SALT) + 1, k) - 1);
  return (t) => {
    const near = Math.floor((t - offset) / EVERY);
    for (let k = near - 1; k <= near + 1; k++) {
      const a = t - startOf(k);
      if (a > 0 && a < SHUT) return smooth(a / SHUT);
      if (a >= SHUT && a < SHUT + OPEN) return smooth(1 - (a - SHUT) / OPEN);
    }
    return 0;
  };
};
