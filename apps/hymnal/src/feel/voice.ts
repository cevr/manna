import type { SoundName } from './body';

export const RATE = 24000;

const TAU = 2 * Math.PI;

export interface Mode {
  readonly hz: number;
  readonly gain: number;
  readonly decayMs: number;
}

export interface Thock {
  readonly _tag: 'Thock';
  readonly ms: number;
  readonly level: number;
  readonly lowpass: number;
  readonly seed: number;
  readonly contactMs: number;
  readonly returnAtMs: number;
  readonly returnGain: number;
  readonly modes: ReadonlyArray<Mode>;
}

export interface Ring {
  readonly gain: number;
  readonly decayMs: number;
}

export interface Tine {
  readonly _tag: 'Tine';
  readonly ms: number;
  readonly level: number;
  readonly lowpass: number;
  readonly pitch: number;
  readonly attackMs: number;
  readonly decayMs: number;
  readonly fallPower: number;
  readonly flex: Ring & { readonly ratio: number };
  readonly recoil: Ring & { readonly atMs: number; readonly attackMs: number };
}

export type Recipe = Thock | Tine;

export interface Candidate<A> {
  readonly about: string;
  readonly recipe: A;
}

export const THOCKS = {
  tactile: {
    about: 'a lubed switch: two cushioned contacts and a low case cavity',
    recipe: {
      _tag: 'Thock',
      ms: 42,
      level: 0.74,
      lowpass: 1050,
      seed: 1837,
      contactMs: 1.4,
      returnAtMs: 8,
      returnGain: -0.38,
      modes: [
        { hz: 168, gain: 1, decayMs: 7 },
        { hz: 307, gain: 0.65, decayMs: 4.5 },
        { hz: 563, gain: 0.4, decayMs: 3 },
        { hz: 827, gain: 0.15, decayMs: 2 },
      ],
    },
  },
} as const satisfies Record<string, Candidate<Thock>>;

export const TONES = {
  tine: {
    about: 'a kalimba tine, C4 to B4: a firm pitch, a brief flex and a soft thumb return',
    recipe: (pitch: number): Tine => ({
      _tag: 'Tine',
      ms: 112,
      level: 0.62,
      lowpass: 2100,
      pitch,
      attackMs: 2.4,
      decayMs: 54,
      fallPower: 1.65,
      flex: { ratio: 2.76, gain: 0.24, decayMs: 5 },
      recoil: { atMs: 8, attackMs: 1.5, gain: 0.18, decayMs: 12 },
    }),
  },
} as const satisfies Record<string, Candidate<(pitch: number) => Tine>>;

export type ThockName = keyof typeof THOCKS;
export type ToneName = keyof typeof TONES;

export const PICKED = {
  thock: 'tactile',
  tone: 'tine',
} as const satisfies { readonly thock: ThockName; readonly tone: ToneName };

const C4 = 261.63;

export const keyPitch = (n: number) => C4 * 2 ** (n / 12);

export const recipesOf = (
  thock: Recipe,
  keyTone: (pitch: number) => Recipe,
): ReadonlyArray<readonly [SoundName, Recipe]> => [
  ...Array.from({ length: 12 }, (_, n) => [`key-${n}`, keyTone(keyPitch(n))] as const),
  ['thock', thock],
];

export const RECIPES = recipesOf(THOCKS[PICKED.thock].recipe, TONES[PICKED.tone].recipe);

const EASE_IN = 0.6;

const EASE_OUT = 6;

const SETTLE = 5;

const CLOSE = 4;

const BUTTERWORTH = [0.5176380902, 0.7071067812, 1.931851653];

const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const rise = (ms: number, attack: number) =>
  Math.sin((Math.min(1, Math.max(0, ms / attack)) * Math.PI) / 2) ** 2;

const countOf = (recipe: Recipe) => Math.round((recipe.ms * RATE) / 1000);

export const lengthMs = (recipe: Recipe) => (countOf(recipe) / RATE) * 1000;

