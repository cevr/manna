/* oxlint-disable effect/noTernary -- Exact's data module cannot import effect (docs/exact.md): base64's padding branches plainly. */

/**
 * A frame as it crosses from the app's module to the data module: its
 * 2048 Float32 samples, little-endian as the device writes them, in
 * base64, the one form a module's JSON answer carries bytes in. `samplesOf`
 * reads it back by table, since the data module's engine need not have
 * `atob`; `base64Of` writes it, for the tests and the web's stand-in.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Each character's six bits, by its char code; 255 for a character not in the alphabet. */
const SIXES = ((): Uint8Array => {
  const table = new Uint8Array(128).fill(255);
  for (let at = 0; at < ALPHABET.length; at += 1) table[ALPHABET.charCodeAt(at)] = at;
  return table;
})();

/** The bytes `text` holds in base64, padding read; a stray character reads as zero bits. */
export const bytesOf = (text: string): Uint8Array => {
  const pad = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const length = (text.length / 4) * 3 - pad;
  const out = new Uint8Array(Math.max(0, length));
  let at = 0;
  for (let i = 0; i + 3 < text.length; i += 4) {
    const word =
      ((SIXES[text.charCodeAt(i)] ?? 0) << 18) |
      ((SIXES[text.charCodeAt(i + 1)] ?? 0) << 12) |
      (((SIXES[text.charCodeAt(i + 2)] ?? 0) & 63) << 6) |
      ((SIXES[text.charCodeAt(i + 3)] ?? 0) & 63);
    if (at < length) out[at++] = (word >> 16) & 255;
    if (at < length) out[at++] = (word >> 8) & 255;
    if (at < length) out[at++] = word & 255;
  }
  return out;
};

/** The samples a frame's base64 holds: little-endian Float32, as Apple's hardware writes them. */
export const samplesOf = (text: string): Float32Array => {
  const bytes = bytesOf(text);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = new Float32Array(bytes.byteLength >> 2);
  for (let k = 0; k < samples.length; k += 1) samples[k] = view.getFloat32(k * 4, true);
  return samples;
};

/** `samples` as a frame's base64. */
export const base64Of = (samples: Float32Array): string => {
  const bytes = new Uint8Array(samples.length * 4);
  const view = new DataView(bytes.buffer);
  for (let k = 0; k < samples.length; k += 1) view.setFloat32(k * 4, samples[k] ?? 0, true);
  let text = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const word = (a << 16) | (b << 8) | c;
    text += ALPHABET[(word >> 18) & 63] ?? '';
    text += ALPHABET[(word >> 12) & 63] ?? '';
    text += i + 1 < bytes.length ? (ALPHABET[(word >> 6) & 63] ?? '') : '=';
    text += i + 2 < bytes.length ? (ALPHABET[word & 63] ?? '') : '=';
  }
  return text;
};
