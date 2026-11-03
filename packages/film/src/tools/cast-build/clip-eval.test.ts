import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Path, Result, Stream } from 'effect';
import type { Raster } from '../../core/raster.ts';
import { memoryFileSystem } from '../host/testing.ts';
import { decodePng } from '../png.ts';
import { CANVAS, declaredBands, rasterOfRgb24, writeCanvases } from './clip-eval.ts';

/** A `w` × `h` raster, each pixel's grey from `at`. */
const grey = (w: number, h: number, at: (x: number, y: number) => number): Raster => {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) rgba.set([at(x, y), at(x, y), at(x, y), 255], (y * w + x) * 4);
  return { width: w, height: h, rgba };
};

/** A 12 × 12 paper frame with the box `[left, top, right, bottom)` inked. */
const inked = (l: number, t: number, r: number, b: number) =>
  grey(12, 12, (x, y) => 235 - 205 * Number(x >= l && x < r && y >= t && y < b));

const disk = () => {
  const files = new Map<string, Uint8Array>();
  return { files, layer: Layer.merge(memoryFileSystem(files, new Set(['/c'])), Path.layer) };
};

const canvasAt = (files: ReadonlyMap<string, Uint8Array>, name: string) =>
  Result.getOrThrow(decodePng(files.get(name)!));

const greyAt = (r: Raster, x: number, y: number) => r.rgba[(y * r.width + x) * 4]!;

describe('a clip on the canvas', () => {
  it.effect("is laid on the reader's own canvas size (reader/model.py CANVAS)", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const model = yield* fs.readFileString(
        new URL('../../../reader/model.py', import.meta.url).pathname,
      );
      expect(/^CANVAS = \((\d+), (\d+)\)/m.exec(model)?.slice(1).map(Number)).toEqual([...CANVAS]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect(
    'declares each band with the drawings it accepts by member, none where the clip names none',
    () =>
      Effect.sync(() => {
        const bands = declaredBands('m', {
          bands: [
            [0, 40],
            [41, 123],
            [0, 123],
          ],
          expect: [['front'], ['single', 'poses']],
        });
        expect(bands).toEqual([
          { from: 0, to: 40, expect: ['m/front'] },
          { from: 41, to: 123, expect: ['m/single', 'm/poses'] },
          { from: 0, to: 123, expect: [] },
        ]);
      }),
  );

  it.effect('reads a decoded frame row by row, skipping each row padding past its pixels', () =>
    Effect.sync(() => {
      const rgb24 = Uint8Array.from([1, 2, 3, 4, 5, 6, 99, 99, 7, 8, 9, 10, 11, 12, 99, 99]);
      expect(rasterOfRgb24(rgb24, 2, 2, 8)).toEqual({
        width: 2,
        height: 2,
        rgba: Uint8Array.from([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255]),
      });
    }),
  );

  it.effect(
    'writes each frame at the map as f%03d.png: block means inside the video, its border paper outside',
    () => {
      const { files, layer } = disk();
      return Effect.gen(function* () {
        const frame = grey(4, 2, (x) => [10, 20, 30, 40][x]!);
        yield* writeCanvases(
          Stream.make(frame, frame),
          { x0: 0, y0: 0, scale: 2 },
          '/c/canvas',
          [3, 1],
        );
        expect([...files.keys()].toSorted()).toEqual(['/c/canvas/f000.png', '/c/canvas/f001.png']);
        const canvas = canvasAt(files, '/c/canvas/f000.png');
        expect([canvas.width, canvas.height]).toEqual([3, 1]);
        expect([0, 1, 2].map((x) => greyAt(canvas, x, 0))).toEqual([15, 35, 25]);
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect('measures the figure on the canvases it wrote, frame by frame in order', () => {
    const { files, layer } = disk();
    return Effect.gen(function* () {
      const figure = yield* writeCanvases(
        Stream.make(inked(4, 4, 8, 8), inked(4, 6, 8, 8)),
        { x0: 0, y0: 0, scale: 2 },
        '/c/canvas',
        [6, 6],
      );
      expect(figure).toEqual({
        heightRatio: [1, 0.5],
        feetPx: [0, 0],
        iouFirst: [1, 0.5],
        iouLast: [0.5, 1],
      });
      expect(greyAt(canvasAt(files, '/c/canvas/f001.png'), 2, 2)).toBe(235);
      expect(greyAt(canvasAt(files, '/c/canvas/f001.png'), 2, 3)).toBe(30);
    }).pipe(Effect.provide(layer));
  });

  it.effect('fails with the stream error and writes no frame after it', () => {
    const { files, layer } = disk();
    return Effect.gen(function* () {
      const frames = Stream.concat(
        Stream.make(grey(4, 2, () => 100)),
        Stream.fail('decode broke' as const),
      );
      const got = yield* Effect.flip(
        writeCanvases(frames, { x0: 0, y0: 0, scale: 2 }, '/c/canvas', [2, 1]),
      );
      expect(got).toBe('decode broke');
      expect([...files.keys()]).toEqual(['/c/canvas/f000.png']);
    }).pipe(Effect.provide(layer));
  });
});
