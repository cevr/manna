/* oxlint-disable effect/noAsyncFunction, effect/noNewPromise, effect/noNullish, effect/noTernary, effect/noGlobals -- a test model: the port's sources answer with promises as Exact's do, the oracle runs the current app's services by `Effect.runPromise` under a TestClock, and the zone is the process's own, as the device's is. */

/**
 * The session's model for its generated tests (spec A1 to A3). Two sides
 * run one reader's steps: the port, its Today and garden sources over a
 * stand-in for Exact's storage, each called inside the data host as the
 * Contract calls it; and the oracle, the current Heartseed's own `Garden`,
 * `Passages`, FSRS and `Session`, built once per launch over
 * `KeyValueStore.layerMemory` under a `TestClock` set to the step's
 * instant, with a Dictation that listens while the reader recites. The
 * zone is the process's (`TZ`), read by both sides through `offsetAt`, as
 * the device's is on a phone.
 */

import { withDataHost } from '@manna/exact-kit/data-host/testing';
import { cueIn, Garden, type GardenView, type ReadGarden } from '@manna/heartseed/garden';
import { Dictation } from '@manna/heartseed/dictation';
import { tendedOf } from '@manna/heartseed/home/grown';
import { Passages } from '@manna/heartseed/passages';
import { countsOf } from '@manna/heartseed/session';
import { shownOf } from '@manna/heartseed/session/run';
import { layer as sessionLayer, Session, type SessionView } from '@manna/heartseed/session/service';
import { Context, Effect, Exit, Layer, Option, Scope, Stream } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import { TestClock } from 'effect/testing';

import { slugOf } from '../garden/view';
import { gardenSources } from '../garden/sources';
import { recitalOf, makeLive } from '../session/live';
import { sessionWire, todaySources, type SessionWire } from '../today/sources';
import { appGrounds, QUIET_TEST_CLOCK, storageOf, type AppServices } from './garden-model';

/** Zones a history's device takes, among them the half-hour and the quarter-hour ones. */
export const ZONES: readonly string[] =
  'America/New_York UTC Asia/Kolkata Asia/Kathmandu Australia/Adelaide America/St_Johns Pacific/Chatham Pacific/Honolulu Europe/Berlin'.split(
    ' ',
  );

/** Sets the device's zone for both sides. */
export const setZone = (zone: string) => {
  process.env.TZ = zone;
};

const HOST = { turn: withDataHost, wait: () => Promise.resolve() };

/** What both sides show after a step, as plain data. */
export interface Seen {
  readonly wire: SessionWire;
  /** The item shown, its words and cue, the counts and the end, when Today runs the session. */
  readonly shown: {
    readonly reference: string;
    readonly text: string;
    readonly cue: string;
    readonly counts: string;
    readonly ended: boolean;
    readonly grown: readonly { reference: string; slug: string; stage: string }[];
  };
}

/** The item `view` shows over `garden`, and its piece: none at the end or before a plan. */
export const showingOf = (view: SessionView, garden: GardenView) => {
  const read = garden._tag === 'Read' ? Option.some<ReadGarden>(garden) : Option.none();
  const shown = shownOf(view, read);
  if (shown._tag === 'Item') return Option.some(shown);
  return Option.none();
};

/** What the current app's Today shows for `view` over `garden` at rest: the item, its text and cue, the counts and the end. */
export const seenOf = (view: SessionView, garden: GardenView): Seen => {
  const read = garden._tag === 'Read' ? Option.some<ReadGarden>(garden) : Option.none();
  const showing = showingOf(view, garden);
  const ended = tendedOf(view, read);
  return {
    wire: sessionWire(view),
    shown: {
      reference: Option.match(showing, {
        onNone: () => '',
        onSome: (each) => each.piece.reference,
      }),
      text: Option.match(showing, { onNone: () => '', onSome: (each) => each.piece.text }),
      cue: Option.match(showing, {
        onNone: () => '',
        onSome: (each) => (garden._tag === 'Read' ? cueIn(garden, each.piece.reference) : 'full'),
      }),
      counts: Option.getOrElse(
        Option.flatMap(Option.all({ plan: view.plan, garden: read }), ({ plan, garden: planted }) =>
          Option.some(countsOf(plan, planted)),
        ),
        () => '',
      ),
      ended: Option.isSome(ended),
      grown: Option.getOrElse(
        Option.map(ended, (grown) =>
          grown.map((each) => ({
            reference: each.reference,
            slug: slugOf(each.reference),
            stage: each.stage,
          })),
        ),
        () => [],
      ),
    },
  };
};

