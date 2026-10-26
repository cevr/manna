/**
 * The voice: the dials' sounds, made in code and rendered to 16-bit mono
 * PCM in a WAV file each. Only a dial's detent is heard (`body.ts`): the key
 * dial sounds a tone at each key's pitch class, and the capo and text-size
 * dials share one thock, deep and unpitched, like a mechanical key.
 *
 * A sound is layers, scaled together to the sound's own peak `level`:
 * - a struck tone: sine partials over one pitch, each rising over `attack`
 *   and dying away exponentially (60 dB over its `ring`), the pitch held or
 *   falling (`fall`, in octaves a second);
 * - a burst of noise through a band-pass filter, its envelope (1 − t)^4.
 *
 * Each kind has candidates (`THOCKS`, `TONES`), rendered side by side by
 * `scripts/feel-candidates.ts` so the owner picks them by ear; `PICKED`
 * names the ones the app plays.
 *
 * The noise is seeded per sound, so a sound renders the same bytes every
 * time and its content hash (`hashOf`) names its file: an unchanged recipe
 * writes nothing new.
 */

import type { SoundName } from './body';

/** The voice's sample rate, in hertz. */
export const RATE = 24000;

/** One sine of a struck tone, at `ratio` times the tone's pitch. */
export interface Partial {
  readonly ratio: number;
  readonly gain: number;
  /** How long it takes to fall 60 dB, in seconds. */
  readonly ring: number;
}

/** A struck tone: its partials over one pitch. */
export interface Tone {
  readonly _tag: 'Tone';
  /** When the tone starts in its sound, in seconds. */
  readonly at: number;
  /** Its pitch as it is struck, in hertz. */
  readonly pitch: number;
  /** How fast its pitch falls, in octaves a second: 0 holds it. */
  readonly fall: number;
  /** How long it rises to full, in seconds. */
  readonly attack: number;
  /**
   * How much of its fall comes late, from 0 to 1. At 0 each partial falls
   * exponentially, as a struck bar does; toward 1 it holds and then fades
   * (a Gaussian), which keeps a low tone's energy at its own pitch.
   */
  readonly hold: number;
  readonly partials: ReadonlyArray<Partial>;
}

/** A burst of noise through a band-pass filter. */
export interface Noise {
  readonly _tag: 'Noise';
  /** When the burst starts in its sound, in seconds. */
  readonly at: number;
  /** The band-pass filter's centre, in hertz. */
  readonly band: number;
  /** The filter's Q: lower is wider. */
  readonly q: number;
  readonly gain: number;
  /** How long the burst lasts, in seconds. */
  readonly burst: number;
}

export type Layer = Tone | Noise;

/** A sound's recipe: its layers, and the peak it is scaled to. */
export interface Recipe {
  /** The sound's peak, from 0 to 1. */
  readonly level: number;
  readonly layers: ReadonlyArray<Layer>;
}

/** How a tone is struck: its rise, its fall of pitch and its hold (`Tone`); each is optional. */
interface Strike {
  readonly attack?: number;
  readonly fall?: number;
  readonly hold?: number;
}

const tone = (pitch: number, partials: ReadonlyArray<Partial>, strike: Strike = {}): Tone => ({
  _tag: 'Tone',
  at: 0,
  pitch,
  fall: strike.fall ?? 0,
  attack: strike.attack ?? 0.002,
  hold: strike.hold ?? 0,
  partials,
});

const noise = (band: number, q: number, gain: number, burst: number): Noise => ({
  _tag: 'Noise',
  at: 0,
  band,
  q,
  gain,
  burst,
});

/** A partial at `ratio` times its tone's pitch. */
const partial = (ratio: number, gain: number, ring: number): Partial => ({ ratio, gain, ring });

/** A candidate sound: a line that says what it is, and its recipe. */
export interface Candidate<A> {
  readonly about: string;
  readonly recipe: A;
}

/**
 * The thock's candidates. Two are a low struck body whose pitch falls fast
 * (so no pitch class holds it) under a burst of low noise, the key's felt
 * bottoming out, with a faint click for its edge; one is the low noise alone.
 */
export const THOCKS = {
  deep: {
    about: 'deep and round: a low body falling from 320 Hz under a felt burst',
    recipe: {
      level: 0.8,
      layers: [
        tone(320, [partial(1, 1, 0.08), partial(2.3, 0.25, 0.03)], { attack: 0.001, fall: 7 }),
        noise(420, 1.2, 1.4, 0.01),
        noise(2000, 2, 0.15, 0.002),
      ],
    },
  },
  tight: {
    about: 'tighter and shorter: a body falling from 400 Hz, a touch more click',
    recipe: {
      level: 0.8,
      layers: [
        tone(400, [partial(1, 1, 0.05), partial(2.4, 0.2, 0.02)], { attack: 0.001, fall: 10 }),
        noise(520, 1.3, 1.3, 0.007),
        noise(2200, 2, 0.25, 0.002),
      ],
    },
  },
  muted: {
    about: 'muted: a low felt burst with no body',
    recipe: {
      level: 0.75,
      layers: [noise(260, 1, 1, 0.016), noise(560, 1.4, 0.3, 0.01)],
    },
  },
} as const satisfies Record<string, Candidate<Recipe>>;

/**
 * The key tone's candidates, each a recipe at a pitch. Every partial sits
 * at an octave of the pitch (a third harmonic is heard a fifth up), and
 * none rings over 2.5 kHz, so the tone is heard at its key and carries no
 * hiss.
 */
