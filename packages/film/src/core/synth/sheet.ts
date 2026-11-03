import type { Pcm } from '../audio.ts';
import type { Raster } from '../raster.ts';
import { frameSpectrum } from './analyse.ts';
import { momentaryBlocks } from './loudness.ts';

type MarkKind = 'onset' | 'hit' | 'loop';

export interface Mark {
  readonly kind: MarkKind;
  readonly at: number;
}

const WIDTH = 1200;
const HEIGHT = 640;
const SPECTRUM = { top: 0, rows: 400 };
const WAVE = { top: 404, rows: 160 };
const LOUDNESS = { top: 568, rows: 72 };

const FRAME = 2048;
const HOP = 256;
const LOW_HZ = 30;
const HIGH_HZ = 16000;
const FLOOR_DB = -90;
const FULL_SCALE = (FRAME / 4) ** 2;
const LOUDNESS_FLOOR = -70;
const LOUDNESS_LINES = [-20, -40, -60];
const SECOND_ALPHA = 0.3;

type Rgb = readonly [number, number, number];

const PANEL: Rgb = [14, 14, 18];
const GAP: Rgb = [0, 0, 0];
const FAINT: Rgb = [52, 52, 62];
const WAVE_COLOUR: Rgb = [150, 196, 255];
const LOUDNESS_COLOUR: Rgb = [255, 206, 84];
const SECOND: Rgb = [255, 255, 255];
const MARK_COLOUR: Record<MarkKind, Rgb> = {
  onset: [84, 222, 120],
  hit: [255, 84, 84],
  loop: [84, 206, 255],
};
const HEAT: ReadonlyArray<Rgb> = [
  [0, 0, 4],
  [87, 16, 110],
  [188, 55, 84],
  [249, 142, 9],
  [252, 255, 164],
];

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

const heat = (t: number): Rgb => {
  const at = clamp(t, 0, 1) * (HEAT.length - 1);
  const i = Math.min(HEAT.length - 2, Math.floor(at));
  const f = at - i;
  const [a, b] = [HEAT[i] ?? HEAT[0], HEAT[i + 1] ?? HEAT[0]];
  const lerp = (k: 0 | 1 | 2) => Math.round((a?.[k] ?? 0) + ((b?.[k] ?? 0) - (a?.[k] ?? 0)) * f);
  return [lerp(0), lerp(1), lerp(2)];
};

interface Canvas {
  readonly rgba: Uint8Array;
  readonly put: (x: number, y: number, colour: Rgb) => void;
  readonly blend: (x: number, y: number, colour: Rgb, alpha: number) => void;
}