const lowpass = (cut: number, q: number) => {
  const w = (TAU * cut) / RATE;
  const co = Math.cos(w);
  const a = Math.sin(w) / (2 * q);
  const b0 = (1 - co) / (2 * (1 + a));
  const a1 = (-2 * co) / (1 + a);
  const a2 = (1 - a) / (1 + a);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (x: number) => {
    const y = b0 * (x + 2 * x1 + x2) - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
};

const resonator = (mode: Mode) => {
  const r = Math.exp(-1 / ((RATE * mode.decayMs) / 1000));
  const w = (TAU * mode.hz) / RATE;
  const a = 2 * r * Math.cos(w);
  const b = r * r;
  let y1 = 0;
  let y2 = 0;
  return (x: number) => {
    const y = Math.sin(w) * x + a * y1 - b * y2;
    y2 = y1;
    y1 = y;
    return y * mode.gain;
  };
};

const thockDrive = (recipe: Thock) => {
  const random = seeded(recipe.seed);
  const bank = recipe.modes.map(resonator);
  const contact = (at: number) =>
    (at >= 0 && at < recipe.contactMs && Math.sin((Math.PI * at) / recipe.contactMs) ** 2) || 0;
  return (ms: number) => {
    const force =
      (random() * 2 - 1) * (contact(ms) + recipe.returnGain * contact(ms - recipe.returnAtMs));
    return bank.reduce((sum, mode) => sum + mode(force), 0);
  };
};

const tineAt = (recipe: Tine, ms: number, t: number) => {
  const f = recipe.pitch;
  const { flex, recoil } = recipe;
  const held =
    Math.sin(TAU * f * t) * Math.exp(-((ms / recipe.decayMs) ** recipe.fallPower)) +
    flex.gain * Math.sin(TAU * f * flex.ratio * t) * Math.exp(-ms / flex.decayMs);
  const since = ms - recoil.atMs;
  const octave =
    (since > 0 &&
      recoil.gain *
        rise(since, recoil.attackMs) *
        Math.sin((TAU * 2 * f * since) / 1000) *
        Math.exp(-since / recoil.decayMs)) ||
    0;
  return rise(ms, recipe.attackMs) * held + octave;
};

const driveOf = (recipe: Recipe): ((ms: number, t: number) => number) => {
  switch (recipe._tag) {
    case 'Thock':
      return thockDrive(recipe);
    case 'Tine':
      return (ms, t) => tineAt(recipe, ms, t);
  }
};

export const samplesOf = (recipe: Recipe): Float64Array => {
  const out = new Float64Array(countOf(recipe));
  const drive = driveOf(recipe);
  const filters = BUTTERWORTH.map((q) => lowpass(recipe.lowpass, q));
  for (let i = 0; i < out.length; i += 1) {
    const t = i / RATE;
    const ms = t * 1000;
    let x = drive(ms, t) * (rise(ms, EASE_IN) * rise(recipe.ms - SETTLE - ms, EASE_OUT));
    for (const filter of filters) x = filter(x);
    out[i] = x;
  }
  for (let i = 0; i < out.length; i += 1) {
    const remaining = ((out.length - 1 - i) / RATE) * 1000;
    out[i] = (out[i] ?? 0) * rise(remaining - 1, CLOSE);
  }
  const peak = out.reduce((most, s) => Math.max(most, Math.abs(s)), 0);
  const scale = (peak > 0 && recipe.level / peak) || 0;
  for (let i = 0; i < out.length; i += 1) out[i] = (out[i] ?? 0) * scale;
  return out;
};

const HEADER = 44;

export const wavOf = (samples: Float64Array): Uint8Array => {
  const bytes = new Uint8Array(HEADER + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, word: string) => {
    for (let i = 0; i < word.length; i += 1) view.setUint8(at + i, word.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(HEADER + i * 2, Math.round(s * 32767), true);
  }
  return bytes;
};

export const hashOf = (bytes: Uint8Array): string => {
  let h = 2166136261;
  for (const byte of bytes) h = Math.imul(h ^ byte, 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
};

export interface Voiced {
  readonly name: SoundName;
  readonly wav: Uint8Array;
  readonly hash: string;
}

export const voiced = (name: SoundName, recipe: Recipe): Voiced => {
  const wav = wavOf(samplesOf(recipe));
  return { name, wav, hash: hashOf(wav) };
};

const LENGTHS = new Map(RECIPES.map(([name, recipe]) => [name, lengthMs(recipe)]));

const LONGEST = Math.max(...LENGTHS.values());

export const soundLength = (name: SoundName): number => LENGTHS.get(name) ?? LONGEST;
