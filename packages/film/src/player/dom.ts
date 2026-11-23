import type { LumaArea } from '../core/export-handle.ts';

/**
 * A page that could not start: the error, in place of the page, as text (an
 * error's words may hold markup, a film's name from the URL among them). The
 * render page says it here (`render.ts`); a studio page says it only as it
 * ends (`PageEnd.fail`, lab/page-client.tsx), so nothing of it runs on
 * behind the words.
 */
export const showFailure = (e: unknown): void => {
  const shown = document.createElement('pre');
  shown.style.cssText = 'color:var(--state-findings);padding:24px;white-space:pre-wrap';
  shown.textContent = String(e instanceof Error ? (e.stack ?? e.message) : e);
  document.body.replaceChildren(shown);
};

/** Bytes as base64: what the export handle hands back across `page.evaluate`. */
export const bytesBase64 = (bytes: Uint8Array): string => bytes.toBase64();

/** A canvas as base64 PNG or JPEG (JPEG at quality 0.95; PNG is lossless). */
export const canvasBase64 = async (
  canvas: HTMLCanvasElement,
  type: 'image/png' | 'image/jpeg',
): Promise<string> => {
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.95));
  if (blob === null) throw new Error('toBlob failed');
  return bytesBase64(new Uint8Array(await blob.arrayBuffer()));
};

/**
 * The luma (Rec. 709, 0–255) of `area` of `canvas`, scaled down to its grid
 * by the browser's own resize, row by row. No 2D context to read it back on:
 * an empty read, which the tools refuse as a failed frame.
 */
export const canvasLuma = async (
  canvas: HTMLCanvasElement,
  area: LumaArea,
): Promise<ReadonlyArray<number>> => {
  const bitmap = await createImageBitmap(canvas, area.x, area.y, area.w, area.h, {
    resizeWidth: area.cols,
    resizeHeight: area.rows,
    resizeQuality: 'medium',
  });
  const ctx = new OffscreenCanvas(area.cols, area.rows).getContext('2d');
  if (ctx === null) return [];
  ctx.drawImage(bitmap, 0, 0);
  const d = ctx.getImageData(0, 0, area.cols, area.rows).data;
  const out: number[] = [];
  for (let i = 0; i < d.length; i += 4)
    out.push(0.2126 * (d[i] ?? 0) + 0.7152 * (d[i + 1] ?? 0) + 0.0722 * (d[i + 2] ?? 0));
  return out;
};

/** `area`'s whole pixels: its origin and size rounded to the canvas's own. */
const areaPixels = (area: LumaArea) => ({
  x: Math.round(area.x),
  y: Math.round(area.y),
  w: Math.max(1, Math.round(area.w)),
  h: Math.max(1, Math.round(area.h)),
});

/** The RGBA pixels of `area` of `ctx`'s canvas, row by row, as `cellDrift` compares them. */
export const canvasPixels = (ctx: CanvasRenderingContext2D, area: LumaArea): Uint8ClampedArray => {
  const { x, y, w, h } = areaPixels(area);
  return ctx.getImageData(x, y, w, h).data;
};

/**
 * How each cell of `area`'s grid changed from `before` to `after` (both
 * `canvasPixels` of `area`), row by row, two values a cell: how many of its
 * pixels changed by more than `floor` in some channel, and the largest
 * change of one channel of one of its pixels (0–255). Pixels are compared
 * before anything is pooled, so a move inside a cell cannot cancel itself in
 * a mean; each changed pixel counts whatever its size, so a broad soft pan
 * counts as much as a sharp one; and no channel is folded into another (a
 * hue that moves at one luma still moves).
 */
export const cellDrift = (
  before: ArrayLike<number>,
  after: ArrayLike<number>,
  area: LumaArea,
  floor: number,
): ReadonlyArray<number> => {
  const { w, h } = areaPixels(area);
  const out = new Array<number>(2 * area.cols * area.rows).fill(0);
  for (let y = 0; y < h; y++) {
    const row = Math.min(area.rows - 1, Math.floor((y * area.rows) / h));
    for (let x = 0; x < w; x++) {
      const cell = row * area.cols + Math.min(area.cols - 1, Math.floor((x * area.cols) / w));
      const p = (y * w + x) * 4;
      const d = Math.max(
        Math.abs((after[p] ?? 0) - (before[p] ?? 0)),
        Math.abs((after[p + 1] ?? 0) - (before[p + 1] ?? 0)),
        Math.abs((after[p + 2] ?? 0) - (before[p + 2] ?? 0)),
      );
      if (d > floor) out[2 * cell] = (out[2 * cell] ?? 0) + 1;
      if (d > (out[2 * cell + 1] ?? 0)) out[2 * cell + 1] = d;
    }
  }
  return out;
};
