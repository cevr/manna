/**
 * The tuner's focus over the whole signal domains, generated: which frames
 * of a guitar's sound, a talker's voice and a room's noise `hear` shows.
 * P1 talk alone and P2 room noise alone show no frame; P3 a clean pluck
 * shows within 250 ms, stays shown and reads true; P4 and P5 a pluck under
 * talk at 20 and 12 dB shows soon and near the plucked pitch; P6 a peg
 * turned while the string rings stays shown; P7 a change of string over
 * every pair shows the new string and nothing between; P8 a held string
 * rides out one or two dark frames on its last reading and lets go on the
 * third, and the frame that lets go leaves the focus as the start state
 * would after that frame. P9 a pluck under room noise (white, pink, brown,
 * fan) at 15 dB shows soon, then on every frame of its ring near the plucked
 * pitch. The fixed-seed cases are in `focus.test.ts`.
 *
 * Every case draws from its own seed, which each failure prints with its
 * parameters. Each property fits bun's 5 s test limit alone.
 *
 * Every signal is generated here, in memory, from a seed (xorshift32): a
 * talker (`talk`: glottal pulses through three vowel formants, gliding
 * syllables, fricatives and bursts, pauses), a plucked string (`pluck`:
 * partials from the plucking point, each decaying, a pick noise, a sharp
 * attack), room noise (`room`: white, pink, brown, fan, mains hum), and a
 * pluck under talk at a named SNR (`mix` with talk at `under(PLUCK_LEVEL,
 * db)`). Frames are 2048 samples, one after another, as the ear gives them.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { type Focus, hear, unfocused } from './focus';

const FRAME = 2048;
/** A pluck's RMS over its first 0.5 s. */
const PLUCK_LEVEL = 0.1;

/** xorshift32 in [0, 1). */
type Draw = () => number;

const draw = (seed: number): Draw => {
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

const between = (next: Draw, low: number, high: number) => low + (high - low) * next();

/** A standard normal draw (Box-Muller). */
const gauss = (next: Draw) =>
  Math.sqrt(-2 * Math.log(Math.max(1e-12, next()))) * Math.cos(2 * Math.PI * next());

/** A uniform draw of mean 0 and variance 1, cheaper than `gauss`: breath noise, the pitch's wander and room noise. */
const spread = (next: Draw) => (2 * next() - 1) * Math.sqrt(3);

/** -1 or 1, even odds. */
const sign = (next: Draw) => {
  if (next() < 0.5) return -1;
  return 1;
};

const cents = (hz: number, ref: number) => 1200 * Math.log2(hz / ref);

const bySemitones = (semitones: number) => 440 * 2 ** (semitones / 12);

/** Standard tuning, low to high, from A4 = 440 Hz. */
const STRINGS = [
  { id: 'E2', hz: bySemitones(-29) },
  { id: 'A2', hz: bySemitones(-24) },
  { id: 'D3', hz: bySemitones(-19) },
  { id: 'G3', hz: bySemitones(-14) },
  { id: 'B3', hz: bySemitones(-10) },
  { id: 'E4', hz: bySemitones(-5) },
] as const;

/** 44.1 kHz for even `index`, 48 kHz for odd. */
const rateOf = (index: number) => {
  if (index % 2 === 0) return 44_100;
  return 48_000;
};

/** RMS-normalise `signal` in place to `level` over the samples `counted` marks with 1. */
const normalise = (signal: Float64Array, level: number, counted: Uint8Array) => {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < signal.length; i++)
    if (counted[i] === 1) {
      sum += (signal[i] ?? 0) ** 2;
      count++;
    }
  const rms = Math.sqrt(sum / Math.max(1, count));
  for (let i = 0; i < signal.length; i++) signal[i] = ((signal[i] ?? 0) / rms) * level;
  return signal;
};

/** A two-pole resonator in place, centred each sample at `centre[i]` Hz. */
const resonate = (signal: Float64Array, rate: number, centre: Float64Array, bandwidth: number) => {
  const r = Math.exp((-Math.PI * bandwidth) / rate);
  let y1 = 0;
  let y2 = 0;
  let last = Number.NaN;
  let pull = 0;
  for (let i = 0; i < signal.length; i++) {
    const hz = centre[i] ?? 500;
    if (hz !== last) {
      last = hz;
      pull = 2 * r * Math.cos((2 * Math.PI * hz) / rate);
    }
    const y = (1 - r) * (signal[i] ?? 0) + pull * y1 - r * r * y2;
    y2 = y1;
    y1 = y;
    signal[i] = y;
  }
  return signal;
};

/** Peterson and Barney's (1952) ten vowels, adult men: F1, F2, F3 in Hz. */
const VOWELS = [
  [270, 2290, 3010],
  [390, 1990, 2550],
  [530, 1840, 2480],
  [660, 1720, 2410],
  [730, 1090, 2440],
  [570, 840, 2410],
  [440, 1020, 2240],
  [300, 870, 2240],
  [520, 1190, 2390],
  [490, 1350, 1690],
] as const;

interface Talker {
  /** The voice's mean fundamental, Hz (85 to 255). */
  readonly f0: number;
  /** The least and most a syllable's pitch glides across its nucleus, semitones (0.5 to 8). */
  readonly minGlide: number;
  readonly maxGlide: number;
  /** Each glottal cycle's period and amplitude vary by these shares (standard deviations). */
  readonly jitter: number;
  readonly shimmer: number;
}

const talker = (f0: number): Talker => ({
  f0,
  minGlide: 0.5,
  maxGlide: 8,
  jitter: 0.006,
  shimmer: 0.04,
});

