import { Effect, Layer, Option } from 'effect';
import { HttpClient } from 'effect/http';
import { PaintingImages, PaintingUnloadable } from './images.ts';

export const PaintingImagesBrowser = Layer.effect(
  PaintingImages,
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;
    const read = (png: string) => {
      const unreadable = (reason: string) => PaintingUnloadable.make({ painting: png, reason });
      return http.get(png).pipe(
        Effect.mapError((error) => unreadable(error.message)),
        Effect.filterOrFail(
          (res) => res.status >= 200 && res.status < 300,
          (res) => unreadable(`status ${res.status}`),
        ),
        Effect.flatMap((res) =>
          Effect.mapError(res.arrayBuffer, (error) => unreadable(error.message)),
        ),
        Effect.flatMap((bytes) =>
          Effect.acquireRelease(
            Effect.tryPromise({
              try: () =>
                createImageBitmap(new Blob([bytes], { type: 'image/png' }), {
                  colorSpaceConversion: 'none',
                  premultiplyAlpha: 'premultiply',
                }),
              catch: (cause) => unreadable(`does not decode: ${String(cause)}`),
            }),
            (bitmap) => Effect.sync(() => bitmap.close()),
          ),
        ),
        Effect.map((bitmap) => ({
          width: bitmap.width,
          height: bitmap.height,
          image: Option.some<CanvasImageSource>(bitmap),
          rgba: Option.none(),
        })),
      );
    };
    return PaintingImages.of({ read });
  }),
);
