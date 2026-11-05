/**
 * The growth sound, made in code: two soft sine tones a fifth apart (G5,
 * then D6 a little after), each easing in over 6 ms and dying away, the
 * whole closed over its last 30 ms, 0.7 s long at a peak of 0.32 of full
 * scale. It is rendered once to a 16-bit mono WAV at 24 kHz; its bytes are
 * the same on every run, and their hash names the file the native side
 * writes, so a changed sound is a new file.
 */

const RATE = 24_000;
const SECONDS = 0.7;
const LEVEL = 0.32;
const ATTACK_SECONDS = 0.006;
const CLOSE_SECONDS = 0.03;

/** Each tone: its pitch in hertz, when it starts and how fast it dies away, in seconds. */
const TONES = [
  { hz: 783.99, at: 0, decay: 0.22 },
  { hz: 1174.66, at: 0.09, decay: 0.26 },
] as const;

/** One tone's sample at `t` seconds after it starts. */
const toneAt = (tone: (typeof TONES)[number], t: number) =>
  Math.sin(2 * Math.PI * tone.hz * t) * Math.min(1, t / ATTACK_SECONDS) * Math.exp(-t / tone.decay);

/** The close's gain at sample `index`: 1 until the last 30 ms, then down to 0 at the last sample. */
const closeAt = (index: number, length: number) => {
  const close = Math.round(CLOSE_SECONDS * RATE);
  const left = length - 1 - index;
  return Math.min(1, left / close);
};

/** The samples, in [-1, 1], peaking at `LEVEL`. */
const render = (): readonly number[] => {
  const length = Math.round(RATE * SECONDS);
  const raw = Array.from({ length }, (_, index) => {
    const tones = TONES.reduce((sum, tone) => {
      const t = index / RATE - tone.at;
      if (t < 0) return sum;
      return sum + toneAt(tone, t);
    }, 0);
    return tones * closeAt(index, length);
  });
  const peak = raw.reduce((most, x) => Math.max(most, Math.abs(x)), 0);
  return raw.map((x) => (x / peak) * LEVEL);
};

/** A 16-bit mono PCM WAV of `samples` at `RATE`. */
const wavOf = (samples: readonly number[]): Uint8Array => {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, word: string) =>
    [...word].forEach((letter, index) => view.setUint8(at + index, letter.charCodeAt(0)));
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
  samples.forEach((x, index) =>
    view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, x)) * 32767), true),
  );
  return bytes;
};

/** The 32-bit FNV-1a hash of `bytes`, as 8 hex digits. */
const hashOf = (bytes: Uint8Array) =>
  bytes
    .reduce((hash, byte) => Math.imul(hash ^ byte, 0x01000193) >>> 0, 0x811c9dc5)
    .toString(16)
    .padStart(8, '0');

const wav = wavOf(render());

/** The growth sound: its name, the hash of its bytes, and the WAV itself. */
export const growthSound = { name: 'grow', hash: hashOf(wav), wav } as const;