/** A talk signal being written: the glottal source, the consonants' noise, the voiced samples and the three formants' centres. */
interface Tract {
  readonly rate: number;
  readonly n: number;
  readonly scale: number;
  readonly source: Float64Array;
  readonly noise: Float64Array;
  readonly voiced: Uint8Array;
  readonly f1: Float64Array;
  readonly f2: Float64Array;
  readonly f3: Float64Array;
}

/** The glottis between syllables: where in its cycle, this cycle's period and amplitude shares, the vowel last voiced. */
interface Glottis {
  phase: number;
  period: number;
  amp: number;
  vowel: ReadonlyArray<number>;
}

/** A fricative (30 to 110 ms of noise), a burst (8 to 20 ms and a gap), or nothing, from sample `i`; the sample after it. */
const consonant = (next: Draw, tract: Tract, i: number) => {
  const kind = next();
  if (kind < 0.45) {
    const length = Math.floor(between(next, 0.03, 0.11) * tract.rate);
    const amp = between(next, 0.05, 0.25);
    for (let k = 0; k < length && i + k < tract.n; k++)
      tract.noise[i + k] = amp * gauss(next) * Math.sin((Math.PI * k) / length);
    return i + length;
  }
  if (kind < 0.65) {
    const length = Math.floor(between(next, 0.008, 0.02) * tract.rate);
    const amp = between(next, 0.2, 0.5);
    for (let k = 0; k < length && i + k < tract.n; k++)
      tract.noise[i + k] = amp * gauss(next) * Math.exp(-k / (0.004 * tract.rate));
    return i + length + Math.floor(between(next, 0.01, 0.04) * tract.rate);
  }
  return i;
};

/** A Rosenberg glottal flow derivative at `phase` in [0, 1), open quotient 0.6. */
const pulse = (phase: number) => {
  if (phase < 0.4) return 0.5 * Math.sin((Math.PI * phase) / 0.4);
  if (phase < 0.6) return -Math.sin((Math.PI * (phase - 0.4)) / 0.2);
  return 0;
};

/**
 * A vowel nucleus of 80 to 280 ms from sample `i`, its pitch starting `start`
 * semitones from the voice's mean and gliding up or down across it, with a slow
 * wander, cycle jitter and shimmer; the sample after it.
 */
const nucleus = (
  next: Draw,
  tract: Tract,
  voice: Talker,
  glottis: Glottis,
  i: number,
  start: number,
) => {
  const length = Math.floor(between(next, 0.08, 0.28) * tract.rate);
  const target = VOWELS[Math.floor(next() * VOWELS.length)] ?? glottis.vowel;
  const glide = between(next, voice.minGlide, voice.maxGlide) * sign(next);
  const amp = between(next, 0.5, 1);
  const breath = between(next, 0.01, 0.06);
  const from = glottis.vowel;
  let wander = 0;
  for (let k = 0; k < length && i + k < tract.n; k++) {
    wander += spread(next) * 0.0004;
    const semitones = start + (glide * k) / length + wander;
    glottis.phase += (voice.f0 * 2 ** (semitones / 12) * glottis.period) / tract.rate;
    if (glottis.phase >= 1) {
      glottis.phase -= 1;
      glottis.period = 1 + voice.jitter * gauss(next);
      glottis.amp = 1 + voice.shimmer * gauss(next);
    }
    const envelope = Math.min(1, k / (0.025 * tract.rate), (length - k) / (0.04 * tract.rate));
    tract.source[i + k] =
      (pulse(glottis.phase) * glottis.amp + breath * spread(next)) * envelope * amp;
    tract.voiced[i + k] = 1;
    const blend = Math.min(1, k / (0.04 * tract.rate));
    const scale = tract.scale;
    tract.f1[i + k] = scale * ((from[0] ?? 500) * (1 - blend) + (target[0] ?? 500) * blend);
    tract.f2[i + k] = scale * ((from[1] ?? 1500) * (1 - blend) + (target[1] ?? 1500) * blend);
    tract.f3[i + k] = scale * ((from[2] ?? 2500) * (1 - blend) + (target[2] ?? 2500) * blend);
  }
  glottis.vowel = target;
  return i + length;
};

/**
 * A phrase of 3 to 11 syllables from sample `i`, falling 0.5 to 3 semitones over
 * it, each syllable accented -2 to +4 semitones, then a pause of 150 to 600 ms;
 * the sample after the pause.
 */
const phrase = (next: Draw, tract: Tract, voice: Talker, glottis: Glottis, i: number) => {
  const syllables = 3 + Math.floor(next() * 9);
  const declination = between(next, -3, -0.5);
  let at = i;
  for (let s = 0; s < syllables && at < tract.n; s++) {
    at = consonant(next, tract, at);
    const start = (declination * s) / syllables + between(next, -2, 4);
    at = nucleus(next, tract, voice, glottis, at, start);
  }
  return at + Math.floor(between(next, 0.15, 0.6) * tract.rate);
};

/** The formants' scale: ×1.17 for a voice above 160 Hz (women's and children's vocal tracts are shorter). */
const formantScale = (f0: number) => {
  if (f0 > 160) return 1.17;
  return 1;
};

/**
 * `seconds` of one talker at `rate`, starting 0 to 300 ms in: phrases of
 * syllables, each nucleus a glottal pulse through three formant resonators at a
 * vowel (×1.17 above 160 Hz) with breath noise, and its consonant's noise rung
 * near 3.5 to 6.5 kHz. RMS `level` over the voiced samples.
 */
