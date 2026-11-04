/**
 * Dictation's sources on iOS: the Swift package `native/dictation`, which
 * One's prebuild makes a local pod and its bundler binds here. Only this
 * file imports the Swift source: One's bundler refuses a `.swift` import in
 * an Android or web build. `microphoneSource` listens on the device's
 * microphone; `replaySource` has the module play a script in its place
 * (the simulator's source, which opens nothing). Both share the module's
 * one held session, so its engines, finish, cancel and events are the same.
 */

import { Effect, Layer } from 'effect';

import {
  Dictation as Native,
  type DictationEvent as NativeEvent,
  type DictationRun as NativeRun,
} from '../../native/dictation/Dictation.swift';
import {
  DictationSource,
  DictationUnavailable,
  type DictationEvent,
  type DictationRun,
} from '../dictation';
import type { DictationStep } from './script';

const runOf = (run: NativeRun): DictationRun => ({
  text: run.text,
  start: run.start,
  end: run.end,
});

const eventOf = (event: NativeEvent): DictationEvent => ({
  session: event.session,
  kind: event.kind,
  final: event.final,
  runs: event.runs.map(runOf),
  reason: event.reason,
});

/** A native call whose rejection is logged and dropped: finish and cancel answer nothing a recital can act on. */
const quiet = (name: string, call: () => Promise<void>) =>
  Effect.tryPromise(call).pipe(
    Effect.catchTag('UnknownError', (error) =>
      Effect.logWarning('dictation.native.failed').pipe(
        Effect.annotateLogs({ call: name, cause: String(error.cause) }),
      ),
    ),
  );

/** The module as a source whose listen is `begin`: the microphone's, or a replay's. */
const sourceOf = (
  begin: (
    session: number,
    engine: string,
    locale: string,
    hints: readonly string[],
  ) => Promise<void>,
) =>
  Layer.succeed(
    DictationSource,
    DictationSource.of({
      engines: (locale) =>
        Effect.tryPromise(() => Native.engines(locale)).pipe(
          Effect.catchTag('UnknownError', (error) =>
            Effect.logWarning('dictation.engines.failed').pipe(
              Effect.annotateLogs({ cause: String(error.cause) }),
              Effect.as([]),
            ),
          ),
        ),
      listen: (session, engine, locale, hints) =>
        Effect.tryPromise({
          try: () => begin(session, engine, locale, hints),
          catch: (cause) => DictationUnavailable.make({ reason: String(cause) }),
        }),
      finish: quiet('finish', () => Native.finish()),
      cancel: quiet('cancel', () => Native.cancel()),
      subscribe: (listener) =>
        Effect.asVoid(
          Effect.acquireRelease(
            Effect.sync(() => Native.onEvent((event) => listener(eventOf(event)))),
            (unsubscribe) => Effect.sync(unsubscribe),
          ),
        ),
    }),
  );

/** The device's microphone and on-device recognizers. */
export const microphoneSource: Layer.Layer<DictationSource> = sourceOf(
  (session, engine, locale, hints) => Native.listen(session, engine, locale, [...hints]),
);

/** The module playing `steps` in place of the microphone, whatever engine is asked: the simulator's source. */
export const replaySource = (steps: readonly DictationStep[]): Layer.Layer<DictationSource> =>
  sourceOf((session) =>
    Native.replay(
      session,
      steps.map((step) => ({ at: step.at, final: step.final, runs: step.runs.map(runOf) })),
    ),
  );
