/**
 * The voice's 13 sounds, each rendered once: a valid WAV (RIFF, PCM 16-bit
 * mono at the voice's rate), no longer than 0.4 s, peaking above 0.05 and
 * under full scale, silent (under -60 dB) in its last millisecond, the same
 * bytes when rendered again, and as long as `soundLength` says. Each key's
 * tone rings at its key's pitch, within 1 %, by a Goertzel scan.
 *
 * The voice plays the owner's pick, byte for byte the takes he heard
 * (`HEARD`). Every candidate holds the bars its kind is held to, read from
 * its rendered bytes: a thock is deep (centroid at most 600 Hz, half its
 * energy or more under 500 Hz), unpitched (no pitch class over half its
 * chroma) and at most 150 ms; a key tone is heard at its key's pitch class
 * (60 % or more of its chroma) with at most 0.5 % of its energy over
 * 2.5 kHz.
 */

import { describe, expect, it } from 'bun:test';

import type { SoundName } from './body';
import {
  keyPitch,
  PICKED,
  RATE,
  RECIPES,
  type Recipe,
  soundLength,
  THOCKS,
  TONES,
  voiced,
} from './voice';

const NAMES: ReadonlyArray<string> = [...Array.from({ length: 12 }, (_, n) => `key-${n}`), 'thock'];

const sounds = RECIPES.map(([name, recipe]) => voiced(name, recipe));

const text = (bytes: Uint8Array, at: number) => String.fromCharCode(...bytes.slice(at, at + 4));

/** A WAV's samples, from -1 to 1. */
const samplesOf = (wav: Uint8Array) => {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  return Array.from(
    { length: view.getUint32(40, true) / 2 },
    (_, i) => view.getInt16(44 + i * 2, true) / 32768,
  );
};

/** The power at `hz` over `samples` (Goertzel). */
const power = (samples: ReadonlyArray<number>, hz: number) => {
  const k = 2 * Math.cos((2 * Math.PI * hz) / RATE);
  let s1 = 0;
  let s2 = 0;
  for (const x of samples) {
    const s = x + k * s1 - s2;
    s2 = s1;
    s1 = s;
  }
  return s1 * s1 + s2 * s2 - k * s1 * s2;
};

/** The strongest pitch in `low`..`high` Hz: a 10 Hz scan, then a 0.5 Hz one around its best. */
const strongest = (samples: ReadonlyArray<number>, low: number, high: number) => {
  const best = (from: number, to: number, by: number) => {
    let at = from;
    for (let hz = from; hz <= to; hz += by) if (power(samples, hz) > power(samples, at)) at = hz;
    return at;
  };
  const coarse = best(low, high, 10);
  return best(coarse - 10, coarse + 10, 0.5);
};

/** Puts `re` and `im` in bit-reversed order, in place: the radix-2 FFT's first step. */
const bitReverse = (re: Float64Array, im: Float64Array) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] ?? 0, re[i] ?? 0];
      [im[i], im[j]] = [im[j] ?? 0, im[i] ?? 0];
    }
  }
};

/** The power spectrum of `samples`, zero-padded to a power of two: each bin's power and frequency. */
const spectrumOf = (samples: ReadonlyArray<number>) => {
  let n = 1;
  while (n < samples.length) n *= 2;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(samples);
  bitReverse(re, im);
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len)
      for (let k = 0; k < len / 2; k += 1) {
        const wr = Math.cos(a * k);
        const wi = Math.sin(a * k);
        const at = i + k + len / 2;
        const xr = (re[at] ?? 0) * wr - (im[at] ?? 0) * wi;
        const xi = (re[at] ?? 0) * wi + (im[at] ?? 0) * wr;
        re[at] = (re[i + k] ?? 0) - xr;
        im[at] = (im[i + k] ?? 0) - xi;
        re[i + k] = (re[i + k] ?? 0) + xr;
        im[i + k] = (im[i + k] ?? 0) + xi;
      }
  }
  return Array.from({ length: n / 2 + 1 }, (_, k) => ({
    e: (re[k] ?? 0) ** 2 + (im[k] ?? 0) ** 2,
    hz: (k * RATE) / n,
  }));
};

/** A sound's measures: its length, its centroid, its energy under 500 Hz and over 2.5 kHz, its pitch class and that class's chroma share. */
const measure = (name: SoundName, recipe: Recipe) => {
  const samples = samplesOf(voiced(name, recipe).wav);
  const bins = spectrumOf(samples);
  const total = bins.reduce((sum, b) => sum + b.e, 0);
  const share = (keep: (hz: number) => boolean) =>
    bins.reduce((sum, b) => sum + ((keep(b.hz) && b.e) || 0), 0) / total;
  const chroma = Array.from({ length: 12 }, () => 0);
  for (const b of bins)
    if (b.hz >= 50 && b.hz <= 4000) {
      const pc = (((Math.round(69 + 12 * Math.log2(b.hz / 440)) % 12) + 12) % 12) as number;
      chroma[pc] = (chroma[pc] ?? 0) + b.e;
    }
  const strongestClass = chroma.indexOf(Math.max(...chroma));
  const chromaTotal = chroma.reduce((a, b) => a + b, 0);
  return {
    ms: (samples.length / RATE) * 1000,
    centroid: bins.reduce((sum, b) => sum + b.e * b.hz, 0) / total,
    under500: share((hz) => hz < 500),
    over2500: share((hz) => hz >= 2500),
    pc: strongestClass,
    chroma: (chroma[strongestClass] ?? 0) / chromaTotal,
  };
};

