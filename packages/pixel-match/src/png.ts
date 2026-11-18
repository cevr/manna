/* oxlint-disable effect/noNodeBuiltinImport, effect/noThrowStatement, effect/noNewError, effect/noNullish, effect/noTernary -- a host tool's PNG codec over node's zlib (spec: no new dependency): byte arithmetic, where a byte past an array's end is undefined; a file that is no 8-bit RGB(A) PNG is a broken capture, said by a throw. */

/**
 * The pictures the harness reads and writes: 8-bit RGB or RGBA PNGs, not
 * interlaced, as `simctl io screenshot` and Chromium write them. A decoded
 * picture is always RGBA, so two captures compare byte for byte whatever
 * their source wrote; the writer writes RGBA with no filter, for the diff
 * pictures alone.
 */

import { deflateSync, inflateSync } from 'node:zlib';

/** A decoded picture: its size and its pixels as RGBA, row by row. */
export interface Picture {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

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

/** The predicted byte of PNG's filter `filter` from its three neighbours. */
const predict = (filter: number, left: number, up: number, upLeft: number) => {
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return (left + up) >> 1;
  if (filter === 4) return paeth(left, up, upLeft);
  return 0;
};

/** Every chunk of a PNG file: its type and body. */
const chunksOf = (file: Uint8Array) => {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const chunks: Array<{ readonly type: string; readonly body: Uint8Array }> = [];
  for (let at = 8; at + 8 <= file.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...file.subarray(at + 4, at + 8));
    chunks.push({ type, body: file.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
  }
  return chunks;
};

/** Every byte array of `parts` end to end. */
const joined = (parts: ReadonlyArray<Uint8Array>) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  parts.reduce((at, part) => {
    out.set(part, at);
    return at + part.length;
  }, 0);
  return out;
};

/** The byte at `index` of `bytes` when `present`, else 0, as PNG's filters read a byte outside the image. */
const byteAt = (bytes: Uint8Array, index: number, present: boolean) => {
  if (!present) return 0;
  return bytes[index] ?? 0;
};

/** The image's rows with each row's filter undone. */
const unfiltered = (packed: Uint8Array, height: number, stride: number, channels: number) => {
  const rows = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = packed[y * (stride + 1)] ?? 0;
    for (let x = 0; x < stride; x++) {
      const raw = packed[y * (stride + 1) + 1 + x] ?? 0;
      const left = byteAt(rows, y * stride + x - channels, x >= channels);
      const up = byteAt(rows, (y - 1) * stride + x, y > 0);
      const upLeft = byteAt(rows, (y - 1) * stride + x - channels, x >= channels && y > 0);
      rows[y * stride + x] = (raw + predict(filter, left, up, upLeft)) & 0xff;
    }
  }
  return rows;
};

/** The header's size and bytes per pixel; throws, naming `name`, on anything but an 8-bit RGB(A) PNG, not interlaced. */
const headerOf = (body: Uint8Array, name: string) => {
  const head = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const [depth, kind, interlace] = [body[8], body[9] ?? 0, body[12]];
  const channels = CHANNELS.get(kind);
  if (depth !== 8 || interlace !== 0 || channels === undefined)
    throw new Error(`${name}: depth ${depth}, colour type ${kind}: an 8-bit RGB(A) PNG is read`);
  return { width: head.getUint32(0), height: head.getUint32(4), channels };
};

/** Decodes a PNG's bytes to RGBA; throws, naming `name`, on anything but an 8-bit RGB(A) PNG, not interlaced. */
export const decodePng = (file: Uint8Array, name = 'picture'): Picture => {
  if (!SIGNATURE.every((byte, i) => file[i] === byte)) throw new Error(`${name}: not a PNG`);
  const chunks = chunksOf(file);
  const header = chunks.find((chunk) => chunk.type === 'IHDR');
  if (header === undefined) throw new Error(`${name}: no IHDR`);
  const { width, height, channels } = headerOf(header.body, name);
  const data = chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.body);
  const rows = unfiltered(inflateSync(joined(data)), height, width * channels, channels);
  if (channels === 4) return { width, height, rgba: rows };
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = rows[i * 3] ?? 0;
    rgba[i * 4 + 1] = rows[i * 3 + 1] ?? 0;
    rgba[i * 4 + 2] = rows[i * 3 + 2] ?? 0;
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, rgba };
};

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (bytes: Uint8Array) => {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** One chunk's bytes: length, type, body and CRC. */
const chunk = (type: string, body: Uint8Array) => {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  out.set(
    Uint8Array.from(type, (char) => char.charCodeAt(0)),
    4,
  );
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
};

/** A picture as PNG bytes: RGBA, 8-bit, every row unfiltered. */
export const encodePng = (picture: Picture): Uint8Array => {
  const { width, height, rgba } = picture;
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const stride = width * 4;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++)
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const parts = [
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array()),
  ];
  return joined(parts);
};
