/**
 * The growth sound as the native side receives it: a 16-bit mono PCM WAV
 * whose header agrees with its data, soft (a peak above 0.05 and at most
 * 0.8 of full scale) and short (0.15 to 1.5 s), starting and ending in
 * silence so it never clicks, and named by the FNV-1a hash of its bytes, so
 * a changed sound is written to a new file rather than played from an old
 * one. It reads the bytes and plays nothing.
 */

import { describe, expect, it } from 'bun:test';

import { growthSound } from './sound';

const view = new DataView(
  growthSound.wav.buffer,
  growthSound.wav.byteOffset,
  growthSound.wav.byteLength,
);

const word = (at: number) => String.fromCharCode(...growthSound.wav.slice(at, at + 4));

const rate = view.getUint32(24, true);

const samples = Array.from(
  { length: view.getUint32(40, true) / 2 },
  (_, index) => view.getInt16(44 + index * 2, true) / 32768,
);

const loudest = (part: readonly number[]) =>
  part.reduce((most, x) => Math.max(most, Math.abs(x)), 0);

describe('the growth sound', () => {
  it('is a 16-bit mono PCM WAV whose header agrees with its data', () => {
    expect([word(0), word(8), word(12), word(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(view.getUint32(4, true)).toBe(growthSound.wav.byteLength - 8);
    expect([view.getUint16(20, true), view.getUint16(22, true), view.getUint16(34, true)]).toEqual([
      1, 1, 16,
    ]);
    expect(view.getUint32(28, true)).toBe(rate * 2);
    expect(view.getUint32(40, true)).toBe(growthSound.wav.byteLength - 44);
  });

  it('is short and soft, starting and ending in silence', () => {
    expect(samples.length / rate).toBeGreaterThanOrEqual(0.15);
    expect(samples.length / rate).toBeLessThanOrEqual(1.5);
    expect(loudest(samples)).toBeGreaterThan(0.05);
    expect(loudest(samples)).toBeLessThanOrEqual(0.8);
    expect(loudest(samples.slice(0, Math.round(rate / 4000)))).toBeLessThanOrEqual(0.02);
    expect(loudest(samples.slice(-Math.round(rate / 1000)))).toBeLessThanOrEqual(0.01);
  });

  it('is named by the FNV-1a hash of its bytes', () => {
    let hash = 0x811c9dc5;
    for (const byte of growthSound.wav) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
    expect(growthSound.name).toBe('grow');
    expect(growthSound.hash).toBe(hash.toString(16).padStart(8, '0'));
  });
});
