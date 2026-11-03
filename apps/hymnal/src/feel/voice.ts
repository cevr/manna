/**
 * The voice: the dials' sounds, made in code and rendered to 16-bit mono
 * PCM in a WAV file each. Only a dial's detent is heard (`body.ts`): the key
 * dial sounds a tone at each key's pitch class, and the capo and text-size
 * dials share one thock, deep and unpitched, like a mechanical key.
 *
 * A sound is one of two recipes:
 * - a thock (`Thock`): two short contacts of seeded noise, the second turned
 *   over (a key pressed and let back up), drive a bank of damped resonators,
 *   a low case cavity;
 * - a tine (`Tine`): a held pitch under a brief inharmonic flex, and the
 *   pitch's octave a few milliseconds later (a tine thumbed and let go).
 * Each sound then eases in and out, runs through a 6-pole Butterworth
 * low-pass, closes over its last 5 ms (the last 1 ms silent) and is scaled
 * to its peak `level`. Every number is in its recipe or named here.
 *
 * `THOCKS` and `TONES` hold the candidates, which `scripts/feel-candidates.ts`
 * renders as takes for the owner's ear; `PICKED` names the ones the app
 * plays, the owner's pick of 2026-10-25 (`tactile`, `tine`). The bytes equal
 * the takes the owner heard, sample for sample.
 *
 * A sound renders the same bytes every time (its noise is seeded by its
 * recipe), and its content hash (`hashOf`) names its file: an unchanged
 * recipe writes nothing new.
 */

import type { SoundName } from './body';

/** The voice's sample rate, in hertz. */
export const RATE = 24000;

const TAU = 2 * Math.PI;

/** One resonator of a thock's bank: its pitch, its gain and how fast it dies (amplitude e-folding, in milliseconds). */
export interface Mode {
  readonly hz: number;
  readonly gain: number;
  readonly decayMs: number;
}

/** A thock: two contacts of noise striking a bank of resonators. */
export interface Thock {
  readonly _tag: 'Thock';
  /** The whole file, in milliseconds. */
  readonly ms: number;
  /** The sound's peak, from 0 to 1. */
  readonly level: number;
  /** The low-pass filter's corner, in hertz. */
  readonly lowpass: number;
  /** The noise's seed. */
  readonly seed: number;
  /** How long each contact lasts (a sine-squared pulse), in milliseconds. */
  readonly contactMs: number;
  /** When the second contact comes, in milliseconds. */
  readonly returnAtMs: number;
  /** The second contact's gain: negative turns it over. */
  readonly returnGain: number;
  readonly modes: ReadonlyArray<Mode>;
}

/** A partial that dies away exponentially: its gain and its amplitude e-folding, in milliseconds. */
export interface Ring {
  readonly gain: number;
  readonly decayMs: number;
}

/** A tine: a held pitch, a brief flex over it, and its octave a moment later. */
export interface Tine {
  readonly _tag: 'Tine';
  readonly ms: number;
  readonly level: number;
  readonly lowpass: number;
  /** Its pitch, in hertz. */
  readonly pitch: number;
  /** How long the tone rises to full, in milliseconds. */
  readonly attackMs: number;
  /** The held pitch falls as exp(−(t / decayMs) ^ fallPower): over 1 it holds, then fades. */
  readonly decayMs: number;
  readonly fallPower: number;
  /** An inharmonic partial at `ratio` times the pitch, the tine's flex. */
  readonly flex: Ring & { readonly ratio: number };
  /** The octave that comes at `atMs`, rising over `attackMs`, the tine's recoil. */
  readonly recoil: Ring & { readonly atMs: number; readonly attackMs: number };
}

export type Recipe = Thock | Tine;

/** A candidate sound: a line that says what it is, and its recipe. */
export interface Candidate<A> {
  readonly about: string;
  readonly recipe: A;
}

/** The thock's candidates. */
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

/**
 * The key tone's candidates, each a recipe at a pitch. The flex's partial
 * is quiet and gone in a few milliseconds, and the low-pass keeps the tone
 * under 2.5 kHz, so the tone is heard at its key and carries no hiss.
 */
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

