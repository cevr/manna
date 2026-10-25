/**
 * The voice's 31 sounds, each rendered once: a valid WAV (RIFF, PCM 16-bit
 * mono at the voice's rate), no longer than 0.4 s, peaking above 0.05 and
 * at most full scale, silent (under -60 dB) in its last millisecond, and
 * the same bytes when rendered again. Each key's bell rings at its key's
 * pitch, within 1 %, by a Goertzel scan of the bell's range.
 */

import { describe, expect, it } from 'bun:test';

import { RATE, RECIPES, voiced } from './voice';

const NAMES: ReadonlyArray<string> = [
  ...Array.from({ length: 12 }, (_, n) => `key-${n}`),
  'wood',
  'thud',
  'switch-on',
  'switch-off',
  'press',
  'chime-up',
  'chime-down',
  'land',
  ...Array.from({ length: 10 }, (_, n) => `section-${n}`),
  'tick',
];

const sounds = RECIPES.map(([name, clicks]) => voiced(name, clicks));

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

describe('the voice', () => {
  it('holds the 31 sounds of the table, by name', () => {
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

  it('keeps each sound short, audible, unclipped, and silent at its end', () => {
    for (const { name, wav } of sounds) {
      const samples = samplesOf(wav);
      const peak = Math.max(...samples.map(Math.abs));
      const last = samples.slice(-Math.round(RATE / 1000)).map(Math.abs);
      expect({
        name,
        short: samples.length / RATE <= 0.4,
        loud: peak > 0.05,
        unclipped: peak <= 1,
        quiet: Math.max(...last) < 0.001,
      }).toEqual({
        name,
        short: true,
        loud: true,
        unclipped: true,
        quiet: true,
      });
    }
  });

  it('renders the same bytes again, and names them by the same hash', () => {
    for (const [name, clicks] of RECIPES) {
      const again = voiced(name, clicks);
      const first = sounds.find((sound) => sound.name === name);
      expect(Buffer.from(again.wav).equals(Buffer.from(first?.wav ?? []))).toBe(true);
      expect(again.hash).toBe(first?.hash ?? '');
    }
    expect(new Set(sounds.map((sound) => sound.hash)).size).toBe(sounds.length);
  });

  it('rings each key at its own pitch, within 1 %', () => {
    for (let n = 0; n < 12; n += 1) {
      const wav = sounds[n]?.wav ?? new Uint8Array();
      const pitch = 523.25 * 2 ** (n / 12);
      const heard = strongest(samplesOf(wav), 400, 1100);
      expect({ n, near: Math.abs(heard - pitch) / pitch <= 0.01 }).toEqual({ n, near: true });
    }
  });
});
