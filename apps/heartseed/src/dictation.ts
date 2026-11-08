/**
 * Dictation: one recital of a verse, heard through a `DictationSource` (on
 * iOS a thin native module over the device's on-device recognizers) and
 * held against the verse by the matcher, so a screen can light each word
 * as it is said and mark a miss while the reader speaks. The rules live in
 * `dictation/attempt.ts`, a pure reducer; this service runs it: each
 * command changes the view at its call, then makes the one source call the
 * reducer asks for, and each event the source sends applies at once,
 * inside its listener.
 *
 * A listen tries the engines of `CHAIN` in order: an engine that cannot
 * run says `unavailable` before anything is heard, and the recital falls
 * back to the next one under a new session. A finish waits for the
 * source's end, at most `FINISH_GRACE_MS` on Effect's clock, then ends the
 * recital itself and cancels the source.
 */

import { Context, Effect, Layer, Match, MutableRef, Option, PubSub, Schema, Stream } from 'effect';
import type { Scope } from 'effect';

import {
  initial,
  isActive,
  LOCALE,
  step,
  type Attempt,
  type Call,
  type DictationEvent,
  type DictationView,
  type Engine,
  type Input,
} from './dictation/attempt';
import type { Cue } from './matcher';

export { CHAIN, LOCALE } from './dictation/attempt';
export type { DictationEvent, DictationView, Ending, Engine, Status } from './dictation/attempt';
export { hintsOf, wordsOf } from './dictation/words';
export type { DictationRun } from './dictation/words';

/** How long a finish waits for the source's end before it ends the recital itself. */
export const FINISH_GRACE_MS = 1500;

/** The views a held subscriber of `changes` keeps: past it, its oldest view slides out, so it always reaches the latest. */
const WINDOW = 16;

/** What an engine can do on this device now: `ready`, `missing` (its model is supported but not on the device) or `unsupported`. */
export interface EngineReport {
  readonly engine: string;
  readonly status: string;
}

/** The source refused a listen: no recognizer on this platform, or the native module rejected the call. */
export class DictationUnavailable extends Schema.TaggedError<DictationUnavailable>()(
  'DictationUnavailable',
  {
    reason: Schema.String,
  },
) {}

/** The device's recognizers (or a script standing in for them), as the service drives them: one session at a time. */
export class DictationSource extends Context.Service<
  DictationSource,
  {
    readonly engines: (locale: string) => Effect.Effect<readonly EngineReport[]>;
    readonly listen: (
      session: number,
      engine: Engine,
      locale: string,
      hints: readonly string[],
    ) => Effect.Effect<void, DictationUnavailable>;
    readonly finish: Effect.Effect<void>;
    readonly cancel: Effect.Effect<void>;
    readonly subscribe: (
      listener: (event: DictationEvent) => void,
    ) => Effect.Effect<void, never, Scope.Scope>;
  }
>()('heartseed/dictation/DictationSource') {}

/** A recital of one verse, and what a screen shows of it. */
export class Dictation extends Context.Service<
  Dictation,
  {
    readonly start: (verse: string, cue?: Cue) => Effect.Effect<void>;
    readonly finish: Effect.Effect<void>;
    readonly cancel: Effect.Effect<void>;
    readonly peek: (index: number) => Effect.Effect<void>;
    readonly engines: Effect.Effect<readonly EngineReport[]>;
    readonly view: Effect.Effect<DictationView>;
    readonly changes: Stream.Stream<DictationView>;
    readonly endings: Stream.Stream<DictationView>;
  }
>()('heartseed/dictation/Dictation') {}

export const layer: Layer.Layer<Dictation, never, DictationSource> = Layer.effect(
  Dictation,
  Effect.gen(function* () {
    const source = yield* DictationSource;
    const scope = yield* Effect.scope;
    const state = MutableRef.make<Attempt>(initial);
    const views = yield* PubSub.sliding<DictationView>({ capacity: WINDOW, replay: 1 });
    const endings = yield* PubSub.unbounded<DictationView>();
    const context = yield* Effect.context<never>();
    const runFork = Effect.runForkWith(context);
    yield* PubSub.publish(views, initial.view);

    /**
     * Applies one input, publishes a changed view (and the view at an
     * ending, to `endings`, which keeps every one), and answers the call it
     * asks for. Neither publish suspends: `views` slides, dropping a held
     * subscriber's oldest view, and `endings` is unbounded.
     */
    const dispatch = (input: Input): Effect.Effect<Option.Option<Call>> =>
      Effect.gen(function* () {
        const before = MutableRef.get(state);
        const next = step(before, input);
        MutableRef.set(state, next.attempt);
        const view = next.attempt.view;
        if (view !== before.view) yield* PubSub.publish(views, view);
        if (isActive(before.view) && !isActive(view)) yield* PubSub.publish(endings, view);
        return next.call;
      });

    const run = (input: Input): Effect.Effect<void> =>
      Effect.flatMap(dispatch(input), Option.match({ onNone: () => Effect.void, onSome: perform }));

    /** A listen whose refusal counts as that session's `unavailable`. */
    const listen = (call: Extract<Call, { _tag: 'Listen' }>) =>
      source.listen(call.session, call.engine, call.locale, call.hints).pipe(
        Effect.catchTag('DictationUnavailable', (error) =>
          Effect.logDebug('dictation.listen.refused').pipe(
            Effect.annotateLogs({
              session: call.session,
              engine: call.engine,
              reason: error.reason,
            }),
            Effect.andThen(run({ _tag: 'Refused', session: call.session })),
          ),
        ),
      );

    /** The grace: after `FINISH_GRACE_MS` on the service's own clock, whoever called finish, a session still finishing ends finished. */
    const grace = (session: number) =>
      Effect.forkIn(
        Effect.provideContext(
          Effect.andThen(Effect.sleep(FINISH_GRACE_MS), run({ _tag: 'Grace', session })),
          context,
        ),
        scope,
      );

    const perform: (call: Call) => Effect.Effect<void> = Match.type<Call>().pipe(
      Match.tagsExhaustive({
        Listen: listen,
        Finish: ({ session }) => Effect.andThen(grace(session), source.finish),
        Cancel: () => source.cancel,
      }),
    );

    yield* source.subscribe((event) => {
      // oxlint-disable-next-line no-restricted-properties -- a native listener: the view publishes before the event returns
      const call = Effect.runSyncWith(context)(dispatch({ _tag: 'Event', event }));
      Option.map(call, (asked) => runFork(perform(asked)));
    });
    yield* Effect.addFinalizer(() =>
      Effect.suspend(() => {
        if (isActive(MutableRef.get(state).view)) return source.cancel;
        return Effect.void;
      }),
    );

    return Dictation.of({
      start: (verse, cue = 'none') => run({ _tag: 'Start', verse, cue }),
      finish: run({ _tag: 'Finish' }),
      cancel: run({ _tag: 'Cancel' }),
      peek: (index) => run({ _tag: 'Peek', index }),
      engines: source.engines(LOCALE),
      view: Effect.sync(() => MutableRef.get(state).view),
      changes: Stream.fromPubSub(views),
      endings: Stream.fromPubSub(endings),
    });
  }),
);
