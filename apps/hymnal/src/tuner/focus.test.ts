import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { type Focus, hear, unfocused } from './focus';
import { detect } from './pitch';

const FRAME = 2048;
const PLUCK_LEVEL = 0.1;

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

const gauss = (next: Draw) =>
  Math.sqrt(-2 * Math.log(Math.max(1e-12, next()))) * Math.cos(2 * Math.PI * next());

const spread = (next: Draw) => (2 * next() - 1) * Math.sqrt(3);

const sign = (next: Draw) => {
  if (next() < 0.5) return -1;
  return 1;
};

const cents = (hz: number, ref: number) => 1200 * Math.log2(hz / ref);

const bySemitones = (semitones: number) => 440 * 2 ** (semitones / 12);

const STRINGS = [
  { id: 'E2', hz: bySemitones(-29) },
  { id: 'A2', hz: bySemitones(-24) },
  { id: 'D3', hz: bySemitones(-19) },
  { id: 'G3', hz: bySemitones(-14) },
  { id: 'B3', hz: bySemitones(-10) },
  { id: 'E4', hz: bySemitones(-5) },
] as const;

const rateOf = (index: number) => {
  if (index % 2 === 0) return 44_100;
  return 48_000;
};

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
  readonly f0: number;
  readonly minGlide: number;
  readonly maxGlide: number;
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

interface Glottis {
  phase: number;
  period: number;
  amp: number;
  vowel: ReadonlyArray<number>;
}

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

const pulse = (phase: number) => {
  if (phase < 0.4) return 0.5 * Math.sin((Math.PI * phase) / 0.4);
  if (phase < 0.6) return -Math.sin((Math.PI * (phase - 0.4)) / 0.2);
  return 0;
};

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

const formantScale = (f0: number) => {
  if (f0 > 160) return 1.17;
  return 1;
};

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
  readonly hz: number;
  readonly decay: number;
  readonly stiffness: number;
  readonly position: number;
  readonly attack: number;
  readonly turn: number;
  readonly turnFrom: number;
}

const stiffnessOf = (next: Draw, stiff: boolean) => {
  if (stiff) return between(next, 0, 1e-4);
  return 0;
};

const pluckOf = (next: Draw, hz: number, stiff: boolean): Pluck => ({
  hz,
  decay: between(next, 0.8, 3),
  stiffness: stiffnessOf(next, stiff),
  position: between(next, 0.08, 0.3),
  attack: between(next, 0, 8),
  turn: 0,
  turnFrom: 0,
});

const BLOCK = 16;

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

const room = (next: Draw, rate: number, n: number, kind: RoomKind, level: number) =>
  normalise(ROOMS[kind](next, rate, n), level, new Uint8Array(n).fill(1));

const under = (level: number, db: number) => level / 10 ** (db / 20);

const mix = (signal: Float64Array, other: Float64Array) =>
  signal.map((sample, i) => sample + (other[i] ?? 0));

const framesOf = (signal: Float64Array) =>
  Array.from({ length: Math.floor(signal.length / FRAME) }, (_, k) =>
    Float32Array.from(signal.subarray(k * FRAME, (k + 1) * FRAME)),
  );

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

const endMs = (k: number, at: number, rate: number) => (((k + 1) * FRAME - at) / rate) * 1000;

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

const shownFrames = (shown: ReadonlyArray<number>) =>
  shown.flatMap((hz, frame) => {
    if (Number.isNaN(hz)) return [];
    return [{ frame, hz }];
  });

const when = <A>(holds: boolean, item: A): ReadonlyArray<A> => {
  if (holds) return [item];
  return [];
};

const near = (hz: number, p: Pluck) => !Number.isNaN(hz) && Math.abs(cents(hz, p.hz)) <= 25;

