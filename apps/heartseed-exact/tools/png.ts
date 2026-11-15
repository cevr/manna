/* oxlint-disable effect/noNodeBuiltinImport, effect/noNewError, effect/noThrowStatement, effect/noNullish -- Exact's app folder cannot import effect (docs/exact.md): a host helper the drives read a screenshot's pixels through; a byte past an array's end is undefined, and a file it cannot read is a broken drive, said by a throw. */

/**
 * The colour of one pixel of a PNG the agent wrote: an 8-bit RGB or RGBA
 * image, not interlaced, as Exact's screenshots are. The drives read the
 * ground a host painted where its `layout` reports the authored value
 * alone (iOS reports `light-dark(…)`, not the colour drawn).
 */

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/** The bytes per pixel of each colour type read: RGB (2) and RGBA (6). */
const CHANNELS = new Map([
  [2, 3],
  [6, 4],
]);

/** Paeth's predictor, PNG's filter 4. */
const paeth = (left: number, up: number, upLeft: number) => {
  const p = left + up - upLeft;
  const [dl, du, dul] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
  if (dl <= du && dl <= dul) return left;
  if (du <= dul) return up;
  return upLeft;
};

/** A decoded image: its width, height, bytes per pixel and unfiltered rows. */
interface Image {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly rows: Uint8Array;
}

/** The image's compressed data: every IDAT chunk's, in order. */
const dataOf = (file: Buffer) => {
  const parts: Buffer[] = [];
  for (let at = 8; at < file.length;) {
    const length = file.readUInt32BE(at);
    if (file.toString('latin1', at + 4, at + 8) === 'IDAT')
      parts.push(file.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  return inflateSync(Buffer.concat(parts));
};

/** The byte at `index` of `bytes` when `present`, else 0, as PNG's filters read a byte outside the image. */
const byteAt = (bytes: Uint8Array, index: number, present: boolean) => {
  if (!present) return 0;
  return bytes[index] ?? 0;
};

/** Undoes row `y`'s filter into `rows`, from the packed data and the row above. */
const unfilter = (
  packed: Uint8Array,
  rows: Uint8Array,
  y: number,
  stride: number,
  channels: number,
) => {
  const filter = packed[y * (stride + 1)] ?? 0;
  for (let x = 0; x < stride; x++) {
    const raw = packed[y * (stride + 1) + 1 + x] ?? 0;
    const left = byteAt(rows, y * stride + x - channels, x >= channels);
    const up = byteAt(rows, (y - 1) * stride + x, y > 0);
    const upLeft = byteAt(rows, (y - 1) * stride + x - channels, x >= channels && y > 0);
    const predicted = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter] ?? 0;
    rows[y * stride + x] = (raw + predicted) & 0xff;
  }
};

/** Decodes a PNG file's pixels. */
export const readPng = (path: string): Image => {
  const file = readFileSync(path);
  const width = file.readUInt32BE(16);
  const height = file.readUInt32BE(20);
  const [depth, kind, interlace] = [file[24], file[25] ?? 0, file[28]];
  const channels = CHANNELS.get(kind);
  if (depth !== 8 || interlace !== 0 || channels === undefined)
    throw new Error(
      `${path}: an 8-bit RGB(A) PNG, not interlaced, is read; depth ${depth}, colour type ${kind}`,
    );
  const packed = dataOf(file);
  const stride = width * channels;
  const rows = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) unfilter(packed, rows, y, stride, channels);
  return { width, height, channels, rows };
};

/** The pixel at `x`, `y` as `rgb(r, g, b)`, as the drivers write a computed colour. */
export const pixelAt = (image: Image, x: number, y: number): string => {
  const at = (Math.round(y) * image.width + Math.round(x)) * image.channels;
  const [r, g, b] = [image.rows[at], image.rows[at + 1], image.rows[at + 2]];
  return `rgb(${r}, ${g}, ${b})`;
};
