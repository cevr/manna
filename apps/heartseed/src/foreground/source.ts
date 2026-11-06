/**
 * The host's app state, read from React Native's `AppState`: the one module
 * of the app that names it. A subscription reads `AppState.currentState`
 * and adds its `change` listener in one step, and removes the listener when
 * its scope closes. On react-native-web, where `AppState.isAvailable` is
 * false, `addEventListener` hands back nothing, and there is nothing to
 * remove.
 */

import { Effect, Layer, Option, Queue, Stream } from 'effect';
import { AppState } from 'react-native';

import { Foreground } from '../foreground';

export const foregroundSource: Layer.Layer<Foreground> = Layer.succeed(
  Foreground,
  Foreground.of({
    states: Stream.callback<string>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          Queue.offerUnsafe(queue, String(AppState.currentState));
          return Option.fromNullishOr(
            AppState.addEventListener('change', (state) => {
              Queue.offerUnsafe(queue, state);
            }),
          );
        }),
        (subscription) =>
          Effect.sync(() => {
            if (Option.isSome(subscription)) subscription.value.remove();
          }),
      ),
    ),
  }),
);
