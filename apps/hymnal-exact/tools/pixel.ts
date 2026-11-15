/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noTernary, effect/noNullish, effect/noAsyncFunction -- a host script's reader of the screenshots a drive takes: Bun's file and node's zlib, no package. */

/**
 * One pixel of a screenshot the agent wrote: a PNG of 8-bit RGB or RGBA,
 * not interlaced, as Chrome and the simulator write them. `at` is a share of
 * the width and of the height (0 to 1), so a point names the same place at
 * any scale. Its red, green and blue, 0 to 255.
 */

import { inflateSync } from 'node:zlib';

const paeth = (left: number, up: number, corner: number) => {
  const p = left + up - corner;
  const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - corner)];
  if (pa <= pb && pa <= pc) return left;
  return pb <= pc ? up : corner;
};

/** Each row of the image, unfiltered, `stride` bytes long. */
const rowsOf = (data: Uint8Array, height: number, stride: number, step: number) => {
  const rows: Array<Uint8Array> = [];
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = data[start] ?? 0;
    const row = data.slice(start + 1, start + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const left = x >= step ? (row[x - step] ?? 0) : 0;
      const up = previous[x] ?? 0;
      const corner = x >= step ? (previous[x - step] ?? 0) : 0;
      const add = [0, left, up, (left + up) >> 1, paeth(left, up, corner)][filter] ?? 0;
      row[x] = ((row[x] ?? 0) + add) & 0xff;
    }
    rows.push(row);
    previous = row;
  }
  return rows;
};

export const pixelAt = async (
  path: string,
  at: { readonly x: number; readonly y: number },
): Promise<ReadonlyArray<number>> => {
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  const view = new DataView(bytes.buffer);
  const chunks: Array<Uint8Array> = [];
  let [width, height, step] = [0, 0, 4];
  for (let offset = 8; offset < bytes.length;) {
    const length = view.getUint32(offset);
    const type = new TextDecoder().decode(bytes.slice(offset + 4, offset + 8));
    const body = bytes.slice(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      step = body[9] === 2 ? 3 : 4;
    }
    if (type === 'IDAT') chunks.push(body);
    offset += 12 + length;
  }
  const joined = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  chunks.reduce((offset, chunk) => {
    joined.set(chunk, offset);
    return offset + chunk.length;
  }, 0);
  const rows = rowsOf(inflateSync(joined), height, width * step, step);
  const x = Math.min(width - 1, Math.round(at.x * (width - 1)));
  const row = rows[Math.min(height - 1, Math.round(at.y * (height - 1)))] ?? new Uint8Array();
  return [row[x * step] ?? -1, row[x * step + 1] ?? -1, row[x * step + 2] ?? -1];
};
