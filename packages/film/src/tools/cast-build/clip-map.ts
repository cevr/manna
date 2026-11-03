import { Option } from 'effect';
import type { Raster } from '../../core/raster.ts';
import { figureOf } from './chain-steps.ts';
import type { ClipFigure } from './clips.ts';

export const MAP_IOU = 0.97;

export interface ClipMap {
  readonly x0: number;
  readonly y0: number;
  readonly scale: number;
}

export interface FigureMask {
  readonly width: number;
  readonly height: number;
  readonly mask: Uint8Array;
}

const BORDER = 4;

const roundHalfEven = (x: number) => {
  const f = Math.floor(x);
  const d = x - f;
  if (d === 0.5) return f % 2 === 0 ? f : f + 1;
  return d < 0.5 ? f : f + 1;
};

export const borderPaperOf = (frame: Raster): readonly [number, number, number] => {
  const { width: w, height: h, rgba } = frame;
  const counts = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let n = 0;
  const take = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) counts[c]![rgba[i + c]!]!++;
    n++;
  };
  const rows = Math.min(BORDER, h);
  const cols = Math.min(BORDER, w);
  for (let y = 0; y < rows; y++) for (let x = 0; x < w; x++) take(x, y);
  for (let y = h - rows; y < h; y++) for (let x = 0; x < w; x++) take(x, y);
  for (let y = 0; y < h; y++) for (let x = 0; x < cols; x++) take(x, y);
  for (let y = 0; y < h; y++) for (let x = w - cols; x < w; x++) take(x, y);
  const nth = (c: number, k: number) => {
    let seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += counts[c]![v]!;
      if (seen > k) return v;
    }
    return 255;
  };
  const median = (c: number) =>
    n % 2 === 1 ? nth(c, (n - 1) / 2) : (nth(c, n / 2 - 1) + nth(c, n / 2)) / 2;
  return [median(0), median(1), median(2)];
};

const tapsOf = (origin: number, scale: number, c: number) => {
  const a = origin + c * scale;
  const b = origin + (c + 1) * scale;
  const taps: Array<readonly [number, number]> = [];
  for (let k = Math.floor(a); k < Math.ceil(b); k++) {
    const weight = Math.min(b, k + 1) - Math.max(a, k);
    if (weight > 0) taps.push([k, weight]);
  }
  return taps;
};

const acrossOf = (
  frame: Raster,
  paper: readonly [number, number, number],
  cols: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  top: number,
  bottom: number,
) => {
  const { width: vw, height: vh, rgba } = frame;
  const w = cols.length;
  const across = new Float64Array((bottom - top) * w * 3);
  for (let y = top; y < bottom; y++) {
    const inside = y >= 0 && y < vh;
    const at = (y - top) * w * 3;
    for (let cx = 0; cx < w; cx++)
      for (const [x, weight] of cols[cx]!) {
        const video = inside && x >= 0 && x < vw ? (y * vw + x) * 4 : -1;
        for (let c = 0; c < 3; c++)
          across[at + cx * 3 + c]! += weight * (video < 0 ? paper[c]! : rgba[video + c]!);
      }
  }
  return across;
};

export const canvasOf = (frame: Raster, map: ClipMap, size: readonly [number, number]): Raster => {
  const [w, h] = size;
  const cols = Array.from({ length: w }, (_, cx) => tapsOf(map.x0, map.scale, cx));
  const rows = Array.from({ length: h }, (_, cy) => tapsOf(map.y0, map.scale, cy));
  const top = Math.floor(map.y0);
  const across = acrossOf(
    frame,
    borderPaperOf(frame),
    cols,
    top,
    Math.ceil(map.y0 + h * map.scale),
  );
  const out = new Uint8Array(w * h * 4);
  const area = map.scale * map.scale;
  for (let cy = 0; cy < h; cy++)
    for (let cx = 0; cx < w; cx++) {
      const i = (cy * w + cx) * 4;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (const [y, weight] of rows[cy]!)
          sum += weight * across[(y - top) * w * 3 + cx * 3 + c]!;
        out[i + c] = Math.max(0, Math.min(255, roundHalfEven(sum / area)));
      }
      out[i + 3] = 255;
    }
  return { width: w, height: h, rgba: out };
};

const maskOf = (frame: Raster | FigureMask): FigureMask =>
  'mask' in frame ? frame : { width: frame.width, height: frame.height, mask: figureOf(frame) };

const boxOf = (f: FigureMask) => {
  let l = f.width;
  let t = f.height;
  let r = 0;
  let b = 0;
  for (let y = 0; y < f.height; y++)
    for (let x = 0; x < f.width; x++)
      if (f.mask[y * f.width + x] === 1) {
        l = Math.min(l, x);
        t = Math.min(t, y);
        r = Math.max(r, x + 1);
        b = Math.max(b, y + 1);
      }
  return r > l ? Option.some([l, t, r, b] as const) : Option.none();
};

const maskIou = (a: FigureMask, b: FigureMask) => {
  let i = 0;
  let u = 0;
  for (let k = 0; k < a.mask.length; k++) {
    const p = a.mask[k] === 1;
    const q = b.mask[k] === 1;
    if (p && q) i++;
    if (p || q) u++;
  }
  return u ? i / u : 1;
};

const round = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places;

export const registerClip = (
  first: Raster,
  frame0: Raster,
): Option.Option<{ readonly map: ClipMap; readonly iou: number }> => {
  const canvas = maskOf(first);
  return Option.flatMap(Option.all([boxOf(canvas), boxOf(maskOf(frame0))]), ([c, v]) => {
    const scale = round((v[3] - v[1]) / (c[3] - c[1]), 4);
    const map = {
      x0: round((v[0] + v[2]) / 2 - (scale * (c[0] + c[2])) / 2, 2),
      y0: round((v[1] + v[3]) / 2 - (scale * (c[1] + c[3])) / 2, 2),
      scale,
    };
    const mapped = maskOf(canvasOf(frame0, map, [first.width, first.height]));
    return Option.some({ map, iou: maskIou(mapped, canvas) });
  });
};

export const figureNumbersOf = (frames: ReadonlyArray<Raster | FigureMask>): ClipFigure => {
  const masks = frames.map(maskOf);
  const none: readonly [number, number, number, number] = [0, 0, 0, 0];
  const boxes = masks.map((m) => Option.getOrElse(boxOf(m), () => none));
  const [, t0 = 0, , b0 = 0] = boxes[0] ?? [];
  const h0 = b0 - t0;
  const first = masks[0];
  const last = masks[masks.length - 1];
  return {
    heightRatio: boxes.map(([, t, , b]) => (h0 > 0 ? (b - t) / h0 : 0)),
    feetPx: boxes.map(([, , , b]) => b - b0),
    iouFirst: masks.map((m) => (first ? maskIou(m, first) : 1)),
    iouLast: masks.map((m) => (last ? maskIou(m, last) : 1)),
  };
};