describe('the voice', () => {
  it('holds the 13 sounds of the table, by name', () => {
    expect(sounds.map((sound): string => sound.name)).toEqual([...NAMES]);
  });

  it('renders each sound as a RIFF PCM 16-bit mono WAV at its rate', () => {
    for (const { name, wav } of sounds) {
      const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
      expect({
        name,
        riff: text(wav, 0),
        size: view.getUint32(4, true),
        wave: text(wav, 8),
        fmt: text(wav, 12),
        pcm: view.getUint16(20, true),
        channels: view.getUint16(22, true),
        rate: view.getUint32(24, true),
        bits: view.getUint16(34, true),
        data: text(wav, 36),
        length: view.getUint32(40, true),
      }).toEqual({
        name,
        riff: 'RIFF',
        size: wav.length - 8,
        wave: 'WAVE',
        fmt: 'fmt ',
        pcm: 1,
        channels: 1,
        rate: RATE,
        bits: 16,
        data: 'data',
        length: wav.length - 44,
      });
    }
  });

  it('keeps each sound short, audible, unclipped, silent at its end, and as long as soundLength says', () => {
    for (const { name, wav } of sounds) {
      const samples = samplesOf(wav);
      const peak = Math.max(...samples.map(Math.abs));
      const last = samples.slice(-Math.round(RATE / 1000)).map(Math.abs);
      expect({
        name,
        short: samples.length / RATE <= 0.4,
        loud: peak > 0.05,
        unclipped: peak < 0.999,
        quiet: Math.max(...last) < 0.001,
        length: (samples.length / RATE) * 1000,
      }).toEqual({
        name,
        short: true,
        loud: true,
        unclipped: true,
        quiet: true,
        length: soundLength(name),
      });
    }
  });

  it('renders the same bytes again, and names them by the same hash', () => {
    for (const [name, recipe] of RECIPES) {
      const again = voiced(name, recipe);
      const first = sounds.find((sound) => sound.name === name);
      expect(Buffer.from(again.wav).equals(Buffer.from(first?.wav ?? []))).toBe(true);
      expect(again.hash).toBe(first?.hash ?? '');
    }
    expect(new Set(sounds.map((sound) => sound.hash)).size).toBe(sounds.length);
  });

  it('rings each key at its own pitch, within 1 %', () => {
    for (let n = 0; n < 12; n += 1) {
      const wav = sounds[n]?.wav ?? new Uint8Array();
      const pitch = keyPitch(n);
      const heard = strongest(samplesOf(wav), pitch * 0.85, pitch * 1.15);
      expect({ n, near: Math.abs(heard - pitch) / pitch <= 0.01 }).toEqual({ n, near: true });
    }
  });
});

/**
 * The hashes of the sounds the owner picked by ear (2026-10-25: `tactile`,
 * `tine`), each a WAV byte for byte the same as the take he heard (its
 * sha256 equal to the take's in the unit's `sounds-2/measurements.json`).
 * A change to a recipe, or to how a sound is rendered, changes what he
 * hears: it needs his ear again before this list changes.
 */
const HEARD: ReadonlyArray<readonly [string, string]> = [
  ['key-0', '2b642262'],
  ['key-1', '178732a2'],
  ['key-2', 'b5ea445e'],
  ['key-3', 'd6bd9d17'],
  ['key-4', '18aaf59c'],
  ['key-5', 'c97d6bbf'],
  ['key-6', 'd030cdc8'],
  ['key-7', 'f878f0ab'],
  ['key-8', '4962c634'],
  ['key-9', '394d9929'],
  ['key-10', '372badf2'],
  ['key-11', '18f8907e'],
  ['thock', '360e56e0'],
];

describe('the candidates', () => {
  it('play the owner’s pick: the bytes of the takes he heard', () => {
    expect(PICKED).toEqual({ thock: 'tactile', tone: 'tine' });
    expect(sounds.map((s): readonly [string, string] => [s.name, s.hash])).toEqual([...HEARD]);
  });

  it('each thock is deep, unpitched and short', () => {
    const faults = Object.entries(THOCKS).flatMap(([name, { recipe }]) => {
      const m = measure('thock', recipe);
      return [
        ...((m.centroid > 600 && [`${name}: centroid ${m.centroid.toFixed(0)} Hz`]) || []),
        ...((m.under500 < 0.5 && [`${name}: ${m.under500.toFixed(2)} under 500 Hz`]) || []),
        ...((m.chroma > 0.5 && [`${name}: pitched, ${m.chroma.toFixed(2)} at class ${m.pc}`]) ||
          []),
        ...((m.ms > 150 && [`${name}: ${m.ms} ms`]) || []),
      ];
    });
    expect(faults).toEqual([]);
  });

  it('each key tone is heard at its key, with no hiss, at every key', () => {
    const faults = Object.entries(TONES).flatMap(([name, { recipe }]) =>
      Array.from({ length: 12 }, (_, n) => {
        const m = measure(`key-${n}`, recipe(keyPitch(n)));
        return [
          ...(((m.pc !== n || m.chroma < 0.6) && [
            `${name} key-${n}: class ${m.pc} at ${m.chroma.toFixed(2)}`,
          ]) ||
            []),
          ...((m.over2500 > 0.005 && [`${name} key-${n}: ${m.over2500.toFixed(4)} over 2.5 kHz`]) ||
            []),
        ];
      }).flat(),
    );
    expect(faults).toEqual([]);
  });
});
