/**
 * The natural voice's module on iOS: the Swift package `native/natural`,
 * which One's prebuild makes a local pod and its bundler binds here. Only
 * this file imports the Swift source: One's bundler refuses a `.swift`
 * import in an Android or web build. A rejected call becomes
 * `NaturalUnavailable` with the module's own word (`missing`, `check`,
 * `stale`, …); pause, resume, stop and cancelInstall are logged and dropped.
 */

import { Effect, Layer } from 'effect';

import {
  Natural as Native,
  type NaturalEvent as NativeEvent,
  type NaturalInstallEvent as NativeInstallEvent,
} from '../../native/natural/Natural.swift';
import type { VoiceEvent } from '../voice';
import {
  NaturalModule,
  NaturalUnavailable,
  type InstallEvent,
  type ModelFile,
  type NaturalStatus,
} from './module';

const filesOf = (files: ReadonlyArray<ModelFile>) =>
  files.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }));

const eventOf = (event: NativeEvent): VoiceEvent => ({
  utterance: event.utterance,
  kind: event.kind,
  location: event.location,
  length: event.length,
});

const installOf = (event: NativeInstallEvent): InstallEvent => ({
  kind: event.kind,
  bytes: event.bytes,
  total: event.total,
  reason: event.reason,
});

/** What `status` reports when the module itself could not answer: nothing held. */
const nothing = (revision: string): NaturalStatus => ({
  revision,
  files: 0,
  bytes: 0,
  excluded: false,
  crashed: false,
  loaded: false,
  installing: false,
  footprint: 0,
  peak: 0,
});

const reasonOf = (cause: unknown): string => {
  if (cause instanceof Error) return cause.message;
  return String(cause);
};

/** A native call whose rejection fails with the module's reason. */
const refusable = <A>(call: () => Promise<A>) =>
  Effect.tryPromise({
    try: call,
    catch: (cause) => NaturalUnavailable.make({ reason: reasonOf(cause) }),
  });

/** A native call whose rejection is logged and dropped: its caller has nothing to act on. */
const quiet = (name: string, call: () => Promise<void>) =>
  Effect.tryPromise(call).pipe(
    Effect.catchTag('UnknownError', (error) =>
      Effect.logWarning('natural.native.failed').pipe(
        Effect.annotateLogs({ call: name, cause: String(error.cause) }),
      ),
    ),
  );

/** One subscription to a native event stream, released with its scope. */
const listen = (subscribe: () => () => void) =>
  Effect.asVoid(
    Effect.acquireRelease(Effect.sync(subscribe), (unsubscribe) => Effect.sync(unsubscribe)),
  );

export const naturalModule: Layer.Layer<NaturalModule> = Layer.succeed(
  NaturalModule,
  NaturalModule.of({
    status: (revision, files) =>
      Effect.tryPromise(() => Native.status(revision, filesOf(files))).pipe(
        Effect.catchTag('UnknownError', (error) =>
          Effect.logWarning('natural.status.failed').pipe(
            Effect.annotateLogs({ cause: String(error.cause) }),
            Effect.as(nothing(revision)),
          ),
        ),
      ),
    install: (base, revision, files) =>
      refusable(() => Native.install(base, revision, filesOf(files))),
    cancelInstall: quiet('cancelInstall', () => Native.cancelInstall()),
    remove: refusable(() => Native.remove()),
    load: (revision, files, voice) => refusable(() => Native.load(revision, filesOf(files), voice)),
    render: (utterance, chunk, ids, speed) =>
      refusable(() => Native.render(utterance, chunk, [...ids], speed)).pipe(
        Effect.map(({ frames, samples, millis }) => ({ frames, samples, millis })),
      ),
    play: (utterance, chunk, starts, last) =>
      refusable(() =>
        Native.play(
          utterance,
          chunk,
          starts.map(({ sample, location, length }) => ({ sample, location, length })),
          last,
        ),
      ),
    pause: quiet('pause', () => Native.pause()),
    resume: quiet('resume', () => Native.resume()),
    stop: quiet('stop', () => Native.stop()),
    subscribe: (listener) => listen(() => Native.onEvent((event) => listener(eventOf(event)))),
    subscribeInstall: (listener) =>
      listen(() => Native.onInstall((event) => listener(installOf(event)))),
  }),
);
