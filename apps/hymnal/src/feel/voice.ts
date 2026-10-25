/**
 * The voice: the app's short sounds, made in code ("our clicks", the
 * owner's prototypes) and rendered to 16-bit mono PCM in a WAV file each.
 * A sound is one or more clicks. A click is a burst of noise through a
 * band-pass filter (Q 3.5), its envelope (1 − t)^4, and, for a click with a
 * pitch, a small bell: a sine at the pitch and one at 2.01 times it (a
 * quarter as loud), rising over 4 ms and dying away exponentially over the
 * click's ring.
 *
 * The noise is seeded per sound, so a sound renders the same bytes every
 * time and its content hash (`hashOf`) names its file: an unchanged recipe
 * writes nothing new. The gains keep the prototypes' balance, all scaled by
 * one `MASTER` so the loudest sound peaks under full scale.
 */

import { Option } from 'effect';

import type { SoundName } from './body';

/** The voice's sample rate, in hertz. */
export const RATE = 24000;

/** One gain over every sound, so the loudest peaks near full scale and none clips. */
export const MASTER = 9;

export interface Click {
  /** When the click starts in its sound, in seconds. */
  readonly at: number;
  /** The band-pass filter's centre, in hertz. */
  readonly band: number;
  readonly gain: number;
  /** How long the noise burst lasts, in seconds. */
  readonly burst: number;
  /** The bell's pitch, in hertz; none for a click of noise alone. */
  readonly pitch: Option.Option<number>;
  /** How long the bell rings, in seconds. */
  readonly ring: number;
}

/** A click of noise alone. */
const tap = (band: number, gain: number, burst: number): Click => ({
  at: 0,
  band,
  gain,
  burst,
  pitch: Option.none(),
  ring: 0,
});

/** A click with a bell at `pitch`, ringing `ring` seconds. */
const bell = (band: number, gain: number, burst: number, pitch: number, ring = 0.18): Click => ({
  at: 0,
  band,
  gain,
  burst,
  pitch: Option.some(pitch),
  ring,
});

const later = (at: number, c: Click): Click => ({ ...c, at });

/** The pentatonic steps of the topic sounds, in semitones above middle C. */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21] as const;

const keys = Array.from(
  { length: 12 },
  (_, n) => [`key-${n}`, [bell(2800, 0.16, 0.012, 523.25 * 2 ** (n / 12))]] as const,
);

const sections = PENTA.map(
  (step, i) => [`section-${i}`, [bell(1100, 0.18, 0.02, 261.63 * 2 ** (step / 12), 0.3)]] as const,
);

/** Every sound the voice holds, by name, as its clicks. */
export const RECIPES: ReadonlyArray<readonly [SoundName, ReadonlyArray<Click>]> = [
  ...keys,
  ['wood', [tap(1500, 0.2, 0.016)]],
  ['thud', [tap(320, 0.3, 0.03)]],
  ['switch-on', [bell(2400, 0.12, 0.012, 880)]],
  ['switch-off', [bell(1300, 0.12, 0.012, 587.33)]],
  ['press', [tap(1800, 0.14, 0.01)]],
  ['chime-up', [bell(3000, 0.12, 0.012, 659.25), later(0.09, bell(3200, 0.12, 0.012, 987.77))]],
  ['chime-down', [bell(3000, 0.12, 0.012, 783.99), later(0.09, bell(3200, 0.12, 0.012, 523.25))]],
  ['land', [bell(3000, 0.1, 0.012, 659.25), later(0.08, bell(3200, 0.09, 0.012, 880))]],
  ...sections,
  ['tick', [tap(2700, 0.1, 0.008)]],
];

/** How long a noise burst's filter rings on after the burst, in seconds. */
const TAIL = 0.04;

/** The last stretch of each sound, faded to silence, in seconds. */
const FADE = 0.005;

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

/** A seed from a sound's name. */
const seedOf = (name: string) => {
  let h = 2166136261;
  for (let i = 0; i < name.length; i += 1) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** How long a click sounds, in seconds, from its own start. */
const lengthOf = (c: Click) => Math.max(c.burst + TAIL, c.ring);

/** Adds one click into `out`, its samples from `start`. */
const addClick = (out: Float64Array, c: Click, random: () => number) => {
  const start = Math.round(c.at * RATE);
  const burst = Math.floor(c.burst * RATE);
  const span = Math.min(Math.ceil(lengthOf(c) * RATE), out.length - start);
  // The band-pass (RBJ, a constant 0 dB peak), as the prototypes' Web Audio filter.
  const w = (2 * Math.PI * c.band) / RATE;
  const alpha = Math.sin(w) / (2 * 3.5);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * Math.cos(w)) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  const peak = c.gain * 0.45;
  const attack = 0.004;
  const rings = Option.isSome(c.pitch);
  const pitch = Option.getOrElse(c.pitch, () => 0);
  for (let i = 0; i < span; i += 1) {
    const x = (i < burst && (random() * 2 - 1) * (1 - i / burst) ** 4) || 0;
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    let sample = y * c.gain;
    if (rings) {
      const t = i / RATE;
      const envelope =
        (t < attack && 0.0001 * (peak / 0.0001) ** (t / attack)) ||
        (t < c.ring && peak * (0.0001 / peak) ** ((t - attack) / (c.ring - attack))) ||
        0;
      const phase = 2 * Math.PI * pitch * t;
      sample += envelope * (Math.sin(phase) + 0.25 * Math.sin(phase * 2.01));
    }
    out[start + i] = (out[start + i] ?? 0) + sample;
  }
};

/** A sound's samples, from -1 to 1, at `RATE`. */
export const samplesOf = (name: string, clicks: ReadonlyArray<Click>): Float64Array => {
  const seconds = Math.max(...clicks.map((c) => c.at + lengthOf(c))) + FADE;
  const out = new Float64Array(Math.ceil(seconds * RATE));
  const random = seeded(seedOf(name));
  for (const c of clicks) addClick(out, c, random);
  const fade = Math.round(FADE * RATE);
  for (let i = 0; i < out.length; i += 1) {
    const left = out.length - 1 - i;
    out[i] = (out[i] ?? 0) * MASTER * Math.min(1, left / fade);
  }
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

/** Renders the sound `name` from its clicks. */
export const voiced = (name: SoundName, clicks: ReadonlyArray<Click>): Voiced => {
  const wav = wavOf(samplesOf(name, clicks));
  return { name, wav, hash: hashOf(wav) };
};
