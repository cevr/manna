// Clip B decoded in process and laid on the canvas at its provenance's map
// (`clip-eval.ts`): the 124 canvases are read.py's own, pixel for pixel.
// Slow: it decodes a real mp4 through the media stack and maps every frame.

import { createHash } from 'node:crypto';
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Result } from 'effect';
import { Media } from '../media.ts';
import { decodePng } from '../png.ts';
import { clipFrames, provenanceOf, writeCanvases } from './clip-eval.ts';

const CLIP = new URL(
  '../../../../../apps/animations/src/library/cast/lead-feast/cutout/raise/clip/clip-b.mp4',
  import.meta.url,
).pathname;

/**
 * The sha256 of read.py's canvases of clip B, every frame's RGBA from f000
 * to f123 in order: measured 2026-11-01 over the five reads of clip B in the
 * cast cache (`<cache>/reads/<key>/canvas`, read.py's `--save-mapped`), all
 * five alike.
 */
const READ_PY_CANVASES = 'b3c51eeab04c19794cb345ad029cbf9a8c3449fbb2838eba88095f52c8d9a788';

const MS = 60_000;

describe('clip B on the canvas', () => {
  it.effect(
    "is read.py's canvases, pixel for pixel, at its provenance's map",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped();
        const { map, output } = yield* provenanceOf(CLIP);
        const figure = yield* writeCanvases(clipFrames(CLIP), map, `${dir}/canvas`);
        const names = (yield* fs.readDirectory(`${dir}/canvas`)).toSorted();
        expect(names.length).toBe(output.frames);
        expect(figure.heightRatio.length).toBe(output.frames);
        const hash = createHash('sha256');
        for (const name of names)
          hash.update(
            Result.getOrThrow(decodePng(yield* fs.readFile(`${dir}/canvas/${name}`))).rgba,
          );
        expect(hash.digest('hex')).toBe(READ_PY_CANVASES);
      }).pipe(Effect.scoped, Effect.provide(Layer.provideMerge(Media.layer, BunServices.layer))),
    // oxlint-disable-next-line film/tests-keep-their-strength -- it decodes and maps clip B's 124 frames in this process: about 8 s, past bun's 5 s; a slow test may wait.
    MS,
  );
});
