/* oxlint-disable effect/noNewPromise, effect/noTryCatch, effect/noUnknownParameters -- the probe is Exact's answer boundary: it hands the answer a Promise of what a run did, a throw or a rejection read as text */
import { runCall, runCallSync, type Call, type Host } from '@manna/exact-kit/effect';
import {
  Clock,
  Context,
  Effect,
  Fiber,
  Layer,
  Match,
  Option,
  Order,
  PubSub,
  Record as Rec,
  Random,
  Schedule,
  Schema,
  Semaphore,
  Stream,
  Array as Arr,
} from 'effect';
import { KeyValueStore } from 'effect/persistence';

/** How a probe row runs: with Effect's own defaults, or through `@manna/exact-kit/effect`'s runner. */
export const MODES = ['defaults', 'runner'] as const;

/** One of `MODES`. */
export type Mode = (typeof MODES)[number];

/** A row of the probe: plain code, an effect run at once, or an effect that may wait. */
type Row =
  | { readonly kind: 'pure'; readonly run: () => unknown }
  | { readonly kind: 'sync'; readonly run: Effect.Effect<unknown> }
  | { readonly kind: 'async'; readonly run: Effect.Effect<unknown, unknown> };

class Greeter extends Context.Service<Greeter, { readonly greet: (name: string) => string }>()(
  'lab/Greeter',
) {}

const Verse = Schema.Struct({ book: Schema.String, chapter: Schema.Finite });

const ROWS = {
  import: { kind: 'pure', run: () => Effect.succeed },
  option: { kind: 'pure', run: () => Option.getOrThrow(Option.map(Option.some(1), (n) => n + 1)) },
  match: {
    kind: 'pure',
    run: () =>
      Match.value({ _tag: 'a' as const }).pipe(
        Match.when({ _tag: 'a' }, () => 1),
        Match.exhaustive,
      ),
  },
  schema: {
    kind: 'pure',
    run: () => Schema.decodeSync(Verse)({ book: 'John', chapter: 3 }),
  },
  order: { kind: 'pure', run: () => Arr.sort([3, 1, 2], Order.Number) },
  'run-sync': { kind: 'sync', run: Effect.succeed(1) },
  sleep: { kind: 'async', run: Effect.sleep('20 millis') },
  clock: { kind: 'async', run: Clock.currentTimeMillis },
  random: { kind: 'async', run: Random.next },
  fork: {
    kind: 'async',
    run: Effect.gen(function* () {
      const child = yield* Effect.forkChild(Effect.as(Effect.sleep('5 millis'), 2));
      return yield* Fiber.join(child);
    }),
  },
  layer: {
    kind: 'async',
    run: Effect.provide(
      Effect.gen(function* () {
        const greeter = yield* Greeter;
        return greeter.greet('lab');
      }),
      Layer.effect(
        Greeter,
        Effect.sync(() => ({ greet: (name: string) => `hello ${name}` })),
      ),
    ),
  },
  'stream-pubsub': {
    kind: 'async',
    run: Effect.gen(function* () {
      const pubsub = yield* PubSub.unbounded<number>();
      const taken = yield* Effect.forkChild(
        Stream.runCollect(Stream.take(Stream.fromPubSub(pubsub), 3)),
      );
      yield* Effect.sleep('1 millis');
      yield* PubSub.publishAll(pubsub, [1, 2, 3]);
      return yield* Fiber.join(taken);
    }),
  },
  semaphore: {
    kind: 'async',
    run: Effect.gen(function* () {
      const gate = yield* Semaphore.make(1);
      return yield* Effect.forEach(
        [1, 2, 3],
        (n) => Semaphore.withPermit(gate, Effect.as(Effect.sleep('1 millis'), n)),
        { concurrency: 'unbounded' },
      );
    }),
  },
  'key-value-store': {
    kind: 'async',
    run: Effect.provide(
      Effect.gen(function* () {
        const store = yield* KeyValueStore.KeyValueStore;
        yield* store.set('verse', 'John 3:16');
        return yield* store.get('verse');
      }),
      KeyValueStore.layerMemory,
    ),
  },
  scope: {
    kind: 'async',
    run: Effect.scoped(
      Effect.acquireRelease(
        Effect.sync(() => new Map<string, string>()),
        (held) => Effect.sync(() => held.clear()),
      ),
    ),
  },
  log: { kind: 'async', run: Effect.log('lab') },
  span: { kind: 'async', run: Effect.withSpan(Effect.succeed(1), 'lab.span') },
  retry: {
    kind: 'async',
    run: Effect.fail('no').pipe(
      Effect.retry({ times: 2, schedule: Schedule.jittered(Schedule.spaced('1 millis')) }),
      Effect.orElseSucceed(() => 'gave up'),
    ),
  },
} as const satisfies Record<string, Row>;

