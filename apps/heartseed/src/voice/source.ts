/**
 * The voice's source on the web and Android: none. It offers no voices,
 * and a speak fails, so a reading there ends `failed` at once; the off
 * switch still holds.
 */

import { Effect, Layer } from 'effect';

import { VoiceSource, VoiceUnavailable } from '../voice';

export const voiceSource: Layer.Layer<VoiceSource> = Layer.succeed(
  VoiceSource,
  VoiceSource.of({
    voices: Effect.succeed([]),
    speak: () => Effect.fail(VoiceUnavailable.make({ reason: 'no voice on this platform' })),
    pause: Effect.void,
    resume: Effect.void,
    stop: Effect.void,
    subscribe: () => Effect.void,
  }),
);