const talk = (next: Draw, rate: number, seconds: number, voice: Talker, level: number) => {
  const n = Math.floor(rate * seconds);
  const scale = formantScale(voice.f0);
  const tract: Tract = {
    rate,
    n,
    scale,
    source: new Float64Array(n),
    noise: new Float64Array(n),
    voiced: new Uint8Array(n),
    f1: new Float64Array(n).fill(500),
    f2: new Float64Array(n).fill(1500),
    f3: new Float64Array(n).fill(2500),
  };
  const hiss = new Float64Array(n).fill(between(next, 3500, 6500));
  const glottis: Glottis = { phase: 0, period: 1, amp: 1, vowel: VOWELS[0] };
  let i = Math.floor(between(next, 0, 0.3) * rate);
  while (i < n) i = phrase(next, tract, voice, glottis, i);
  const one = resonate(Float64Array.from(tract.source), rate, tract.f1, 80);
  const two = resonate(Float64Array.from(tract.source), rate, tract.f2, 100);
  const three = resonate(Float64Array.from(tract.source), rate, tract.f3, 140);
  const fricative = resonate(tract.noise, rate, hiss, 1500);
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++)
    out[k] = (one[k] ?? 0) + 0.6 * (two[k] ?? 0) + 0.3 * (three[k] ?? 0) + 2 * (fricative[k] ?? 0);
  return normalise(out, level, tract.voiced);
};

interface Pluck {
  /** The string's pitch, Hz. */
  readonly hz: number;
  /** The fundamental's decay time constant, seconds (0.8 to 3); partial k+1 decays 1 + 0.25k times faster. */
  readonly decay: number;
  /** Inharmonicity B (0, or up to 1e-4): partial n sits at n·hz·√((1 + B n²)/(1 + B)). */
  readonly stiffness: number;
  /** The plucking point along the string (0.08 to 0.3). */
  readonly position: number;
  /** Cents sharp at the attack (0 to 8), settling with τ 0.1 s. */
  readonly attack: number;
  /** A peg turn, cents a second (0 for none), from `turnFrom` seconds after the onset. */
  readonly turn: number;
  readonly turnFrom: number;
}

/** B up to 1e-4 when stiff, else 0. */
const stiffnessOf = (next: Draw, stiff: boolean) => {
  if (stiff) return between(next, 0, 1e-4);
  return 0;
};

/** A pluck at `hz`, harmonic or stiff, its other parameters drawn from their domains. */
const pluckOf = (next: Draw, hz: number, stiff: boolean): Pluck => ({
  hz,
  decay: between(next, 0.8, 3),
  stiffness: stiffnessOf(next, stiff),
  position: between(next, 0.08, 0.3),
  attack: between(next, 0, 8),
  turn: 0,
  turnFrom: 0,
});

/** Samples a partial's turn is held for; the attack and a peg turn move it well under a hundredth of a cent in that time. */
const BLOCK = 16;

/**
 * `n` samples at `rate` of a string plucked at sample `at`, silence before it:
 * partials up to 5 kHz (at most 14), each from the plucking point, a 4 ms pick
 * noise. RMS `level` over its first 0.5 s. Each partial is a phasor turned and
 * decayed each sample.
 */
const pluck = (next: Draw, rate: number, n: number, at: number, p: Pluck, level = PLUCK_LEVEL) => {
  const count = Math.max(1, Math.min(14, Math.floor(5000 / p.hz)));
  const partials = Array.from({ length: count }, (_, k) => {
    const phase = between(next, 0, 2 * Math.PI);
    const amp = Math.abs(Math.sin(Math.PI * (k + 1) * p.position)) / (k + 1) ** 1.3;
    return {
      stretch: (k + 1) * Math.sqrt((1 + p.stiffness * (k + 1) ** 2) / (1 + p.stiffness)),
      fall: Math.exp(-(1 + 0.25 * k) / (p.decay * rate)),
      re: amp * Math.cos(phase),
      im: amp * Math.sin(phase),
      turnRe: 1,
      turnIm: 0,
    };
  });
  const out = new Float64Array(n);
  for (let i = at; i < n; i++) {
    const t = (i - at) / rate;
    if ((i - at) % BLOCK === 0) {
      const mid = t + BLOCK / 2 / rate;
      const off = p.attack * Math.exp(-mid / 0.1) + p.turn * Math.max(0, mid - p.turnFrom);
      const step = (2 * Math.PI * p.hz * 2 ** (off / 1200)) / rate;
      for (const partial of partials) {
        partial.turnRe = partial.fall * Math.cos(step * partial.stretch);
        partial.turnIm = partial.fall * Math.sin(step * partial.stretch);
      }
    }
    let sample = 0;
    for (const partial of partials) {
      const re = partial.re * partial.turnRe - partial.im * partial.turnIm;
      partial.im = partial.re * partial.turnIm + partial.im * partial.turnRe;
      partial.re = re;
      sample += partial.im;
    }
    if (t < 0.004) sample += 0.3 * gauss(next) * (1 - t / 0.004);
    out[i] = sample * Math.min(1, t / 0.002);
  }
  const counted = new Uint8Array(n).fill(1, at, Math.min(n, at + Math.floor(0.5 * rate)));
  return normalise(out, level, counted);
};

type RoomKind = 'white' | 'pink' | 'brown' | 'fan' | 'hum50' | 'hum60';

/** Pink noise (Paul Kellet's filter over white). */
const pinkNoise = (next: Draw, n: number) => {
  const out = new Float64Array(n);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < n; i++) {
    const white = spread(next);
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    out[i] = b0 + b1 + b2 + white * 0.1848;
  }
  return out;
};

/** Mains hum at `mains` Hz with its 2nd and 3rd harmonics, over a little white noise. */
const hum = (next: Draw, rate: number, n: number, mains: number) =>
  Float64Array.from({ length: n }, (_, i) => {
    const t = i / rate;
    return (
      Math.sin(2 * Math.PI * mains * t) +
      0.5 * Math.sin(2 * Math.PI * 2 * mains * t) +
      0.3 * Math.sin(2 * Math.PI * 3 * mains * t) +
      0.05 * spread(next)
    );
  });

