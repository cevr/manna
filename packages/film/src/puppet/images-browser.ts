// A puppet's part PNGs in a page (`PuppetImagesBrowser`): each fetched
// through the page's `HttpClient`, decoded (`createImageBitmap`, no colour
// conversion, no premultiplying) and awaited inside the load, then read back
// as RGBA bytes from a 2D canvas. A part's pixels are opaque or clear (its
// sheet's own bytes, or none), so the 2D canvas gives them back as they are.

import { Effect, Layer, Option } from 'effect';
import { HttpClient } from 'effect/http';
import { PuppetImages, PuppetUnloadable } from './images.ts';

export const PuppetImagesBrowser = Layer.effect(
  PuppetImages,
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;
    const read = (png: string) => {
      const unreadable = (reason: string) => PuppetUnloadable.make({ puppet: png, reason });
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
          Effect.tryPromise({
            try: () =>
              createImageBitmap(new Blob([bytes], { type: 'image/png' }), {
                colorSpaceConversion: 'none',
                premultiplyAlpha: 'none',
              }),
            catch: (cause) => unreadable(`does not decode: ${String(cause)}`),
          }),
        ),
        Effect.flatMap((bitmap) => {
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          return Effect.fromOption(
            Option.fromNullishOr(canvas.getContext('2d', { willReadFrequently: true })),
          ).pipe(
            Effect.mapError(() => unreadable('no 2D context to read it on')),
            Effect.map((ctx) => {
              ctx.drawImage(bitmap, 0, 0);
              const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
              bitmap.close();
              return {
                width: canvas.width,
                height: canvas.height,
                rgba: new Uint8Array(data.buffer),
              };
            }),
          );
        }),
      );
    };
    return PuppetImages.of({ read, paints: true });
  }),
);
