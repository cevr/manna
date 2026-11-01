import { describe, expect, test } from 'bun:test';
import type { Raster } from '../../core/raster.ts';
import {
  type ClipRead,
  type Correction,
  type Run,
  bandsOf,
  carried,
  cutOf,
  figureOf,
  gate,
  iouOf,
  keysOf,
  oneEuro,
} from './chain.ts';

const frame = (probs: Record<string, number>) => ({ id: 'f', joints: {}, probs, worlds: {} });

describe('cutOf', () => {
  const read: ClipRead = {
    classes: ['other/a', 'm/front', 'm/single'],
    frames: [
      frame({ 'other/a': 0.9, 'm/front': 0.06, 'm/single': 0.04 }),
      frame({ 'other/a': 0.1, 'm/front': 0.45, 'm/single': 0.45 }),
      frame({ 'm/front': 0.2, 'm/single': 0.8 }),
      frame({ 'm/front': 0.1, 'm/single': 0.9 }),
    ],
  };

  test("names the member's own most likely drawing, never another member's", () => {
    expect(cutOf(read, 'm').named.map((n) => n.drawing)).toEqual([
      'm/front',
      'm/front',
      'm/single',
      'm/single',
    ]);
  });

  test('a tie goes to the first drawing in class order, and runs are [from, to)', () => {
    expect(cutOf(read, 'm').runs).toEqual([
      { from: 0, to: 2, drawing: 'm/front' },
      { from: 2, to: 4, drawing: 'm/single' },
    ]);
  });
});

describe('gate', () => {
  test('a low-confidence angle holds the last confident one; before any, the read stands', () => {
    expect(gate([5, 10, 20, 30, 40], [0, 0.5, 0.05, 0.09, 0.2], 0.1)).toEqual([5, 10, 10, 10, 40]);
  });
});

describe('oneEuro', () => {
  test('an angle crossing ±180 is smoothed the short way round, never through 0', () => {
    const y = oneEuro([170, 179, -179, -170, -175]);
    for (const v of y) expect(Math.abs(v)).toBeGreaterThan(160);
  });

  test('a held angle stays put', () => {
    expect(oneEuro([30, 30, 30])).toEqual([30, 30, 30]);
  });
});

describe('keysOf', () => {
  test("S7b's runs (front f0-35, single-1 f36-123) key every 16th frame of each run and its last", () => {
    const runs: ReadonlyArray<Run> = [
      { from: 0, to: 36, drawing: 'm/front' },
      { from: 36, to: 124, drawing: 'm/single' },
    ];
    expect(keysOf(runs)).toEqual([0, 16, 32, 35, 36, 52, 68, 84, 100, 116, 123]);
  });
});

describe('carried', () => {
  const c = (v: number): Correction => ({ numbers: { lean: v }, root: [v, 0], scale: v / 10 });

  test('corrections are carried linearly between keys, and never across a run boundary', () => {
    const runs: ReadonlyArray<Run> = [
      { from: 0, to: 3, drawing: 'm/a' },
      { from: 3, to: 5, drawing: 'm/b' },
    ];
    const at = new Map([
      [0, c(0)],
      [2, c(10)],
      [3, c(100)],
      [4, c(100)],
    ]);
    const out = carried(runs, [0, 2, 3, 4], at);
    expect(out.map((x) => x.numbers['lean'])).toEqual([0, 5, 10, 100, 100]);
    expect(out[1]!.root).toEqual([5, 0]);
    expect(out[1]!.scale).toBeCloseTo(0.5);
  });

  test('an angle correction is carried the short way round', () => {
    const at = new Map([
      [0, c(170)],
      [2, c(-170)],
    ]);
    const out = carried([{ from: 0, to: 3, drawing: 'm/a' }], [0, 2], at);
    expect(Math.abs(out[1]!.numbers['lean']!)).toBeCloseTo(180);
  });
});

describe('figureOf and iouOf', () => {
  const raster = (px: ReadonlyArray<readonly [number, number, number, number]>): Raster => ({
    width: px.length,
    height: 1,
    rgba: Uint8Array.from(px.flat()),
  });

  test("the figure is each pixel over 24 (L1 RGB) from the corners' paper; IoU against alpha over 127", () => {
    const paper = [250, 245, 235, 255] as const;
    const target = raster([
      paper,
      [240, 240, 230, 255],
      [100, 80, 60, 255],
      [90, 70, 50, 255],
      paper,
    ]);
    const mask = figureOf(target);
    expect([...mask]).toEqual([0, 0, 1, 1, 0]);
    const drawn = raster([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 255],
      [0, 0, 0, 127],
      [0, 0, 0, 200],
    ]);
    expect(iouOf(mask, drawn)).toBeCloseTo(1 / 3);
    expect(iouOf(new Uint8Array(5), raster(Array(5).fill([0, 0, 0, 0])))).toBe(1);
  });
});

describe('bandsOf', () => {
  test("each band's mean IoU and the drawings it names, inclusive at both ends", () => {
    const frames = [0.5, 0.7, 0.9, 1].map((iou, f) => ({
      f,
      drawing: ['m/a', 'm/a', 'm/b', 'm/b'][f] ?? '',
      p: 1,
      iou,
    }));
    expect(bandsOf(frames, [[1, 3]])).toEqual({
      iou: { '1-3': (0.7 + 0.9 + 1) / 3 },
      named: { '1-3': { 'm/a': 1, 'm/b': 2 } },
    });
  });
});