const ROOMS: Record<RoomKind, (next: Draw, rate: number, n: number) => Float64Array> = {
  white: (next, _, n) => Float64Array.from({ length: n }, () => spread(next)),
  pink: (next, _, n) => pinkNoise(next, n),
  brown: (next, _, n) => {
    let level = 0;
    return Float64Array.from({ length: n }, () => {
      level = 0.995 * level + 0.1 * spread(next);
      return level;
    });
  },
  fan: (next, rate, n) =>
    pinkNoise(next, n).map(
      (sample, i) =>
        sample +
        2 * Math.sin((2 * Math.PI * 120 * i) / rate) +
        Math.sin((2 * Math.PI * 240 * i) / rate),
    ),
  hum50: (next, rate, n) => hum(next, rate, n, 50),
  hum60: (next, rate, n) => hum(next, rate, n, 60),
};

/** `n` samples at `rate` of room noise at RMS `level`: fan is pink noise with tones at 120 and 240 Hz. */
const room = (next: Draw, rate: number, n: number, kind: RoomKind, level: number) =>
  normalise(ROOMS[kind](next, rate, n), level, new Uint8Array(n).fill(1));

/** The level `db` under `level`: talk under a pluck at an SNR of `db`. */
const under = (level: number, db: number) => level / 10 ** (db / 20);

/** `signal` with `other` added sample by sample, `signal`'s length. */
const mix = (signal: Float64Array, other: Float64Array) =>
  signal.map((sample, i) => sample + (other[i] ?? 0));

/** The frames the ear gives: 2048 samples, one after another. */
const framesOf = (signal: Float64Array) =>
  Array.from({ length: Math.floor(signal.length / FRAME) }, (_, k) =>
    Float32Array.from(signal.subarray(k * FRAME, (k + 1) * FRAME)),
  );

/** Each frame's shown pitch (NaN when none) through `hear` from `from`, and the state each frame met. */
const listen = (frames: ReadonlyArray<Float32Array>, rate: number, from: Focus = unfocused) => {
  const shown: Array<number> = [];
  const states: Array<Focus> = [];
  let focus = from;
  for (const frame of frames) {
    states.push(focus);
    const heard = hear(focus, frame, rate);
    focus = heard.focus;
    shown.push(Option.getOrElse(heard.hz, () => Number.NaN));
  }
  return { shown, states };
};

/** Milliseconds from the sample `at` to the end of frame `k`. */
const endMs = (k: number, at: number, rate: number) => (((k + 1) * FRAME - at) / rate) * 1000;

/** Milliseconds from `at` to the end of the first frame after it that `shows`; Infinity when none does. */
const firstMs = (
  shown: ReadonlyArray<number>,
  at: number,
  rate: number,
  shows: (hz: number) => boolean = (hz) => !Number.isNaN(hz),
) => {
  const k = shown.findIndex((hz, index) => endMs(index, at, rate) > 0 && shows(hz));
  if (k === -1) return Number.POSITIVE_INFINITY;
  return endMs(k, at, rate);
};

/** The frames shown, each as its index and pitch. */
const shownFrames = (shown: ReadonlyArray<number>) =>
  shown.flatMap((hz, frame) => {
    if (Number.isNaN(hz)) return [];
    return [{ frame, hz }];
  });

/** `[item]` when `holds`, else none: a failure to report. */
const when = <A>(holds: boolean, item: A): ReadonlyArray<A> => {
  if (holds) return [item];
  return [];
};

/** `hz` within 25 cents of the pluck `p`. */
const near = (hz: number, p: Pluck) => !Number.isNaN(hz) && Math.abs(cents(hz, p.hz)) <= 25;

/** The properties' base seed. */
const SEED = 20_261_102;

/**
 * Case `i` of property `n` draws from `SEED + 10 000 n + i` mixed through
 * murmur3's finaliser: xorshift32's first draws from nearby seeds lie close
 * together (118 of 120 talkers' voices fell within 10 Hz unmixed).
 */
const seedOf = (property: number, i: number) => {
  let x = (SEED + 10_000 * property + i) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85eb_ca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2_ae35) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
};

/** Talkers in P1, and plucks in P3, P4, P5 and P8. */
const TALKERS = 120;
const PLUCKS = 300;

/** The pitches a pluck is drawn about: a low E down a whole tone, then the six strings. */
const CENTRES = [{ id: 'D2', hz: bySemitones(-31) }, ...STRINGS] as const;

/** A draw between `low` and `high`, even in log: a level over its range in dB. */
const logBetween = (next: Draw, low: number, high: number) => low * (high / low) ** next();

/**
 * A pluck drawn over its domain about centre `index % 7`: 100 cents under to
 * 100 over it, at 44.1 or 48 kHz, harmonic or stiff.
 */
const drawPluck = (next: Draw, index: number) => {
  const centre = CENTRES[index % CENTRES.length] ?? CENTRES[0];
  const by = between(next, -100, 100);
  const rate = rateOf(Math.floor(next() * 2));
  const p = pluckOf(next, centre.hz * 2 ** (by / 1200), next() < 0.5);
  return { centre: centre.id, by, rate, p };
};

/** A pluck's onset: anywhere within the second frame. */
const onsetOf = (next: Draw) => FRAME + Math.floor(next() * FRAME);

/** A settled reading's bar, as `pitch.property.slow.test.ts` holds `detect`: 3 cents harmonic, 5 stiff. */
const barOf = (p: Pluck) => {
  if (p.stiffness === 0) return 3;
  return 5;
};

/** The bar for a reading `ms` after the onset: its settled bar from 300 ms, 10 cents before. */
const barAt = (p: Pluck, ms: number) => {
  if (ms > 300) return barOf(p);
  return 10;
};

const sum = (values: ReadonlyArray<number>) => values.reduce((total, value) => total + value, 0);

