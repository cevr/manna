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

/**
 * The mean colour of each cell of `area`'s grid on `ctx`'s canvas, row by
 * row, three values (red, green, blue, 0–255) a cell: every pixel of the
 * area summed into its cell, so nothing between samples is lost (a resize
 * would skip pixels), and no channel folded into another (a hue that moves
 * at one luma still moves).
 */
export const canvasColours = (
  ctx: CanvasRenderingContext2D,
  area: LumaArea,
): ReadonlyArray<number> => {
  const x0 = Math.round(area.x);
  const y0 = Math.round(area.y);
  const w = Math.max(1, Math.round(area.w));
  const h = Math.max(1, Math.round(area.h));
  const d = ctx.getImageData(x0, y0, w, h).data;
  const sums = new Float64Array(area.cols * area.rows * 3);
  const counts = new Float64Array(area.cols * area.rows);
  for (let y = 0; y < h; y++) {
    const row = Math.min(area.rows - 1, Math.floor((y * area.rows) / h));
    for (let x = 0; x < w; x++) {
      const cell = row * area.cols + Math.min(area.cols - 1, Math.floor((x * area.cols) / w));
      const p = (y * w + x) * 4;
      sums[cell * 3] = (sums[cell * 3] ?? 0) + (d[p] ?? 0);
      sums[cell * 3 + 1] = (sums[cell * 3 + 1] ?? 0) + (d[p + 1] ?? 0);
      sums[cell * 3 + 2] = (sums[cell * 3 + 2] ?? 0) + (d[p + 2] ?? 0);
      counts[cell] = (counts[cell] ?? 0) + 1;
    }
  }
  return Array.from(sums, (s, k) => s / Math.max(1, counts[Math.floor(k / 3)] ?? 1));
};
