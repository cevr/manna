/**
 * The growth chime on iOS: the Swift package `native/growth`, a system
 * sound (System Sound Services), which the ring/silent switch mutes and
 * which leaves the audio session alone. The sound is handed over once, in
 * the background, as the runtime starts; a growth before it is loaded plays
 * nothing. A play is fire and forget: the keep that sounds it never waits
 * on the native side. Only this file imports the Swift source: One's bundler
 * refuses a `.swift` import in an Android or web build.
 */

import { Effect, Layer, MutableRef, Scope } from 'effect';

import { Growth } from '../../native/growth/Growth.swift';
import { Chime } from '../garden';
import { growthSound } from './sound';

/** The id the native side answers for a sound it could not load. */
const UNLOADED = 0;

/** A native call, then what follows it; a rejection is logged and dropped. */
const quiet = <A>(call: string, run: () => Promise<A>, then: (value: A) => Effect.Effect<void>) =>
  Effect.tryPromise(run).pipe(
    Effect.flatMap(then),
    Effect.catchTag('UnknownError', (error) =>
      Effect.logWarning('garden.chime.failed').pipe(
        Effect.annotateLogs({ call, cause: String(error.cause) }),
      ),
    ),
  );

export const liveChime: Layer.Layer<Chime> = Layer.effect(
  Chime,
  Effect.gen(function* () {
    const scope = yield* Scope.Scope;
    const loaded = MutableRef.make(UNLOADED);
    yield* Effect.forkIn(
      quiet(
        'load',
        () => Growth.load(growthSound.name, growthSound.hash, growthSound.wav),
        (id) => Effect.sync(() => void MutableRef.set(loaded, id)),
      ),
      scope,
    );
    return Chime.of({
      grow: () =>
        Effect.suspend(() => {
          const id = MutableRef.get(loaded);
          if (id === UNLOADED)
            return Effect.logInfo('garden.chime').pipe(
              Effect.annotateLogs({ skipped: 'unloaded' }),
            );
          return Effect.asVoid(
            Effect.forkIn(
              quiet(
                'play',
                () => Growth.play(id, growthSound.name),
                () => Effect.void,
              ),
              scope,
            ),
          );
        }),
    });
  }),
);