/** The frames that show nothing whose end lies after `from` and at or before `to` ms from the sample `at`. */
const darkFrames = (
  shown: ReadonlyArray<number>,
  at: number,
  rate: number,
  from: number,
  to: number,
) =>
  shown.flatMap((hz, frame) => {
    const ms = endMs(frame, at, rate);
    if (ms <= from || ms > to || !Number.isNaN(hz)) return [];
    return [{ frame, ms }];
  });

/** Each shown frame, its end in ms from `at`, and its distance from the pluck `p` in cents. */
const offsOf = (shown: ReadonlyArray<number>, p: Pluck, at: number, rate: number) =>
  shownFrames(shown).map(({ frame, hz }) => ({
    frame,
    ms: endMs(frame, at, rate),
    centsOff: cents(hz, p.hz),
  }));

/** The same frames shown with the same pitches. */
const sameShown = (
  a: ReadonlyArray<{ readonly frame: number; readonly hz: number }>,
  b: ReadonlyArray<{ readonly frame: number; readonly hz: number }>,
) =>
  a.length === b.length && a.every((item, i) => item.frame === b[i]?.frame && item.hz === b[i]?.hz);

/** Frames run after a frame that lets go, from the state it left and from the start state. */
const AFTER = 12;

/**
 * Frame `k` let go (R3): what `hear` shows on the frames after it from the
 * state frame `k` left, and from the start state heard on frame `k` alone.
 */
const letGo = (
  frames: ReadonlyArray<Float32Array>,
  rate: number,
  states: ReadonlyArray<Focus>,
  k: number,
) => {
  const rest = frames.slice(k + 1, k + 1 + AFTER);
  const fresh = hear(unfocused, frames[k] ?? new Float32Array(FRAME), rate).focus;
  return {
    frame: k,
    fromLetGo: shownFrames(listen(rest, rate, states[k + 1] ?? unfocused).shown),
    fromStart: shownFrames(listen(rest, rate, fresh).shown),
  };
};

/**
 * Every frame that lets go of a shown pitch (shown on the frame before, none
 * on it) whose two runs after it differ: R3 makes the frame that lets go
 * leave the state the start state leaves on that frame.
 */
const unlikeStart = (
  frames: ReadonlyArray<Float32Array>,
  rate: number,
  shown: ReadonlyArray<number>,
  states: ReadonlyArray<Focus>,
) =>
  shown
    .flatMap((hz, k) => {
      const before = shown[k - 1] ?? Number.NaN;
      if (k + 1 >= frames.length || !Number.isNaN(hz) || Number.isNaN(before)) return [];
      return [letGo(frames, rate, states, k)];
    })
    .filter((one) => !sameShown(one.fromLetGo, one.fromStart));

/** Two frames in a row both shown more than 100 cents apart: a pitch replaced with no dark frame between. */
const jumps = (shown: ReadonlyArray<number>) =>
  shown.flatMap((hz, k) => {
    const before = shown[k - 1] ?? Number.NaN;
    if (Number.isNaN(hz) || Number.isNaN(before) || Math.abs(cents(hz, before)) <= 100) return [];
    return [{ frame: k, before, hz }];
  });

/** Room kinds and their levels in RMS: the low, middle and top of each range. */
const ROOM_KINDS: ReadonlyArray<RoomKind> = ['white', 'pink', 'brown', 'fan', 'hum50', 'hum60'];

const ROOM_LEVELS: Record<RoomKind, ReadonlyArray<number>> = {
  white: [0.002, 0.051, 0.1],
  pink: [0.002, 0.051, 0.1],
  brown: [0.002, 0.051, 0.1],
  fan: [0.002, 0.051, 0.1],
  hum50: [0.002, 0.011, 0.02],
  hum60: [0.002, 0.011, 0.02],
};

/** P3: a clean pluck's failures. */
const cleanPluck = (i: number) => {
  const seed = seedOf(3, i);
  const next = draw(seed);
  const { centre, by, rate, p } = drawPluck(next, i);
  const at = onsetOf(next);
  const { shown } = listen(framesOf(pluck(next, rate, at + Math.ceil(1.05 * rate), at, p)), rate);
  const first = firstMs(shown, at, rate);
  const what = { seed, centre, by, rate, at, pluck: p };
  return [
    ...when(first > 250, { ...what, firstMs: first }),
    ...darkFrames(shown, at, rate, first, 1000).map((dark) => ({ ...what, dark })),
    ...offsOf(shown, p, at, rate)
      .filter(({ ms, centsOff }) => Math.abs(centsOff) > barAt(p, ms))
      .map((off) => ({ ...what, off })),
  ];
};

/** P4 and P5: a pluck under talk `db` under it, `seconds` from its onset, which is 0.5 s into the talk. */
const underTalk = (property: number, db: number, i: number, seconds: number) => {
  const seed = seedOf(property, i);
  const next = draw(seed);
  const { centre, by, rate, p } = drawPluck(next, i);
  const at = Math.floor(0.5 * rate) + Math.floor(next() * FRAME);
  const n = at + Math.ceil(seconds * rate);
  const f0 = between(next, 85, 255);
  const signal = mix(
    pluck(next, rate, n, at, p),
    talk(next, rate, n / rate, talker(f0), under(PLUCK_LEVEL, db)),
  );
  const { shown } = listen(framesOf(signal), rate);
  const what = { seed, centre, by, rate, at, talker: f0, pluck: p };
  return { what, first: firstMs(shown, at, rate), offs: offsOf(shown, p, at, rate) };
};

/** An under-talk case: what was drawn, its first shown frame in ms, and its shown frames. */
interface UnderTalk<W> {
  readonly what: W;
  readonly first: number;
  readonly offs: ReadonlyArray<{
    readonly frame: number;
    readonly ms: number;
    readonly centsOff: number;
  }>;
}

