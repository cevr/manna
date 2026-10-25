// The page's media loads the panes' module (mediabunny's WebCodecs decoders)
// only where the panes are chosen, and plays on <video> when that chunk will
// not load. That the entry chunk reaches none of mediabunny is a bundle check:
// media-browser.slow.test.ts.

import { expect, it } from 'effect-bun-test';
import { Effect, Layer, Stream } from 'effect';
import { Frames } from './frames.ts';
import { PANES_NOT_LOADED } from './media-choice.ts';
import { panesMediaLayerWith } from './media-browser.ts';
import { Media } from './media.ts';
import { Viewport } from './viewport.ts';

/** A desk's window (no coarse pointer) and a panes module whose chunk is gone. */
const desk = Layer.succeed(
  Viewport,
  Viewport.of({ matches: () => Effect.succeed(false), changes: () => Stream.empty }),
);
const media = Layer.provide(
  // oxlint-disable-next-line effect/noNewPromise, effect/noNewError -- a chunk that 404s rejects the import() promise
  panesMediaLayerWith(() => Promise.reject(new Error('chunk 404'))),
  Layer.merge(Frames.layerClock, desk),
);

it.effect('a panes module that will not load plays on <video>, saying so', () =>
  Effect.gen(function* () {
    const hadDecoder = 'VideoDecoder' in globalThis;
    Reflect.set(globalThis, 'VideoDecoder', {});
    const compare = yield* Media.use((m) => m.compare(['https://lab.test/a.mp4'])).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (!hadDecoder) Reflect.deleteProperty(globalThis, 'VideoDecoder');
        }),
      ),
      Effect.scoped,
    );
    expect(compare.engine).toEqual({ engine: 'video', why: PANES_NOT_LOADED });
  }).pipe(Effect.provide(media)),
);