type RowId = keyof typeof ROWS;

const ROW_IDS: ReadonlyArray<RowId> = Rec.keys(ROWS);

/** Each row in each mode, `<row>-<mode>`, in the order the lab shows them: the keys of `probe-table.json`. */
export const KEYS: ReadonlyArray<string> = ROW_IDS.flatMap((id) =>
  MODES.map((mode) => `${id}-${mode}`),
);

/**
 * The refused calls by what they read: each host reaches the clock by its own first call (Bun's Effect asks
 * `process.hrtime` and then `Date.now()`, Hermes's `performance.now()`), so the table names the clock, not the call.
 */
const REFUSED = [
  ['Date.now()', 'clock'],
  ['Date()', 'clock'],
  ['new Date()', 'clock'],
  ['performance.now()', 'clock'],
  ['Math.random()', 'random'],
  ['setInterval()', 'timer'],
  ['requestAnimationFrame()', 'timer'],
] as const;

const messageOf = (thrown: unknown) => {
  if (thrown instanceof Error) return thrown.message;
  return String(thrown);
};

/** What a thrown value says: Exact's refusals by what they read (`refused clock`), anything else by its message. */
const said = (thrown: unknown) => {
  const message = messageOf(thrown);
  return Option.match(
    Option.fromNullishOr(/^(.+?) is unavailable in data sources/.exec(message)?.[1]),
    {
      onNone: () => message,
      onSome: (call) =>
        `refused ${Option.getOrElse(
          Option.map(
            Arr.findFirst(REFUSED, ([api]) => api === call),
            ([, kind]) => kind,
          ),
          () => call,
        )}`,
    },
  );
};

const outcome = (run: () => unknown): Promise<string> => {
  try {
    return Promise.resolve(run()).then(
      () => 'ran',
      (thrown: unknown) => said(thrown),
    );
  } catch (thrown) {
    return Promise.resolve(said(thrown));
  }
};

/**
 * Runs row `id` in `mode` for the call `call`, and says how it went: `ran`, or what it threw. `host` is the runner's
 * (a test's own wait and turn); with Effect's defaults only its `turn` is used, around the start.
 */
const probeRow = (id: RowId, mode: Mode, call: Call, host: Host): Promise<string> => {
  const row: Row = ROWS[id];
  const turn = host.turn ?? (<A>(f: () => A) => f());
  if (mode === 'defaults') {
    if (row.kind === 'pure') return outcome(() => turn(row.run));
    if (row.kind === 'sync') return outcome(() => turn(() => Effect.runSync(row.run)));
    const effect = row.run;
    return outcome(() => turn(() => Effect.runPromise(effect)));
  }
  if (row.kind === 'pure') {
    const pure = row.run;
    return outcome(() => runCallSync(Effect.sync(pure), call, host));
  }
  if (row.kind === 'sync') {
    const effect = row.run;
    return outcome(() => runCallSync(effect, call, host));
  }
  const effect = row.run;
  return outcome(() => runCall(effect, call, host));
};

/**
 * Runs the probe `key` (one of `KEYS`) for the call `call`, and says how it went: `ran`, or what it threw. `host` is the
 * runner's (a test's own wait and turn); with Effect's defaults only its `turn` is used, around the start.
 */
export const probe = (key: string, call: Call, host: Host = {}): Promise<string> => {
  const at = key.lastIndexOf('-');
  const id = ROW_IDS.find((row) => row === key.slice(0, at));
  const mode = MODES.find((m) => m === key.slice(at + 1));
  if (!id || !mode) return Promise.resolve(`no probe ${key}`);
  return probeRow(id, mode, call, host);
};