/** Under-talk cases' shown frames, each with its case, past `limit` cents from the pluck. */
const pastCents = <W extends object>(cases: ReadonlyArray<UnderTalk<W>>, limit: number) =>
  cases.flatMap(({ what, offs }) =>
    offs.filter(({ centsOff }) => Math.abs(centsOff) > limit).map((off) => ({ ...what, off })),
  );

/** Cases first shown later than `ms` (Infinity when never), each with its case. */
const laterThan = <W extends object>(cases: ReadonlyArray<UnderTalk<W>>, ms: number) =>
  cases.filter(({ first }) => first > ms).map(({ what, first }) => ({ ...what, firstMs: first }));

/**
 * A peg turn of up to `most` cents a second, either way, from a pluck at
 * `hz`; one that would carry it under 65 Hz by 1.5 s (out of `detect`'s
 * reach, which starts at 60 Hz) turns up instead.
 */
const turnOf = (next: Draw, hz: number, most: number) => {
  const turn = between(next, 0, most) * sign(next);
  if (hz * 2 ** ((turn * 1.5) / 1200) < 65) return -turn;
  return turn;
};

/** P6: a pluck whose peg turns up to `most` cents a second from `turnFrom` s after the onset, to 1.5 s. */
const turnedPeg = (i: number, most: number, turnFrom: number) => {
  const seed = seedOf(6, i + 1000 * turnFrom);
  const next = draw(seed);
  const { centre, by, rate, p } = drawPluck(next, i);
  const turned = { ...p, turn: turnOf(next, p.hz, most), turnFrom };
  const at = onsetOf(next);
  const { shown } = listen(
    framesOf(pluck(next, rate, at + Math.ceil(1.55 * rate), at, turned)),
    rate,
  );
  const first = firstMs(shown, at, rate);
  return {
    what: { seed, centre, by, rate, at, pluck: turned },
    first,
    dark: darkFrames(shown, at, rate, first, 1500),
  };
};

/** Every ordered pair of two strings. */
const PAIRS = STRINGS.flatMap((_, from) =>
  STRINGS.flatMap((__, to) => when(from !== to, { from, to })),
);

/** P7 cases: each pair four times, two at each rate. */
const CHANGES = 4 * PAIRS.length;

/** String `index`, drawn 100 cents under to 100 over its pitch, harmonic or stiff. */
const stringPluck = (next: Draw, index: number) => {
  const string = STRINGS[index] ?? STRINGS[0];
  const by = between(next, -100, 100);
  return { id: string.id, p: pluckOf(next, string.hz * 2 ** (by / 1200), next() < 0.5) };
};

/**
 * `signal` from sample `from` damped by `db`, reached over 20 ms: a hand
 * laid on a string, which still rings under it.
 */
const damp = (signal: Float64Array, rate: number, from: number, db: number) => {
  const floor = 10 ** (-db / 20);
  const ramp = 0.02 * rate;
  return signal.map((sample, i) => {
    if (i < from) return sample;
    return sample * (1 - (1 - floor) * Math.min(1, (i - from) / ramp));
  });
};

/**
 * P7: one string, then another plucked 0.8 to 1.2 s later, to 0.6 s after;
 * at the second's onset the first is damped 20 to 30 dB and rings on under
 * it (left undamped, `detect` reads the mix of two strings as the first, or
 * as neither, on most frames: no focus could show the second).
 */
const stringChange = (i: number) => {
  const seed = seedOf(7, i);
  const next = draw(seed);
  const pair = PAIRS[i % PAIRS.length] ?? { from: 0, to: 1 };
  const rate = rateOf(Math.floor(i / PAIRS.length));
  const one = stringPluck(next, pair.from);
  const two = stringPluck(next, pair.to);
  const at = onsetOf(next);
  const later = at + Math.floor(between(next, 0.8, 1.2) * rate);
  const n = later + Math.ceil(0.6 * rate);
  const db = between(next, 20, 30);
  const frames = framesOf(
    mix(damp(pluck(next, rate, n, at, one.p), rate, later, db), pluck(next, rate, n, later, two.p)),
  );
  const { shown, states } = listen(frames, rate);
  const what = { seed, from: one.id, to: two.id, rate, at, later, db, one: one.p, two: two.p };
  const firstOne = firstMs(shown, at, rate, (hz) => near(hz, one.p));
  const firstTwo = firstMs(shown, later, rate, (hz) => near(hz, two.p));
  return [
    ...when(firstOne > 250, { ...what, firstOneMs: firstOne }),
    ...when(firstTwo > 400, { ...what, firstTwoMs: firstTwo }),
    ...shownFrames(shown)
      .filter(({ hz }) => !near(hz, one.p) && !near(hz, two.p))
      .map((stray) => ({ ...what, stray })),
    ...jumps(shown).map((jump) => ({ ...what, jump })),
    ...unlikeStart(frames, rate, shown, states).map((letGoFrame) => ({ ...what, letGoFrame })),
  ];
};

/** The dark frames P8 makes: silence, white noise (no pitch), or the string 30 to 100 cents off. */
type Drop = 'silent' | 'noise' | 'far';

const DROPS: ReadonlyArray<Drop> = ['silent', 'noise', 'far'];

/** P8's dark frame `j` of the run: silence, white noise at `level`, or frame `k` of `far`. */
const dropFrame = (
  kind: Drop,
  k: number,
  noise: Float32Array,
  far: ReadonlyArray<Float32Array>,
) => {
  if (kind === 'silent') return new Float32Array(FRAME);
  if (kind === 'noise') return noise;
  return far[k] ?? new Float32Array(FRAME);
};

