import { Data, Effect, Layer, Stream } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { Offline, offlineLayer, empty } from './cache';
import { mediaLayer } from './media';
import { httpLayer } from './http';

// A launch-time dev origin permits full fake-origin journeys without R2 bulk traffic.
// Production always uses R2. This setting changes no recording identity.
const origin = () => {
  if (import.meta.env['DEV']) return import.meta.env['VITE_HYMNAL_RECORDINGS_ORIGIN'];
};
export const offlineLive = offlineLayer.pipe(
  Layer.provide(mediaLayer),
  Layer.provide(httpLayer(origin())),
);
export type Action = Data.TaggedEnum<{
  Open: { readonly number: number };
  All: {};
  Cancel: {};
  Delete: {};
}>;
export const Action = Data.taggedEnum<Action>();
/** The progress and player runtimes share this exact layer in one registry. */
export const downloadsOn = (layer: Layer.Layer<Offline>) => {
  const runtime = Atom.runtime(layer);
  const progress = runtime
    .atom(Stream.unwrap(Effect.map(Offline, (cache) => cache.changes)), { initialValue: empty })
    .pipe(Atom.withServerValue(() => AsyncResult.success(empty)));
  const send = runtime.fn(
    Effect.fn('Offline.command')(function* (action: Action) {
      const cache = yield* Offline;
      return yield* Action.$match(action, {
        Open: ({ number }) => cache.shown(number),
        All: () => cache.downloadAll,
        Cancel: () => cache.cancel,
        Delete: () => cache.deleteAll,
      });
    }),
    { concurrent: true },
  );
  return { progress, send };
};
export const { progress, send } = downloadsOn(offlineLive);
