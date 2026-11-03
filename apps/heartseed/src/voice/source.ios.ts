/**
 * The voice's source on iOS: the Swift package `native/voice`, which One's
 * prebuild makes a local pod and its bundler binds here. Only this file
 * imports the Swift source: One's bundler refuses a `.swift` import in an
 * Android or web build. The module's `VoiceInfo` and `VoiceEvent` structs
 * cross as One's generated types and are mapped to the service's own.
 */

import { Effect, Layer } from 'effect';

import {
  Voice as Native,
  type VoiceEvent as NativeEvent,
  type VoiceInfo as NativeInfo,
} from '../../native/voice/Voice.swift';
import { VoiceSource, VoiceUnavailable, type VoiceEvent, type VoiceInfo } from '../voice';

const infoOf = (voice: NativeInfo): VoiceInfo => ({
  id: voice.id,
  language: voice.language,
  name: voice.name,
  quality: voice.quality,
  novelty: voice.novelty,
  personal: voice.personal,
});

const eventOf = (event: NativeEvent): VoiceEvent => ({
  utterance: event.utterance,
  kind: event.kind,
  location: event.location,
  length: event.length,
});

/** A native call whose rejection is logged and dropped: pause, resume and stop answer nothing a reading can act on. */
const quiet = (name: string, call: () => Promise<void>) =>
  Effect.tryPromise(call).pipe(
    Effect.catchTag('UnknownError', (error) =>
      Effect.logWarning('voice.native.failed').pipe(
        Effect.annotateLogs({ call: name, cause: String(error.cause) }),
      ),
    ),
  );

export const voiceSource: Layer.Layer<VoiceSource> = Layer.succeed(
  VoiceSource,
  VoiceSource.of({
    voices: Effect.tryPromise(() => Native.voices()).pipe(
      Effect.map((voices) => voices.map(infoOf)),
      Effect.catchTag('UnknownError', (error) =>
        Effect.logWarning('voice.voices.failed').pipe(
          Effect.annotateLogs({ cause: String(error.cause) }),
          Effect.as([]),
        ),
      ),
    ),
    speak: (utterance, text, voice) =>
      Effect.tryPromise({
        try: () => Native.speak(utterance, text, voice),
        catch: (cause) => VoiceUnavailable.make({ reason: String(cause) }),
      }),
    pause: quiet('pause', () => Native.pause()),
    resume: quiet('resume', () => Native.resume()),
    stop: quiet('stop', () => Native.stop()),
    subscribe: (listener) =>
      Effect.asVoid(
        Effect.acquireRelease(
          Effect.sync(() => Native.onEvent((event) => listener(eventOf(event)))),
          (unsubscribe) => Effect.sync(unsubscribe),
        ),
      ),
  }),
);