/** The same reading: equal pitches, or none on both. */
const sameReading = (a: number, b: number) => a === b || (Number.isNaN(a) && Number.isNaN(b));

/** What P8 expects of the run's dark frame `j` (from 0): the reading before it for the first two, none after. */
const heldOn = (j: number, before: number) => {
  if (j < 2) return before;
  return Number.NaN;
};

/** P8's checks on the dark frames and the four frames of the string after them. */
const dropChecks = (shown: ReadonlyArray<number>, start: number, count: number, p: Pluck) => {
  const before = shown[start - 1] ?? Number.NaN;
  const dark = Array.from({ length: count }, (_, j) => ({
    dark: j + 1,
    expected: heldOn(j, before),
    hz: shown[start + j] ?? Number.NaN,
  })).filter(({ expected, hz }) => !sameReading(expected, hz));
  const after = Array.from({ length: 4 }, (_, m) => ({
    after: m + 1,
    shows: count <= 2 || m === 3,
    hz: shown[start + count + m] ?? Number.NaN,
  })).filter(
    ({ shows, hz }) => shows === Number.isNaN(hz) || (shows && Math.abs(cents(hz, p.hz)) > 10),
  );
  return [...when(Number.isNaN(before), { notShownBefore: start - 1 }), ...dark, ...after];
};

/**
 * P8: a clean pluck, locked, with `count` (1 to 5) dark frames of one kind
 * made from a frame starting 0.35 to 0.7 s after the onset.
 */
const dropout = (i: number) => {
  const seed = seedOf(8, i);
  const next = draw(seed);
  const { centre, by, rate, p } = drawPluck(next, i);
  const kind = DROPS[i % DROPS.length] ?? 'silent';
  const count = 1 + (Math.floor(i / DROPS.length) % 5);
  const at = onsetOf(next);
  const start = Math.ceil((at + between(next, 0.35, 0.7) * rate) / FRAME);
  const off = between(next, 30, 100) * sign(next);
  const noise = Float32Array.from(room(next, rate, FRAME, 'white', between(next, 0.01, 0.1)));
  const n = at + Math.ceil(1.3 * rate);
  const ring = framesOf(pluck(next, rate, n, at, p));
  const far = framesOf(
    pluck(next, rate, (start + count) * FRAME, at, { ...p, hz: p.hz * 2 ** (off / 1200) }),
  );
  const frames = ring.map((frame, k) => {
    if (k < start || k >= start + count) return frame;
    return dropFrame(kind, k, noise, far);
  });
  const { shown, states } = listen(frames, rate);
  const what = { seed, centre, by, rate, at, kind, count, start, off, pluck: p };
  const released = when(count >= 3, letGo(frames, rate, states, start + 2)).filter(
    (one) => !sameShown(one.fromLetGo, one.fromStart),
  );
  return [
    ...dropChecks(shown, start, count, p).map((check) => ({ ...what, check })),
    ...released.map((letGoFrame) => ({ ...what, letGoFrame })),
  ];
};

/** P9's room kinds: the broad noises; P2 holds the mains hums. */
const NOISES: ReadonlyArray<RoomKind> = ['white', 'pink', 'brown', 'fan'];

/** Plucks in P9 for each room kind: 10 about each centre. */
const NOISY_PLUCKS = 70;

/**
 * P9's ring: to 750 ms after the onset. Past it the room still sounds while
 * the pluck fades: on P9's seeds the first dark frame falls at 793 ms (a B3
 * beside the fan's 240 Hz tone) and the first frame past 25 cents at 938 ms
 * (a D2 at 71 Hz under pink noise).
 */
const RING_MS = 750;

/**
 * P9: a pluck under room noise of `kind` 15 dB under it, 1.05 s from its
 * onset: when it first shows, and each frame of its ring that is dark after
 * that or more than 25 cents off the pluck.
 */
const underRoom = (kind: RoomKind, k: number, i: number) => {
  const seed = seedOf(9, 1000 * k + i);
  const next = draw(seed);
  const { centre, by, rate, p } = drawPluck(next, i);
  const at = onsetOf(next);
  const n = at + Math.ceil(1.05 * rate);
  const signal = mix(
    pluck(next, rate, n, at, p),
    room(next, rate, n, kind, under(PLUCK_LEVEL, 15)),
  );
  const { shown } = listen(framesOf(signal), rate);
  const first = firstMs(shown, at, rate);
  const what = { seed, kind, centre, by, rate, at, pluck: p };
  return {
    what,
    first,
    ring: [
      ...darkFrames(shown, at, rate, first, RING_MS).map((dark) => ({ ...what, dark })),
      ...offsOf(shown, p, at, rate)
        .filter(({ ms, centsOff }) => ms <= RING_MS && Math.abs(centsOff) > 25)
        .map((off) => ({ ...what, off })),
    ],
  };
};

