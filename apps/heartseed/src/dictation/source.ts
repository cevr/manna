/**
 * Dictation's sources on the web and Android: none. Neither reports an
 * engine, and every listen is refused, so a recital there tries each engine
 * of the chain and ends `unavailable`.
 */

import { Effect, Layer } from 'effect';

import { DictationSource, DictationUnavailable } from '../dictation';
import type { DictationStep } from './script';

const none: Layer.Layer<DictationSource> = Layer.succeed(
  DictationSource,
  DictationSource.of({
    engines: () => Effect.succeed([]),
    listen: () =>
      Effect.fail(DictationUnavailable.make({ reason: 'no recognizer on this platform' })),
    finish: Effect.void,
    cancel: Effect.void,
    subscribe: () => Effect.void,
  }),
);

export const microphoneSource: Layer.Layer<DictationSource> = none;

/** No module plays a script here: the same source as the microphone's. */
export const replaySource = (_steps: readonly DictationStep[]): Layer.Layer<DictationSource> =>
  none;