describe('hear', () => {
  it.each([
    ['a low talker', 110, 44_100, 58],
    ['a high talker', 210, 48_000, 58],
  ] as const)('shows no frame of 4 s of %s alone', (_, f0, rate, seed) => {
    const next = draw(seed);
    const level = between(next, 0.02, 0.2);
    const { shown } = listen(framesOf(talk(next, rate, 4, talker(f0), level)), rate);
    expect({ seed, f0, rate, level, shown: shownFrames(shown) }).toEqual({
      seed,
      f0,
      rate,
      level,
      shown: [],
    });
  });

  it.each([
    ['pink noise at 0.05 RMS', 'pink', 0.05, 21],
    ['60 Hz mains hum at 0.01 RMS', 'hum60', 0.01, 22],
  ] as const)('shows no frame of 2 s of %s', (_, kind, level, seed) => {
    const rate = 48_000;
    const { shown } = listen(framesOf(room(draw(seed), rate, 2 * rate, kind, level)), rate);
    expect({ seed, kind, level, shown: shownFrames(shown) }).toEqual({
      seed,
      kind,
      level,
      shown: [],
    });
  });

  it('shows a clean pluck of each string within 250 ms, on every frame to 1 s, within 3 cents from 300 ms', () => {
    const failures = STRINGS.flatMap((string, s) =>
      [0, -30].flatMap((by, b) => {
        const seed = 100 + 2 * s + b;
        const next = draw(seed);
        const rate = rateOf(s + b);
        const p = pluckOf(next, string.hz * 2 ** (by / 1200), false);
        const at = FRAME + Math.floor(next() * FRAME);
        const { shown } = listen(
          framesOf(pluck(next, rate, at + Math.ceil(1.05 * rate), at, p)),
          rate,
        );
        const first = firstMs(shown, at, rate);
        const what = { seed, string: string.id, by, rate, at, pluck: p };
        const late = when(first > 250, { ...what, firstMs: first });
        const dark = shown.flatMap((hz, k) => {
          const ms = endMs(k, at, rate);
          if (ms <= first || ms > 1000 || !Number.isNaN(hz)) return [];
          return [{ ...what, darkFrame: k, ms }];
        });
        const off = shown.flatMap((hz, k) => {
          if (endMs(k, at, rate) <= 300 || Number.isNaN(hz) || Math.abs(cents(hz, p.hz)) <= 3)
            return [];
          return [{ ...what, frame: k, centsOff: cents(hz, p.hz) }];
        });
        return [...late, ...dark, ...off];
      }),
    );
    expect(failures).toEqual([]);
  });

  it('shows a low E under talk at 20 dB within 400 ms, and every shown frame within 25 cents of it', () => {
    const failures = [31, 32].flatMap((seed) => {
      const next = draw(seed);
      const rate = rateOf(seed);
      const p = pluckOf(next, STRINGS[0].hz, next() < 0.5);
      const at = Math.floor(0.5 * rate) + Math.floor(next() * FRAME);
      const n = at + Math.ceil(1.2 * rate);
      const f0 = between(next, 85, 255);
      const signal = mix(
        pluck(next, rate, n, at, p),
        talk(next, rate, n / rate, talker(f0), under(PLUCK_LEVEL, 20)),
      );
      const { shown } = listen(framesOf(signal), rate);
      const first = firstMs(shown, at, rate);
      const what = { seed, talker: f0, rate, at, pluck: p };
      const late = when(first > 400, { ...what, firstMs: first });
      const off = shownFrames(shown)
        .filter(({ hz }) => !near(hz, p))
        .map((frame) => ({ ...what, ...frame }));
      return [...late, ...off];
    });
    expect(failures).toEqual([]);
  });

  it('is pure: the same frames give the same pitches from any state met, and no frame changes', () => {
    const next = draw(41);
    const rate = 44_100;
    const at = Math.floor(0.6 * rate);
    const n = at + rate;
    const signal = mix(
      pluck(next, rate, n, at, pluckOf(next, STRINGS[3].hz, false)),
      talk(next, rate, n / rate, talker(150), under(PLUCK_LEVEL, 20)),
    );
    const frames = framesOf(signal);
    const copies = frames.map((frame) => Float32Array.from(frame));
    const once = listen(frames, rate);
    const twice = listen(frames, rate);
    expect(shownFrames(once.shown).length).toBeGreaterThan(0);
    expect(shownFrames(twice.shown)).toEqual(shownFrames(once.shown));
    expect(frames).toEqual(copies);
    const met = once.states.map((state, k) => ({ state, k })).filter(({ k }) => k % 4 === 1);
    expect(
      met.map(({ state, k }) => shownFrames(listen(frames.slice(k), rate, state).shown)),
    ).toEqual(met.map(({ k }) => shownFrames(once.shown.slice(k))));
  });

  it.each([
    ['low E', 'A', 0, 1, 51],
    ['B', 'G', 4, 3, 52],
  ] as const)(
    'after the %s string shows, the %s string plucked 1 s later, the first still ringing, shows within 400 ms, and no frame strays from both',
    (_, __, from, to, seed) => {
      const next = draw(seed);
      const rate = rateOf(seed);
      const one = pluckOf(next, STRINGS[from].hz, false);
      const two = pluckOf(next, STRINGS[to].hz, false);
      const at = FRAME + Math.floor(next() * FRAME);
      const later = at + rate;
      const n = later + Math.ceil(0.6 * rate);
      const signal = mix(pluck(next, rate, n, at, one), pluck(next, rate, n, later, two));
      const { shown } = listen(framesOf(signal), rate);
      expect({
        seed,
        rate,
        at,
        later,
        one,
        two,
        firstWithin250: firstMs(shown, at, rate, (hz) => near(hz, one)) <= 250,
        secondWithin400: firstMs(shown, later, rate, (hz) => near(hz, two)) <= 400,
        stray: shownFrames(shown).filter(({ hz }) => !near(hz, one) && !near(hz, two)),
      }).toEqual({
        seed,
        rate,
        at,
        later,
        one,
        two,
        firstWithin250: true,
        secondWithin400: true,
        stray: [],
      });
    },
  );
});

const TONE_RATE = 44_100;

