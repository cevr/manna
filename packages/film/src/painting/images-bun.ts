// A scene's plate PNGs in Bun (`PaintingImagesBun`), for `check --draw`, the
// tests and the tools: each read from the path its module imported and
// decoded (`tools/png.ts`), so the loader can hold its size and its open
// edges. Bun has no canvas, so nothing is drawn (`image` none); the frame
// still records where the plate lies, for the draw leg's `PaintingEdge`.

import { Effect, FileSystem, Layer, Option, Result } from 'effect';
import { decodePng } from '../tools/png.ts';
import { PaintingImages, PaintingUnloadable } from './images.ts';

export const PaintingImagesBun = Layer.effect(
  PaintingImages,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const read = (png: string) =>
      fs.readFile(png).pipe(
        Effect.mapError((error) =>
          PaintingUnloadable.make({ painting: png, reason: error.message }),
        ),
        Effect.flatMap((bytes) =>
          Effect.fromResult(
            Result.mapError(decodePng(bytes), (error) =>
              PaintingUnloadable.make({ painting: png, reason: error.message }),
            ),
          ),
        ),
        Effect.map((raster) => ({
          width: raster.width,
          height: raster.height,
          image: Option.none(),
          rgba: Option.some(raster.rgba),
        })),
      );
    return PaintingImages.of({ read });
  }),
);
