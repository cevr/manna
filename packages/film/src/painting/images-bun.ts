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