const canvas = (): Canvas => {
  const rgba = new Uint8Array(WIDTH * HEIGHT * 4);
  return {
    rgba,
    put: (x, y, [r, g, b]) => {
      const i = (y * WIDTH + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    },
    blend: (x, y, colour, alpha) => {
      const i = (y * WIDTH + x) * 4;
      for (let k = 0; k < 3; k++)
        rgba[i + k] = Math.round((rgba[i + k] ?? 0) * (1 - alpha) + (colour[k] ?? 0) * alpha);
    },
  };
};

const ground = (paint: Canvas): void => {
  for (let y = 0; y < HEIGHT; y++) {
    const inPanel = [SPECTRUM, WAVE, LOUDNESS].some(
      (panel) => y >= panel.top && y < panel.top + panel.rows,
    );
    for (let x = 0; x < WIDTH; x++) paint.put(x, y, inPanel ? PANEL : GAP);
  }
};

const rowBins = (rate: number): ReadonlyArray<{ readonly from: number; readonly to: number }> => {
  const bins = FRAME / 2;
  const hzAt = (share: number) => LOW_HZ * (HIGH_HZ / LOW_HZ) ** share;
  return Array.from({ length: SPECTRUM.rows }, (_, r) => {
    const from = Math.min(
      bins - 1,
      Math.round((hzAt((SPECTRUM.rows - r - 1) / SPECTRUM.rows) * FRAME) / rate),
    );
    const top = Math.round((hzAt((SPECTRUM.rows - r) / SPECTRUM.rows) * FRAME) / rate);
    return { from, to: Math.max(from + 1, Math.min(bins, top)) };
  });
};

const spectrogram = (paint: Canvas, pcm: Pcm): void => {
  const rows = rowBins(pcm.rate);
  const frames = new Map<number, Float64Array>();
  const frameAt = (k: number): Float64Array => {
    const had = frames.get(k);
    if (had !== undefined) return had;
    const power = new Float64Array(FRAME / 2);
    for (const plane of pcm.channels) {
      const one = frameSpectrum(plane.subarray(0, pcm.frames), k * HOP, FRAME);
      for (let b = 0; b < power.length; b++)
        power[b] = (power[b] ?? 0) + (one[b] ?? 0) / Math.max(1, pcm.channels.length);
    }
    frames.set(k, power);
    return power;
  };
  for (let x = 0; x < WIDTH; x++) {
    const middle = ((x + 0.5) / WIDTH) * pcm.frames;
    const power = frameAt(Math.round((middle - FRAME / 2) / HOP));
    for (const [r, { from, to }] of rows.entries()) {
      let loudest = 0;
      for (let b = from; b < to; b++) loudest = Math.max(loudest, power[b] ?? 0);
      const db = 10 * Math.log10(Math.max(loudest / FULL_SCALE, 1e-20));
      paint.put(x, SPECTRUM.top + r, heat((db - FLOOR_DB) / -FLOOR_DB));
    }
  }
};

const waveform = (paint: Canvas, pcm: Pcm): void => {
  const rowOf = (a: number) => WAVE.top + Math.round(((1 - clamp(a, -1, 1)) / 2) * (WAVE.rows - 1));
  for (let x = 0; x < WIDTH; x++) paint.put(x, rowOf(0), FAINT);
  if (pcm.frames === 0) return;
  for (let x = 0; x < WIDTH; x++) {
    const from = Math.min(pcm.frames - 1, Math.floor((x * pcm.frames) / WIDTH));
    const to = Math.max(from + 1, Math.min(pcm.frames, Math.floor(((x + 1) * pcm.frames) / WIDTH)));
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const plane of pcm.channels)
      for (let i = from; i < to; i++) {
        lo = Math.min(lo, plane[i] ?? 0);
        hi = Math.max(hi, plane[i] ?? 0);
      }
    if (lo > hi) continue;
    for (let y = rowOf(hi); y <= rowOf(lo); y++) paint.put(x, y, WAVE_COLOUR);
  }
};

const loudnessCurve = (paint: Canvas, pcm: Pcm): void => {
  const rowOf = (lufs: number) =>
    LOUDNESS.top + Math.round(clamp(lufs / LOUDNESS_FLOOR, 0, 1) * (LOUDNESS.rows - 1));
  for (const line of LOUDNESS_LINES)
    for (let x = 0; x < WIDTH; x++) paint.put(x, rowOf(line), FAINT);
  const blocks = momentaryBlocks(pcm);
  const first = blocks[0];
  if (first === undefined || pcm.frames === 0) return;
  const step = (blocks[1]?.from ?? 1) - first.from;
  const secs = pcm.frames / pcm.rate;
  let last = Number.NaN;
  for (let x = 0; x < WIDTH; x++) {
    const t = ((x + 0.5) / WIDTH) * secs;
    const k = clamp(Math.round((t - (first.from + first.to) / 2) / step), 0, blocks.length - 1);
    const lufs = blocks[k]?.lufs ?? Number.NEGATIVE_INFINITY;
    if (!Number.isFinite(lufs)) {
      last = Number.NaN;
      continue;
    }
    const row = rowOf(lufs);
    let [from, to] = [row, row];
    if (Number.isFinite(last)) [from, to] = [Math.min(row, last), Math.max(row, last)];
    for (let y = from; y <= to; y++) paint.put(x, y, LOUDNESS_COLOUR);
    last = row;
  }
};

const columnOf = (at: number, secs: number) => clamp(Math.floor((at / secs) * WIDTH), 0, WIDTH - 1);

const line = (paint: Canvas, x: number, colour: Rgb, alpha: number): void => {
  for (let y = 0; y < HEIGHT; y++) {
    if (alpha >= 1) paint.put(x, y, colour);
    else paint.blend(x, y, colour, alpha);
  }
};

export const sheetOf = (pcm: Pcm, marks: ReadonlyArray<Mark>): Raster => {
  const paint = canvas();
  ground(paint);
  spectrogram(paint, pcm);
  waveform(paint, pcm);
  loudnessCurve(paint, pcm);
  const secs = pcm.frames / pcm.rate;
  if (secs > 0) {
    for (let s = 1; s < secs; s++) line(paint, columnOf(s, secs), SECOND, SECOND_ALPHA);
    for (const mark of marks) line(paint, columnOf(mark.at, secs), MARK_COLOUR[mark.kind], 1);
  }
  return { width: WIDTH, height: HEIGHT, rgba: paint.rgba };
};
