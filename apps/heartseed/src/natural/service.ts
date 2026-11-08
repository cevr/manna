/**
 * The `Natural` service: the one owner of the natural voice's download and
 * load in the app. It runs `state.ts`'s reducer over the native module and
 * the store: at build it reads the files present, the crash marker and the
 * stored fuse, and listens to the download's events; each input steps the
 * machine at once, publishes a changed view, and forks the calls the step
 * asks for. A release build installs from `MIRROR` and never reads
 * `BASE_KEY`; a development build installs from the base the probe stored,
 * through `baseFor`. It writes no key but `FUSE_KEY`, and it never cancels
 * or removes the download.
 */

import { Context, Effect, Layer, Match, MutableRef, Option, PubSub, Stream } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { naturalOf, type Choice } from '../voice';
import { baseFor, FILES, REVISION } from './manifest';
import { NaturalModule, type InstallEvent } from './module';
import {
  closed,
  reads,
  step,
  storedFuse,
  type Call,
  type Fuse,
  type Input,
  type Machine,
  type NaturalView,
} from './state';

/** The natural voice's state for Today and the router: the view, its changes, whether it reads, and the reader's commands. */
export class Natural extends Context.Service<
  Natural,
  {
    readonly view: Effect.Effect<NaturalView>;
    readonly changes: Stream.Stream<NaturalView>;
    readonly reads: Effect.Effect<boolean>;
    readonly begin: (choice: Choice) => Effect.Effect<void>;
    readonly chosen: (choice: Choice) => Effect.Effect<void>;
    readonly retry: Effect.Effect<void>;
  }
>()('heartseed/natural/Natural') {}

/** The store key of the crash fuse; its text is `blown` or `clear`. */
export const FUSE_KEY = 'heartseed/natural/fuse';

/** The store key of a development build's download base, written by the probe; a release build never reads it. */
export const BASE_KEY = 'heartseed/natural/base';

/** The views a held subscriber of `changes` keeps: past it, its oldest view slides out, so it always reaches the latest. */
const WINDOW = 16;

/** One key's text, or none when the read failed; the failure is logged. */
const readKey = (store: KeyValueStore.KeyValueStore, key: string) =>
  store.get(key).pipe(
    Effect.map(Option.fromUndefinedOr),
    Effect.catchTag('KeyValueStoreError', (error) =>
      Effect.logWarning('natural.store.failed').pipe(
        Effect.annotateLogs({ method: 'get', key, cause: error.message }),
        Effect.as(Option.none<string>()),
      ),
    ),
  );

/** Writes the fuse; a failed write is logged, and the view goes on regardless. */
const writeFuse = (store: KeyValueStore.KeyValueStore, fuse: Fuse) =>
  store
    .set(FUSE_KEY, fuse)
    .pipe(
      Effect.catchTag('KeyValueStoreError', (error) =>
        Effect.logWarning('natural.store.failed').pipe(
          Effect.annotateLogs({ method: 'set', key: FUSE_KEY, cause: error.message }),
        ),
      ),
    );

const installInput = (event: InstallEvent): Input => {
  switch (event.kind) {
    case 'progress':
      return { _tag: 'Progress', bytes: event.bytes, total: event.total };
    case 'waiting':
      return { _tag: 'Waiting' };
    case 'done':
      return { _tag: 'Done' };
    case 'failed':
      return { _tag: 'Failed', reason: event.reason };
  }
};

/** The service over the platform's module and the app's store; `dev` lets the install read the probe's base. */
export const layer = (
  dev: boolean,
): Layer.Layer<Natural, never, NaturalModule | KeyValueStore.KeyValueStore> =>
  Layer.effect(
    Natural,
    Effect.gen(function* () {
      const module = yield* NaturalModule;
      const store = yield* KeyValueStore.KeyValueStore;
      const scope = yield* Effect.scope;
      const runSync = Effect.runSyncWith(yield* Effect.context<never>());
      const views = yield* PubSub.sliding<NaturalView>({ capacity: WINDOW, replay: 1 });
      const state = MutableRef.make<Machine>(closed);

      const status = yield* module.status(REVISION, FILES);
      const stored = yield* readKey(store, FUSE_KEY);

      /** The install's base: a release build's `MIRROR`, unread; a development build's stored base, through `baseFor`. */
      const base = Effect.suspend(() => {
        if (!dev) return Effect.succeed(baseFor(false, Option.none()));
        return readKey(store, BASE_KEY).pipe(Effect.map((asked) => baseFor(true, asked)));
      });

      const perform: (call: Call) => Effect.Effect<void> = Match.type<Call>().pipe(
        Match.tagsExhaustive({
          Fuse: ({ fuse }) => writeFuse(store, fuse),
          Install: () =>
            base.pipe(
              Effect.tap((from) =>
                Effect.logInfo('natural.install').pipe(Effect.annotateLogs({ base: from })),
              ),
              Effect.flatMap((from) => module.install(from, REVISION, FILES)),
              Effect.catchTag('NaturalUnavailable', () =>
                Effect.sync(() => dispatch({ _tag: 'Refused' })),
              ),
            ),
          Load: ({ choice }) =>
            module.load(REVISION, FILES, `${naturalOf(choice)}.bin`).pipe(
              Effect.match({
                onFailure: (error) => dispatch({ _tag: 'LoadFailed', reason: error.reason }),
                onSuccess: () => dispatch({ _tag: 'Loaded' }),
              }),
            ),
        }),
      );

      /** Applies one input at once, publishes a changed view, and forks each call the step asks for, in order. */
      const dispatch = (input: Input) => {
        const before = MutableRef.get(state);
        const next = step(before, input);
        MutableRef.set(state, next.machine);
        if (next.machine.view !== before.view) runSync(PubSub.publish(views, next.machine.view));
        for (const call of next.calls) runSync(Effect.forkIn(perform(call), scope));
      };

      yield* module.subscribeInstall((event) => {
        dispatch(installInput(event));
      });

      dispatch({
        _tag: 'Opened',
        complete: status.files === FILES.length,
        crashed: status.crashed,
        stored: storedFuse(stored),
      });

      return Natural.of({
        view: Effect.sync(() => MutableRef.get(state).view),
        changes: Stream.fromPubSub(views),
        reads: Effect.sync(() => reads(MutableRef.get(state).view)),
        begin: (choice) => Effect.sync(() => dispatch({ _tag: 'Begin', choice })),
        chosen: (choice) => Effect.sync(() => dispatch({ _tag: 'Chosen', choice })),
        retry: Effect.sync(() => dispatch({ _tag: 'Retry' })),
      });
    }),
  );