type OracleServices = AppServices | Session;

/**
 * The oracle: the current app's services and its `Session` over one memory
 * store, built again at each relaunch as a launch builds them, and a
 * Dictation that listens while `listening` holds.
 */
export const makeSessionOracle = async () => {
  const store = await Effect.runPromise(
    Effect.map(Layer.build(KeyValueStore.layerMemory).pipe(Effect.scoped), (ctx) =>
      Context.get(ctx, KeyValueStore.KeyValueStore),
    ),
  );
  const recital = { listening: false };
  const dictation = Layer.succeed(
    Dictation,
    Dictation.of({
      start: () => Effect.void,
      finish: Effect.void,
      cancel: Effect.void,
      peek: () => Effect.void,
      engines: Effect.succeed([]),
      view: Effect.sync(() => recitalOf(recital.listening)),
      changes: Stream.empty,
      endings: Stream.empty,
    }),
  );
  let scope = await Effect.runPromise(Scope.make());
  const build = () =>
    Effect.runPromise(
      Layer.buildWithScope(
        sessionLayer([]).pipe(
          Layer.provideMerge(Layer.mergeAll(appGrounds, dictation)),
          Layer.provide(Layer.succeed(KeyValueStore.KeyValueStore, store)),
          Layer.provideMerge(QUIET_TEST_CLOCK),
        ),
        scope,
      ),
    );
  let context: Option.Option<Context.Context<OracleServices>> = Option.none();
  const built = async () => {
    if (Option.isSome(context)) return context.value;
    const made = await build();
    context = Option.some(made);
    return made;
  };
  const at = async <A>(now: number, effect: Effect.Effect<A, never, OracleServices>) =>
    Effect.runPromise(
      Effect.andThen(TestClock.setTime(now), effect).pipe(Effect.provideContext(await built())),
    );
  const session = <A>(now: number, command: (each: Session['Service']) => Effect.Effect<A>) =>
    at(now, Effect.flatMap(Session, command));
  const viewAt = (now: number) =>
    at(
      now,
      Effect.all({
        session: Effect.flatMap(Session, (each) => each.view),
        garden: Effect.flatMap(Garden, (each) => each.view),
        passages: Effect.flatMap(Passages, (each) => each.view),
      }),
    );
  return {
    recital,
    at,
    session,
    viewAt,
    relaunch: async () => {
      await Effect.runPromise(Scope.close(scope, Exit.void));
      scope = await Effect.runPromise(Scope.make());
      context = Option.none();
      recital.listening = false;
    },
  };
};

export type SessionOracle = Awaited<ReturnType<typeof makeSessionOracle>>;

/** The port: Today's and the garden's sources of one launch over a storage stand-in, called inside the data host. */
export const makeSessionPort = (stand: ReturnType<typeof storageOf> = storageOf()) => {
  const make = () =>
    todaySources(gardenSources({ host: HOST, quiet: true }), makeLive({ host: HOST, quiet: true }));
  let sources = make();
  const call = <A>(name: keyof ReturnType<typeof make>, args: readonly unknown[]): Promise<A> =>
    withDataHost(() =>
      Reflect.apply(sources[name], undefined, [args, { forget: () => undefined }, stand.storage]),
    ) as Promise<A>;
  return {
    ...stand,
    call,
    relaunch: () => {
      sources = make();
    },
  };
};

export type SessionPort = ReturnType<typeof makeSessionPort>;
