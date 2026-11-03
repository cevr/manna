/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noFixedWaitInTests, eslint/no-await-in-loop -- a React screen test: the screen's forked Effect work and its renders settle on the host's event loop, so each frame is handed over in `act` and awaited one after another, each turn a `Bun.sleep(0)` yield, until its read lands (the needle's animation is the event waited on). */

import { describe, expect, it } from 'bun:test';
import { Effect, Option } from 'effect';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { animations } from '../test/reanimated';

import { type Device, type Source, Tuner } from './Tuner';

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

const bySemitones = (semitones: number) => 440 * 2 ** (semitones / 12);

const STRINGS = [
  { id: 'E2', hz: bySemitones(-29) },
  { id: 'A2', hz: bySemitones(-24) },
  { id: 'D3', hz: bySemitones(-19) },
  { id: 'G3', hz: bySemitones(-14) },
  { id: 'B3', hz: bySemitones(-10) },
  { id: 'E4', hz: bySemitones(-5) },
] as const;

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

const under = (level: number, db: number) => level / 10 ** (db / 20);

const mix = (signal: Float64Array, other: Float64Array) =>
  signal.map((sample, i) => sample + (other[i] ?? 0));

const framesOf = (signal: Float64Array) =>
  Array.from({ length: Math.floor(signal.length / FRAME) }, (_, k) =>
    Float32Array.from(signal.subarray(k * FRAME, (k + 1) * FRAME)),
  );

const when = <A,>(holds: boolean, item: A): ReadonlyArray<A> => {
  if (holds) return [item];
  return [];
};

const SEED = 20_261_103;

const seedOf = (n: number, i: number) => {
  let x = (SEED + 10_000 * n + i) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85eb_ca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2_ae35) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
};

const RATE = 44_100;

const talkAlone = (seed: number, low: number, high: number) => {
  const next = draw(seed);
  const f0 = between(next, low, high);
  const level = between(next, 0.02, 0.2);
  return { what: { seed, f0, level }, frames: framesOf(talk(next, RATE, 3, talker(f0), level)) };
};

const cleanA = (seed: number) => {
  const next = draw(seed);
  const by = between(next, -30, 30);
  const p = pluckOf(next, STRINGS[1].hz * 2 ** (by / 1200), false);
  const at = Math.floor(next() * FRAME);
  return {
    what: { seed, by, at, pluck: p },
    frames: framesOf(pluck(next, RATE, at + Math.ceil(RATE), at, p)),
  };
};

const lowEUnderTalk = (seed: number) => {
  const next = draw(seed);
  const p = pluckOf(next, STRINGS[0].hz, next() < 0.5);
  const at = Math.floor(0.5 * RATE) + Math.floor(next() * FRAME);
  const n = at + Math.ceil(1.2 * RATE);
  const f0 = between(next, 85, 255);
  const signal = mix(
    pluck(next, RATE, n, at, p),
    talk(next, RATE, n / RATE, talker(f0), under(PLUCK_LEVEL, 20)),
  );
  return {
    what: { seed, talker: f0, at, pluck: p },
    frames: framesOf(signal),
    onset: Math.floor(at / FRAME),
  };
};

const granted: Device = {
  readPermission: Effect.succeed('granted'),
  askPermission: Effect.succeed('granted'),
  openSettings: () => {},
  active: () => true,
  onActive: () => () => {},
};

const ear = () => {
  const listeners = new Set<(frame: Float32Array) => void>();
  const starts: Array<number> = [];
  const source: Source = {
    name: 'mic',
    start: Effect.sync(() => {
      starts.push(RATE);
      return RATE;
    }),
    stop: Effect.void,
    onFrame: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    onEnd: () => () => {},
  };
  const emit = (frame: Float32Array) => {
    for (const listener of [...listeners]) listener(frame);
  };
  return { source, starts, emit };
};

const tick = () =>
  act(async () => {
    await Bun.sleep(0);
  });

const TURNS = 8;

const mount = async () => {
  const { source, starts, emit } = ear();
  const host = document.createElement('div');
  document.body.append(host);
  const root: Root = createRoot(host);
  act(() =>
    root.render(<Tuner device={granted} source={source} sounding={false} pause={() => {}} />),
  );
  for (let turn = 0; turn < TURNS && starts.length === 0; turn++) await tick();
  await tick();
  return {
    host,
    feed: async (frame: Float32Array) => {
      const before = animations.length;
      act(() => emit(frame));
      for (let turn = 0; turn < TURNS && animations.length === before; turn++) await tick();
      await tick();
    },
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

const IDS: ReadonlyArray<string> = STRINGS.map(({ id }) => id);

const byTestId = (host: HTMLElement, id: string) =>
  Option.getOrThrow(Option.fromNullishOr(host.querySelector(`[data-testid="${id}"]`)));

const circle = (host: HTMLElement, id: string) => byTestId(host, `tuner-string-${id}`);

const click = (element: Element) =>
  act(
    () =>
      void element.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      ),
  );

const filled = (host: HTMLElement, id: string) =>
  Option.fromNullishOr(circle(host, id).firstElementChild).pipe(
    Option.flatMap((inner) => Option.fromNullishOr(inner.getAttribute('style'))),
    Option.exists((style) => style.includes('background-color')),
  );

const screenOf = (host: HTMLElement) => {
  const reading = byTestId(host, 'tuner-reading');
  return {
    words: reading.getAttribute('aria-label') ?? '',
    name: reading.children[0]?.textContent ?? '',
    note: reading.children[1]?.textContent ?? '',
    hint: byTestId(host, 'tuner-hint').getAttribute('aria-label') ?? '',
    lit: IDS.filter((id) => filled(host, id)),
    tuned: IDS.filter((id) =>
      (circle(host, id).getAttribute('aria-label') ?? '').endsWith(', tuned'),
    ),
    turns: [...host.querySelectorAll('[style*="rotate("]')].map(
      (element) => /rotate\([^)]*\)/.exec(element.getAttribute('style') ?? '')?.[0] ?? '',
    ),
  };
};

