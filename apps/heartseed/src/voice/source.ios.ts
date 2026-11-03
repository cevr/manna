/**
 * The voice's source on iOS: the Swift package `native/voice`, which One's
 * prebuild makes a local pod and its bundler binds here. Only this file
 * imports the Swift source: One's bundler refuses a `.swift` import in an
 * Android or web build. The module's events come as JSON text, decoded
 * here; a malformed one is logged and dropped.
 */

import { Effect, Layer, Option, Schema } from 'effect';

import { Voice as Native } from '../../native/voice/Voice.swift';
import { VoiceSource, VoiceUnavailable } from '../voice';
import { VoiceEventJson, VoiceInfoJson } from './wire';

const decodeEvent = Schema.decodeUnknownOption(VoiceEventJson);

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
      Effect.flatMap(Schema.decodeUnknownEffect(VoiceInfoJson)),
      Effect.catchTags({
        UnknownError: (error) =>
          Effect.logWarning('voice.voices.failed').pipe(
            Effect.annotateLogs({ cause: String(error.cause) }),
            Effect.as([]),
          ),
        SchemaError: (error) =>
          Effect.logWarning('voice.voices.failed').pipe(
            Effect.annotateLogs({ cause: error.message }),
            Effect.as([]),
          ),
      }),
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
          Effect.sync(() =>
            Native.onEvent((text) =>
              Option.match(decodeEvent(text), {
                onNone: () => Effect.runFork(Effect.logWarning('voice.event.malformed')),
                onSome: listener,
              }),
            ),
          ),
          (unsubscribe) => Effect.sync(unsubscribe),
        ),
      ),
  }),
);
