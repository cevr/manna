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
export const runtime = Atom.runtime(offlineLive);
export const progress = runtime
  .atom(Stream.unwrap(Effect.map(Offline, (cache) => cache.changes)), { initialValue: empty })
  .pipe(Atom.withServerValue(() => AsyncResult.success(empty)));
export type Action = Data.TaggedEnum<{
  Open: { readonly number: number };
  All: {};
  Cancel: {};
  Delete: {};
}>;
export const Action = Data.taggedEnum<Action>();
export const send = runtime.fn(
  Effect.fn('Offline.command')(function* (action: Action) {
    const cache = yield* Offline;
    return yield* Action.$match(action, {
      Open: ({ number }) => cache.enqueue({ number, offset: 0 }),
      All: () => cache.downloadAll,
      Cancel: () => cache.cancel,
      Delete: () => cache.deleteAll,
    });
  }),
);