const toneFrame = (hz: number) =>
  Float32Array.from({ length: FRAME }, (_, i) => {
    if (Number.isNaN(hz)) return 0;
    const t = (2 * Math.PI * hz * i) / TONE_RATE;
    return 0.1 * (Math.sin(t) + 0.5 * Math.sin(2 * t) + 0.3 * Math.sin(3 * t));
  });

const centsFrom = (hz: number, by: number) => hz * 2 ** (by / 1200);

const READ_CENTS = 0.05;

const NONE = -1;

const atEdge = (tones: ReadonlyArray<number>, shows: ReadonlyArray<number>) => {
  const frames = tones.map(toneFrame);
  const read = frames.map((frame) => Option.getOrElse(detect(frame, TONE_RATE), () => Number.NaN));
  const strays = tones.flatMap((hz, k) => {
    const reading = read[k] ?? Number.NaN;
    if (Number.isNaN(hz) && Number.isNaN(reading)) return [];
    if (!Number.isNaN(reading) && Math.abs(cents(reading, hz)) <= READ_CENTS) return [];
    return [{ frame: k, hz, reading }];
  });
  return {
    actual: { strays, shown: listen(frames, TONE_RATE).shown },
    expected: {
      strays: [],
      shown: shows.map((k) => {
        if (k === NONE) return Number.NaN;
        return read[k] ?? Number.NaN;
      }),
    },
  };
};

const A2 = STRINGS[1].hz;

describe("hear at the rule's edges", () => {
  it('locks a run of 4 frames 9.9 cents apart, highest over lowest, on its 4th frame at that frame’s reading', () => {
    const { actual, expected } = atEdge(
      [A2, centsFrom(A2, 3.3), centsFrom(A2, 6.6), centsFrom(A2, 9.9)],
      [NONE, NONE, NONE, 3],
    );
    expect(actual).toEqual(expected);
  });

  it('locks no run of 4 frames 10.5 cents apart, highest over lowest, though its first and last lie 2 cents apart', () => {
    const { actual, expected } = atEdge(
      [A2, centsFrom(A2, 10.5), centsFrom(A2, 5.25), centsFrom(A2, 2)],
      [NONE, NONE, NONE, NONE],
    );
    expect(actual).toEqual(expected);
  });

  it('starts the run afresh after a frame with no reading', () => {
    const { actual, expected } = atEdge(
      [A2, A2, A2, Number.NaN, A2, A2, A2, A2],
      [NONE, NONE, NONE, NONE, NONE, NONE, NONE, 7],
    );
    expect(actual).toEqual(expected);
  });

  it('follows a reading 19.5 cents from the pitch last shown, and holds that pitch for one 20.5 cents off', () => {
    const { actual, expected } = atEdge(
      [A2, A2, A2, A2, centsFrom(A2, 19.5), centsFrom(A2, 39), centsFrom(A2, 59.5)],
      [NONE, NONE, NONE, 3, 4, 5, 5],
    );
    expect(actual).toEqual(expected);
  });

  it('holds the pitch across 2 frames with no reading, and lets it go on the 3rd', () => {
    const { actual, expected } = atEdge(
      [A2, A2, A2, A2, Number.NaN, Number.NaN, Number.NaN],
      [NONE, NONE, NONE, 3, 3, 3, NONE],
    );
    expect(actual).toEqual(expected);
  });

  it('lets go on the 3rd frame a semitone off, and that frame starts the run that locks the new pitch 3 frames later', () => {
    const far = centsFrom(A2, 100);
    const { actual, expected } = atEdge(
      [A2, A2, A2, A2, far, far, far, far, far, far],
      [NONE, NONE, NONE, 3, 3, 3, NONE, NONE, NONE, 9],
    );
    expect(actual).toEqual(expected);
  });

  it('never shows a steady 64.5 Hz tone, under the floor', () => {
    const { actual, expected } = atEdge(
      Array.from({ length: 6 }, () => 64.5),
      Array(6).fill(NONE),
    );
    expect(actual).toEqual(expected);
  });

  it('locks a steady 65.5 Hz tone, over the floor', () => {
    const { actual, expected } = atEdge(
      Array.from({ length: 4 }, () => 65.5),
      [NONE, NONE, NONE, 3],
    );
    expect(actual).toEqual(expected);
  });

  it('follows a held 68 Hz tone falling 15 cents a frame to the floor, holds its last pitch over it for 2 frames under 65 Hz, and lets go on the 3rd', () => {
    const falling = Array.from({ length: 8 }, (_, k) => centsFrom(68, -15 * (k + 1)));
    const { actual, expected } = atEdge(
      [68, 68, 68, 68, ...falling],
      [NONE, NONE, NONE, 3, 4, 5, 6, 7, 8, 8, 8, NONE],
    );
    expect({ underFloor: falling.filter((hz) => hz < 65).length, ...actual }).toEqual({
      underFloor: 3,
      ...expected,
    });
  });

  it('keeps its state opaque: a caller holds a `Focus` and hands it back, and reads nothing from it', () => {
    // @ts-expect-error -- `Focus` is opaque: no caller reads even its tag, which every state has.
    const tag: unknown = unfocused._tag;
    expect(tag).toBeUndefined();
  });
});