export const TONES = {
  marimba: {
    about: 'a warm marimba, C4 to B4: the pitch and its double octave, a soft mallet',
    recipe: (pitch: number): Recipe => ({
      level: 0.7,
      layers: [
        tone(pitch, [partial(1, 1, 0.22), partial(4, 0.4, 0.09)], { hold: 0.5 }),
        noise(pitch * 4, 3, 0.3, 0.003),
      ],
    }),
  },
  felt: {
    about: 'a felt piano, C4 to B4: the pitch, its octave and double octave, a soft start',
    recipe: (pitch: number): Recipe => ({
      level: 0.7,
      layers: [
        tone(pitch, [partial(1, 1, 0.24), partial(2, 0.4, 0.14), partial(4, 0.08, 0.06)], {
          attack: 0.006,
          hold: 0.5,
        }),
      ],
    }),
  },
  glass: {
    about: 'a small glass bell, C5 to B5 (the old register): the pitch and a faint octave',
    recipe: (pitch: number): Recipe => ({
      level: 0.6,
      layers: [tone(pitch * 2, [partial(1, 1, 0.16), partial(2, 0.12, 0.06)])],
    }),
  },
} as const satisfies Record<string, Candidate<(pitch: number) => Recipe>>;

export type ThockName = keyof typeof THOCKS;
export type ToneName = keyof typeof TONES;

/** The candidates the app plays: the recommended ones until the owner picks. */
export const PICKED = {
  thock: 'deep',
  tone: 'marimba',
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

/** How long a noise burst's filter rings on after the burst, in seconds. */
const TAIL = 0.02;

/** The last stretch of each sound, faded to silence, in seconds. */
const FADE = 0.005;

/** The level a partial dies away to over its ring: 60 dB down. */
const RING_FLOOR = 0.001;

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

/** How long a layer sounds, in seconds, from its own start. */
const lengthOf = (layer: Layer) => {
  switch (layer._tag) {
    case 'Tone':
      return Math.max(0, ...layer.partials.map((p) => p.ring));
    case 'Noise':
      return layer.burst + TAIL;
  }
};

/** How many turns a pitch of `hz` falling `fall` octaves a second has made by `t` seconds. */
const turnsAt = (hz: number, fall: number, t: number) => {
  if (fall === 0) return hz * t;
  return (hz * (1 - 2 ** (-fall * t))) / (fall * Math.LN2);
};

/** How many samples a sound of `recipe` holds. */
const countOf = (recipe: Recipe) =>
  Math.ceil((Math.max(0, ...recipe.layers.map((l) => l.at + lengthOf(l))) + FADE) * RATE);

/** How long a sound of `recipe` plays, in milliseconds: its whole file. */
export const lengthMs = (recipe: Recipe) => (countOf(recipe) / RATE) * 1000;

/** Adds a struck tone into `out`. */
const addTone = (out: Float64Array, layer: Tone) => {
  const start = Math.round(layer.at * RATE);
  for (const p of layer.partials) {
    const span = Math.min(Math.ceil(p.ring * RATE), out.length - start);
    const floor = Math.log(RING_FLOOR);
    const base = layer.pitch * p.ratio;
    for (let i = 0; i < span; i += 1) {
      const t = i / RATE;
      const u = t / p.ring;
      const turns = turnsAt(base, layer.fall, t);
      const rise = (t < layer.attack && Math.sin((Math.PI / 2) * (t / layer.attack)) ** 2) || 1;
      const fall = Math.exp(floor * ((1 - layer.hold) * u + layer.hold * u * u));
      const sample = p.gain * rise * fall * Math.sin(2 * Math.PI * turns);
      out[start + i] = (out[start + i] ?? 0) + sample;
    }
  }
};

/** A band-pass filter (RBJ, a constant 0 dB peak) at `band` hertz: each call takes a sample in and gives one out. */
const bandPass = (band: number, q: number) => {
  const w = (2 * Math.PI * band) / RATE;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * Math.cos(w)) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (x: number) => {
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
};

/**
 * Adds a burst of band-passed noise into `out`. The filter runs twice over
 * the noise, so its skirts fall 12 dB an octave and a low burst keeps no
 * hiss above it.
 */
const addNoise = (out: Float64Array, layer: Noise, random: () => number) => {
  const start = Math.round(layer.at * RATE);
  const burst = Math.floor(layer.burst * RATE);
  const span = Math.min(Math.ceil(lengthOf(layer) * RATE), out.length - start);
  const first = bandPass(layer.band, layer.q);
  const second = bandPass(layer.band, layer.q);
  for (let i = 0; i < span; i += 1) {
    const x = (i < burst && (random() * 2 - 1) * (1 - i / burst) ** 4) || 0;
    out[start + i] = (out[start + i] ?? 0) + second(first(x)) * layer.gain;
  }
};

/** A sound's samples, from -1 to 1, at `RATE`, its peak at its recipe's level. */
export const samplesOf = (name: string, recipe: Recipe): Float64Array => {
  const out = new Float64Array(countOf(recipe));
  const random = seeded(seedOf(name));
  for (const layer of recipe.layers)
    switch (layer._tag) {
      case 'Tone':
        addTone(out, layer);
        break;
      case 'Noise':
        addNoise(out, layer, random);
        break;
    }
  const fade = Math.round(FADE * RATE);
  for (let i = 0; i < out.length; i += 1)
    out[i] = (out[i] ?? 0) * Math.min(1, (out.length - 1 - i) / fade);
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
  const wav = wavOf(samplesOf(name, recipe));
  return { name, wav, hash: hashOf(wav) };
};

const LENGTHS = new Map(RECIPES.map(([name, recipe]) => [name, lengthMs(recipe)]));

/** The longest sound the voice holds, in milliseconds. */
const LONGEST = Math.max(...LENGTHS.values());

/** How long the voice's sound `name` plays, in milliseconds (the longest for a name it holds none of). */
export const soundLength = (name: SoundName): number => LENGTHS.get(name) ?? LONGEST;