/** The candidates the app plays: the owner's pick. */
export const PICKED = {
  thock: 'tactile',
  tone: 'tine',
} as const satisfies { readonly thock: ThockName; readonly tone: ToneName };

/** Middle C, in hertz: the key dial's C. */
const C4 = 261.63;

/** The pitch of the key dial's tone at pitch class `n` (0 is C), from C4 up to B4. */
export const keyPitch = (n: number) => C4 * 2 ** (n / 12);

/** Every sound a voice of this thock and this key tone holds, by name. */
export const recipesOf = (
  thock: Recipe,
  keyTone: (pitch: number) => Recipe,
): ReadonlyArray<readonly [SoundName, Recipe]> => [
  ...Array.from({ length: 12 }, (_, n) => [`key-${n}`, keyTone(keyPitch(n))] as const),
  ['thock', thock],
];

/** Every sound the voice holds, by name, as its recipe. */
export const RECIPES = recipesOf(THOCKS[PICKED.thock].recipe, TONES[PICKED.tone].recipe);

/** How long the drive eases in at a sound's start, in milliseconds. */
const EASE_IN = 0.6;

/** How long the drive eases out, ending `SETTLE` before the file ends, in milliseconds. */
const EASE_OUT = 6;

/** How long the filters are left to ring down after the drive ends, in milliseconds. */
const SETTLE = 5;

/** How long the output closes over, ending 1 ms before the file ends, in milliseconds. */
const CLOSE = 4;

/** The low-pass's three sections: the Q of each, a 6-pole Butterworth. */
const BUTTERWORTH = [0.5176380902, 0.7071067812, 1.931851653];

/** A seeded generator of numbers in [0, 1) (mulberry32). */
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

/** A sine-squared rise from 0 at `ms` 0 to 1 at `attack`, held at 0 before and 1 after. */
const rise = (ms: number, attack: number) =>
  Math.sin((Math.min(1, Math.max(0, ms / attack)) * Math.PI) / 2) ** 2;

/** How many samples a sound of `recipe` holds. */
const countOf = (recipe: Recipe) => Math.round((recipe.ms * RATE) / 1000);

/** How long a sound of `recipe` plays, in milliseconds: its whole file. */
export const lengthMs = (recipe: Recipe) => (countOf(recipe) / RATE) * 1000;

/** A low-pass section (RBJ) at `cut` hertz with this `q`: each call takes a sample in and gives one out. */
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

/** A damped resonator, driven by each sample: the same gain to an impulse at any pitch. */
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

/** A thock's drive, sample by sample: each call takes the time in milliseconds. */
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

/** A tine's drive at `ms` (and `t`, the same time in seconds). */
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

/** A sound's drive, sample by sample. */
const driveOf = (recipe: Recipe): ((ms: number, t: number) => number) => {
  switch (recipe._tag) {
    case 'Thock':
      return thockDrive(recipe);
    case 'Tine':
      return (ms, t) => tineAt(recipe, ms, t);
  }
};

/** A sound's samples, from -1 to 1, at `RATE`, its peak at its recipe's level. */
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

/** `samples` as a WAV file: RIFF, PCM 16-bit mono at `RATE`. */
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

/** The content hash that names a sound's file: FNV-1a over its bytes, eight hex digits. */
export const hashOf = (bytes: Uint8Array): string => {
  let h = 2166136261;
  for (const byte of bytes) h = Math.imul(h ^ byte, 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
};

/** A rendered sound: its name, its WAV file, and the hash its file is named by. */
export interface Voiced {
  readonly name: SoundName;
  readonly wav: Uint8Array;
  readonly hash: string;
}

/** Renders the sound `name` from its recipe. */
export const voiced = (name: SoundName, recipe: Recipe): Voiced => {
  const wav = wavOf(samplesOf(recipe));
  return { name, wav, hash: hashOf(wav) };
};

const LENGTHS = new Map(RECIPES.map(([name, recipe]) => [name, lengthMs(recipe)]));

/** The longest sound the voice holds, in milliseconds. */
const LONGEST = Math.max(...LENGTHS.values());

/** How long the voice's sound `name` plays, in milliseconds (the longest for a name it holds none of). */
export const soundLength = (name: SoundName): number => LENGTHS.get(name) ?? LONGEST;
