// A page's part PNG decoded into a bitmap holds memory outside the heap until
// it is closed: the page's reader closes it whether the read goes on to
// succeed or fails after the decode. Bun has no decoder and no DOM, so the
// page's `createImageBitmap` and `document` are stood in for the test's scope
// and put back after.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Exit, Layer, Option } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/http';
import { PuppetImagesBrowser } from './images-browser.ts';
import { PuppetImages } from './images.ts';

/** The page's globals the test stands in for. */
const GLOBALS = ['createImageBitmap', 'document'] as const;

/** A page whose decoder hands back 2 × 2 bitmaps it counts the closes of, and whose canvases have no 2D context. */
const pageWithNo2d = Effect.acquireRelease(
  Effect.sync(() => {
    const saved = GLOBALS.map(
      (name) => [name, Reflect.has(globalThis, name), Reflect.get(globalThis, name)] as const,
    );
    const counts = { closed: 0 };
    Reflect.set(globalThis, 'createImageBitmap', () =>
      Effect.runPromise(Effect.succeed({ width: 2, height: 2, close: () => void counts.closed++ })),
    );
    // A canvas whose `getContext` answers nothing, as a page with no 2D context does.
    Reflect.set(globalThis, 'document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => Option.getOrUndefined(Option.none()),
      }),
    });
    return { counts, saved };
  }),
  ({ saved }) =>
    Effect.sync(() => {
      for (const [name, had, value] of saved)
        if (had) Reflect.set(globalThis, name, value);
        else Reflect.deleteProperty(globalThis, name);
    }),
);

/** A client that answers every URL with a PNG's first bytes. */
const pngBytes = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.succeed(
      HttpClientResponse.fromWeb(request, new Response(new Uint8Array([137, 80, 78, 71]))),
    ),
  ),
);

describe('PuppetImagesBrowser', () => {
  it.live('a failed read closes the decoded bitmap', () =>
    Effect.gen(function* () {
      const { counts } = yield* pageWithNo2d;
      const images = yield* PuppetImages;
      const read = yield* Effect.exit(images.read('http://lab.slow.test/x.png'));
      expect(read).toEqual(
        Exit.fail(
          expect.objectContaining({
            _tag: 'PuppetUnloadable',
            reason: 'no 2D context to read it on',
          }),
        ),
      );
      expect(counts.closed).toBe(1);
    }).pipe(Effect.scoped, Effect.provide(PuppetImagesBrowser.pipe(Layer.provide(pngBytes)))),
  );
});