type Screen = ReturnType<typeof screenOf>;

const AUTO_REST: Omit<Screen, 'turns'> = {
  words: 'Listening',
  name: 'Listening',
  note: '',
  hint: 'Pluck any string',
  lit: [],
  tuned: [],
};

const pickedRest = (id: string, name: string): Omit<Screen, 'turns'> => ({
  words: 'Listening',
  name,
  note: '',
  hint: `Pluck the ${name} string`,
  lit: [id],
  tuned: [],
});

const awayFromRest = (seen: ReadonlyArray<Screen>, rest: Screen) =>
  seen.flatMap((screen, frame) => when(!Bun.deepEquals(screen, rest), { frame, screen }));

const play = async (
  app: { readonly host: HTMLElement; readonly feed: (frame: Float32Array) => Promise<void> },
  frames: ReadonlyArray<Float32Array>,
) => {
  const seen: Array<Screen> = [];
  for (const frame of frames) {
    await app.feed(frame);
    seen.push(screenOf(app.host));
  }
  return seen;
};

const firstNaming = (seen: ReadonlyArray<Screen>, string: string, name: string) => {
  const k = seen.findIndex(
    (screen) =>
      screen.name === name &&
      screen.words.startsWith(`${name} string, `) &&
      Bun.deepEquals(screen.lit, [string]),
  );
  if (k === -1) return Number.POSITIVE_INFINITY;
  return k + 1;
};

const namingOther = (seen: ReadonlyArray<Screen>, string: string, name: string) =>
  seen.flatMap((screen, frame) =>
    when(
      !['Listening', name].includes(screen.name) ||
        screen.lit.some((id) => id !== string) ||
        !(screen.words === 'Listening' || screen.words.startsWith(`${name} string, `)),
      { frame, screen },
    ),
  );

describe('the tuner screen through its focus', () => {
  it('in Auto, shows nothing of 3 s of talk, and Auto turned off then picks the lowest string', async () => {
    const { what, frames } = talkAlone(seedOf(1, 0), 180, 240);
    using app = await mount();
    const rest = screenOf(app.host);
    const seen = await play(app, frames);
    click(byTestId(app.host, 'tuner-auto'));
    expect({
      ...what,
      rest: { ...rest, turns: [] },
      away: awayFromRest(seen, rest),
      selected: IDS.filter((id) => circle(app.host, id).getAttribute('aria-selected') === 'true'),
      auto: byTestId(app.host, 'tuner-auto').getAttribute('aria-checked'),
    }).toEqual({
      ...what,
      rest: { ...AUTO_REST, turns: [] },
      away: [],
      selected: ['E2'],
      auto: 'false',
    });
  });

  it('after 3 s of talk in Auto, reads a clean A pluck as `A string` with its circle lit within 6 frames', async () => {
    const said = talkAlone(seedOf(2, 0), 180, 240);
    const plucked = cleanA(seedOf(2, 1));
    using app = await mount();
    const rest = screenOf(app.host);
    const during = await play(app, said.frames);
    const seen = await play(app, plucked.frames);
    const first = firstNaming(seen, 'A2', 'A');
    expect({
      talk: said.what,
      pluck: plucked.what,
      away: awayFromRest(during, rest),
      late: when(first > 6, first),
      other: namingOther(seen, 'A2', 'A'),
      dark: seen.flatMap((screen, k) =>
        when(k + 1 > first && screen.name !== 'A', { frame: k, screen }),
      ),
    }).toEqual({
      talk: said.what,
      pluck: plucked.what,
      away: [],
      late: [],
      other: [],
      dark: [],
    });
  });

  it('with D picked, keeps the reading at rest and the needle at centre through 3 s of talk', async () => {
    const { what, frames } = talkAlone(seedOf(3, 0), 95, 130);
    using app = await mount();
    click(circle(app.host, 'D3'));
    const rest = screenOf(app.host);
    const seen = await play(app, frames);
    expect({ ...what, rest: { ...rest, turns: [] }, away: awayFromRest(seen, rest) }).toEqual({
      ...what,
      rest: { ...pickedRest('D3', 'D'), turns: [] },
      away: [],
    });
  });

  it.each([0, 1])(
    'in Auto, names a low E under talk at 20 dB within 9 frames of its onset, and no other string (pluck %d)',
    async (i) => {
      const { what, frames, onset } = lowEUnderTalk(seedOf(4, i));
      using app = await mount();
      const rest = screenOf(app.host);
      const seen = await play(app, frames);
      const first = firstNaming(seen.slice(onset), 'E2', 'Low E');
      expect({
        ...what,
        before: awayFromRest(seen.slice(0, onset), rest),
        late: when(first > 9, first),
        other: namingOther(seen, 'E2', 'Low E'),
      }).toEqual({ ...what, before: [], late: [], other: [] });
    },
  );
});
