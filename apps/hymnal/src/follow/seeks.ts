import { Effect, Layer, SubscriptionRef } from 'effect';
import * as Atom from 'effect/reactivity/Atom';

import { Playback } from '~/player/player';

export const seeks = Effect.runSync(SubscriptionRef.make(0));

export const seekCount = Atom.subscriptionRef(seeks);

export const counted = (
  playback: Layer.Layer<Playback>,
  count: SubscriptionRef.SubscriptionRef<number> = seeks,
): Layer.Layer<Playback> =>
  Layer.effect(Playback)(
    Effect.gen(function* () {
      const api = yield* Playback;
      return Playback.of({
        ...api,
        seek: (ms) =>
          Effect.andThen(
            SubscriptionRef.update(count, (n) => n + 1),
            api.seek(ms),
          ),
      });
    }),
  ).pipe(Layer.provide(playback));
