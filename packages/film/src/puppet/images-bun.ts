import { Effect, FileSystem, Layer, Result } from 'effect';
import { decodePng } from '../tools/png.ts';
import { PuppetImages, PuppetUnloadable } from './images.ts';

export const PuppetImagesBun = Layer.effect(
  PuppetImages,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const read = (png: string) =>
      fs.readFile(png).pipe(
        Effect.mapError((error) => PuppetUnloadable.make({ puppet: png, reason: error.message })),
        Effect.flatMap((bytes) =>
          Effect.fromResult(
            Result.mapError(decodePng(bytes), (error) =>
              PuppetUnloadable.make({ puppet: png, reason: error.message }),
            ),
          ),
        ),
      );
    return PuppetImages.of({ read, paints: false });
  }),
);
