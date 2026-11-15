/**
 * The launch's session: the current Heartseed's own `Session`, built once
 * per launch of the data module, so its plan, its hold and its visit live
 * the launch as they do in the app. Only what it stands on is reshaped:
 * the current app's `Garden` and `Passages` here are the last read of the
 * garden's file (`readGarden`, which writes nothing), taken at the start of
 * each call; its `Dictation` is the port's recital, listening or not; its
 * store holds the minutes Settings chose, and its clock is the clock of the
 * call under way, so every making reads the call's instant. Each command
 * runs through the runner on the call's clock and seed.
 */

import { runCall, type Host } from '@manna/exact-kit/effect';
import type { FileStorage } from '@manna/exact-kit/storage';
import { Dictation, type DictationView } from '@manna/heartseed/dictation';
import { Garden, type GardenView } from '@manna/heartseed/garden';
import { Passages, type PassagesView } from '@manna/heartseed/passages';
import type { Minutes } from '@manna/heartseed/session';
import {
  layer as sessionLayer,
  MINUTES_KEY,
  Session,
  type SessionView,
} from '@manna/heartseed/session/service';
import { Clock, Context, Effect, Layer, Logger, Option, Scope, Stream } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { readGarden } from '../garden/program';

/** What a making plans from: the garden and the passages as the last read found them. */
export interface Ground {
  readonly garden: GardenView;
  readonly passages: PassagesView;
}

/** A call's time and seed, as Exact hands them. */
export interface Call {
  readonly now: number;
  readonly seed: number;
}

/** The session's view after a command, and the ground it was made on. */
export interface Ran {
  readonly view: SessionView;
  readonly ground: Ground;
}

const UNREAD: Ground = { garden: { _tag: 'Unread' }, passages: { _tag: 'Unread' } };

/** A recital at rest or under way, as the session reads Dictation: only whether it listens matters to a making. */
export const recitalOf = (listening: boolean): DictationView => {
  const absent = Option.getOrNull(Option.none());
  const at = { engine: absent, verse: absent, matcher: absent, ended: absent };
  if (listening) return { status: 'listening', ...at };
  return { status: 'idle', ...at };
};

type SessionCommands = Session['Service'];

/** The clock before the first call: it stands at 0 and never sleeps; every command runs on its call's clock instead. */
const STILL: Clock.Clock = {
  currentTimeMillisUnsafe: () => 0,
  currentTimeMillis: Effect.succeed(0),
  currentTimeNanosUnsafe: () => 0n,
  currentTimeNanos: Effect.succeed(0n),
  monotonicTimeNanosUnsafe: () => 0n,
  monotonicTimeNanos: Effect.succeed(0n),
  sleep: () => Effect.void,
};

/** What a stand-in never answers: the session asks it for nothing else. */
const unasked = Effect.die('the session asks its stand-in for its view alone');

/** The session of one launch over `storage`'s garden file, with no pieces of its own and no collections taught. */
export const makeLive = (options: { readonly host?: Host; readonly quiet?: boolean } = {}) => {
  let ground = UNREAD;
  let listening = false;
  let callClock = STILL;
  let session: Option.Option<SessionCommands> = Option.none();

  const now = () => callClock;
  const forwarding: Clock.Clock = {
    currentTimeMillisUnsafe: () => now().currentTimeMillisUnsafe(),
    currentTimeMillis: Effect.suspend(() => now().currentTimeMillis),
    currentTimeNanosUnsafe: () => now().currentTimeNanosUnsafe(),
    currentTimeNanos: Effect.suspend(() => now().currentTimeNanos),
    monotonicTimeNanosUnsafe: () => now().monotonicTimeNanosUnsafe(),
    monotonicTimeNanos: Effect.suspend(() => now().monotonicTimeNanos),
    sleep: (duration) => Effect.suspend(() => now().sleep(duration)),
  };

  const standIns = Layer.mergeAll(
    Layer.succeed(
      Garden,
      Garden.of({
        view: Effect.sync(() => ground.garden),
        settled: Effect.sync(() => ground.garden),
        changes: Stream.empty,
      }),
    ),
    Layer.succeed(
      Passages,
      Passages.of({
        view: Effect.sync(() => ground.passages),
        changes: Stream.empty,
        add: () => unasked,
        join: () => unasked,
        part: () => unasked,
        remove: () => unasked,
        plant: () => unasked,
        uproot: () => unasked,
      }),
    ),
    Layer.succeed(
      Dictation,
      Dictation.of({
        start: () => unasked,
        finish: unasked,
        cancel: unasked,
        peek: () => unasked,
        engines: unasked,
        view: Effect.sync(() => recitalOf(listening)),
        changes: Stream.empty,
        endings: Stream.empty,
      }),
    ),
  );

  /** The store the session reads its minutes from at its build: Settings' choice. */
  const storeWith = (minutes: Minutes) =>
    Layer.effect(
      KeyValueStore.KeyValueStore,
      Effect.gen(function* () {
        const store = yield* KeyValueStore.KeyValueStore;
        yield* Effect.orDie(store.set(MINUTES_KEY, String(minutes)));
        return store;
      }),
    ).pipe(Layer.provide(KeyValueStore.layerMemory));

  /** The session of this launch, built at its first command with the minutes chosen then. */
  const sessionFor = (minutes: Minutes) =>
    Option.match(session, {
      onSome: Effect.succeed,
      onNone: () =>
        Effect.gen(function* () {
          const scope = yield* Scope.make();
          const context = yield* Layer.buildWithScope(
            sessionLayer([]).pipe(Layer.provide(Layer.merge(standIns, storeWith(minutes)))),
            scope,
          ).pipe(Effect.provideService(Clock.Clock, forwarding));
          const built = Context.get(context, Session);
          session = Option.some(built);
          return built;
        }),
    });

  const quietly = <A>(program: Effect.Effect<A>) => {
    if (options.quiet === true) return Effect.provide(program, Logger.layer([]));
    return program;
  };

  /**
   * Reads the garden from `storage`, then runs `command` on the launch's
   * session with the recital `recital` and the minutes `minutes` (the build's
   * when it is the first), on the call's clock; answers the session's view.
   */
  const run = (
    storage: FileStorage,
    call: Call,
    recital: boolean,
    minutes: Minutes,
    command: (each: SessionCommands) => Effect.Effect<void>,
  ): Promise<Ran> =>
    runCall(
      quietly(
        Effect.gen(function* () {
          callClock = yield* Clock.Clock;
          const read = yield* readGarden(storage);
          ground = { garden: read.garden, passages: read.passages };
          listening = recital;
          const each = yield* sessionFor(minutes);
          yield* command(each);
          return { view: yield* each.view, ground };
        }),
      ),
      call,
      options.host,
    );

  return { run };
};

export type Live = ReturnType<typeof makeLive>;
