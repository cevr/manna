import type { LumaArea } from '../core/export-handle.ts';

export const showFailure = (e: unknown): void => {
  const shown = document.createElement('pre');
  shown.style.cssText = 'color:var(--state-findings);padding:24px;white-space:pre-wrap';
  shown.textContent = String(e instanceof Error ? (e.stack ?? e.message) : e);
  document.body.replaceChildren(shown);
};

export const bytesBase64 = (bytes: Uint8Array): string => bytes.toBase64();

export const canvasBase64 = async (
  canvas: HTMLCanvasElement,
  type: 'image/png' | 'image/jpeg',
): Promise<string> => {
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.95));
  if (blob === null) throw new Error('toBlob failed');
  return bytesBase64(new Uint8Array(await blob.arrayBuffer()));
};

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