describe('hear over the generated domains', () => {
  it('P1: talk alone, 120 talkers of 8 s each, shows no frame', () => {
    const cases = Array.from({ length: TALKERS }, (_, i) => {
      const seed = seedOf(1, i);
      const next = draw(seed);
      const rate = rateOf(i);
      const f0 = between(next, 85, 255);
      const level = logBetween(next, 0.005, 0.3);
      const { shown } = listen(framesOf(talk(next, rate, 8, talker(f0), level)), rate);
      return { seed, f0, rate, level, frames: shown.length, shown: shownFrames(shown) };
    });
    const showing = cases.filter(({ shown }) => shown.length > 0);
    expect({ talkers: showing.length, first: showing.slice(0, 3) }).toEqual({
      talkers: 0,
      first: [],
    });
  });

  it('P2: room noise alone, every kind at the low, middle and top of its levels for 3 s, shows no frame', () => {
    const cases = ROOM_KINDS.flatMap((kind, k) =>
      (ROOM_LEVELS[kind] ?? []).flatMap((level, l) =>
        [44_100, 48_000].map((rate, r) => {
          const seed = seedOf(2, 6 * k + 2 * l + r);
          const { shown } = listen(framesOf(room(draw(seed), rate, 3 * rate, kind, level)), rate);
          return { seed, kind, level, rate, frames: shown.length, shown: shownFrames(shown) };
        }),
      ),
    );
    const showing = cases.filter(({ shown }) => shown.length > 0);
    expect({ rooms: showing.length, first: showing.slice(0, 3) }).toEqual({
      rooms: 0,
      first: [],
    });
  });

  it('P3: a clean pluck shows within 250 ms, on every frame to 1 s, within 10 cents and from 300 ms within its bar', () => {
    const failures = Array.from({ length: PLUCKS }, (_, i) => cleanPluck(i)).flat();
    expect({ count: failures.length, first: failures.slice(0, 5) }).toEqual({
      count: 0,
      first: [],
    });
  });

  it('P4: a pluck under talk at 20 dB shows within 400 ms (99%) and 600 ms (all), within 25 cents (98% of frames) and 50 (all)', () => {
    const cases = Array.from({ length: PLUCKS }, (_, i) => underTalk(4, 20, i, 1.2));
    const frames = sum(cases.map(({ offs }) => offs.length));
    const late = laterThan(cases, 400);
    const past25 = pastCents(cases, 25);
    const verdict = {
      late: late.map(({ seed, firstMs: ms }) => ({ seed, ms })),
      lateWithin1Percent: late.length <= 0.01 * cases.length,
      past600: laterThan(cases, 600),
      past25: past25.length,
      frames,
      past25Within2Percent: past25.length <= 0.02 * frames,
      past50: pastCents(cases, 50).slice(0, 5),
    };
    expect(verdict).toEqual({
      ...verdict,
      lateWithin1Percent: true,
      past600: [],
      past25Within2Percent: true,
      past50: [],
    });
  });

  it('P5: a pluck under talk at 12 dB shows within 500 ms (90%) and 1.2 s (98%), within 25 cents (97% of frames), and no frame past 50 cents (97% of plucks)', () => {
    const cases = Array.from({ length: PLUCKS }, (_, i) => underTalk(5, 12, i, 1.3));
    const frames = sum(cases.map(({ offs }) => offs.length));
    const late = laterThan(cases, 500);
    const past1200 = laterThan(cases, 1200);
    const past25 = pastCents(cases, 25);
    const wrong = cases.filter(({ offs }) => offs.some(({ centsOff }) => Math.abs(centsOff) > 50));
    const verdict = {
      late: late.length,
      lateWithin10Percent: late.length <= 0.1 * cases.length,
      past1200: past1200.map(({ seed, firstMs: ms }) => ({ seed, ms })),
      past1200Within2Percent: past1200.length <= 0.02 * cases.length,
      frames,
      past25: past25.length,
      past25Within3Percent: past25.length <= 0.03 * frames,
      wrong: wrong.map(({ what }) => what.seed),
      wrongWithin3Percent: wrong.length <= 0.03 * cases.length,
    };
    expect(verdict).toEqual({
      ...verdict,
      lateWithin10Percent: true,
      past1200Within2Percent: true,
      past25Within3Percent: true,
      wrongWithin3Percent: true,
    });
  });

  it.each([
    ['up to 40 cents/s from the onset', 40, 0, 300],
    ['up to 300 cents/s from 400 ms after the onset', 300, 0.4, 250],
  ] as const)(
    'P6: a peg turned %s shows in time and on every frame to 1.5 s',
    (_label, most, turnFrom, within) => {
      const cases = Array.from({ length: PLUCKS / 2 }, (_, i) => turnedPeg(i, most, turnFrom));
      const failures = cases.flatMap(({ what, first, dark }) => [
        ...when(first > within, { ...what, firstMs: first }),
        ...dark.map((frame) => ({ ...what, dark: frame })),
      ]);
      expect({ count: failures.length, first: failures.slice(0, 5) }).toEqual({
        count: 0,
        first: [],
      });
    },
  );

  it('P7: over every pair of strings, the second shows within 400 ms, nothing strays or jumps, and the frame that lets go leaves the start state', () => {
    const failures = Array.from({ length: CHANGES }, (_, i) => stringChange(i)).flat();
    expect({ count: failures.length, first: failures.slice(0, 5) }).toEqual({
      count: 0,
      first: [],
    });
  });

  it('P8: a held string shows its last reading across 1 or 2 dark frames, lets go on the 3rd, and locks again on the 4th frame after', () => {
    const failures = Array.from({ length: PLUCKS }, (_, i) => dropout(i)).flat();
    expect({ count: failures.length, first: failures.slice(0, 5) }).toEqual({
      count: 0,
      first: [],
    });
  });

  it.each(NOISES.map((kind, k) => [kind, k] as const))(
    'P9: a pluck under %s room noise at 15 dB shows within 260 ms (95%%) and 400 ms (all), then on every frame of its ring, within 25 cents',
    (kind, k) => {
      const cases = Array.from({ length: NOISY_PLUCKS }, (_, i) => underRoom(kind, k, i));
      const late = cases.filter(({ first }) => first > 260);
      const verdict = {
        late: late.map(({ what, first }) => ({ seed: what.seed, ms: first })),
        lateWithin5Percent: late.length <= 0.05 * cases.length,
        past400: cases
          .filter(({ first }) => first > 400)
          .map(({ what, first }) => ({ ...what, first })),
        ring: cases.flatMap(({ ring }) => ring).slice(0, 5),
      };
      expect(verdict).toEqual({ ...verdict, lateWithin5Percent: true, past400: [], ring: [] });
    },
  );
});
