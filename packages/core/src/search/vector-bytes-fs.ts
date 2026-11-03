import { Effect, FileSystem, Layer, Option } from 'effect';

import { VectorIndexBytes } from './vector-artifact.js';

const copyToBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
};

export const layerFileVectorIndexBytes = (
  filename: string,
): Layer.Layer<VectorIndexBytes, never, FileSystem.FileSystem> =>
  Layer.effect(
    VectorIndexBytes,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      return VectorIndexBytes.of({
        read: Effect.gen(function* () {
          const found = yield* fs
            .exists(filename)
            .pipe(
              Effect.catchTag('PlatformError', (cause) =>
                Effect.logWarning('search.vectorIndex.statFailed').pipe(
                  Effect.annotateLogs({ filename, cause: cause.message }),
                  Effect.as(false),
                ),
              ),
            );
          if (!found) return Option.none<ArrayBuffer>();
          return yield* fs.readFile(filename).pipe(
            Effect.map((bytes) => Option.some(copyToBuffer(bytes))),
            Effect.catchTag('PlatformError', (cause) =>
              Effect.logWarning('search.vectorIndex.readFailed').pipe(
                Effect.annotateLogs({ filename, cause: cause.message }),
                Effect.as(Option.none<ArrayBuffer>()),
              ),
            ),
          );
        }),
      });
    }),
  );
