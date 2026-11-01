// The cast build's stage graph and its cache. A stage is `{ id, view?,
// inputs, version, config?, run }`; its key is the SHA-256 of its id, its
// version, its config and the hash of each input, where an input is a file's
// bytes, named by its path from the checkout's root (so every checkout reads
// the same keys), or an upstream stage's output. A stage's output is bytes, kept in
// the cache as `objects/<sha256>`, and `build.json` (a `ContentStore`
// manifest) maps each key to its output's hash and the stage's wall time,
// with what the run noted (`ctx.note`) and the USD it counted, read
// downstream through `ctx.built`.
// A stage whose key is in the manifest is `cached` and does not run; one
// that reruns and makes the same bytes leaves every stage below it cached
// (early cutoff), since their keys read its output's hash, not its inputs.
//
// A stage spends (okra, Modal) only through `ctx.spend`, which runs the
// spend when the build's `spend` names it and otherwise fails the stage as
// `waiting-spend`; a stage that needs the owner fails as `waiting-owner`.
// Neither is cached, so the next build asks again; the manifest keeps only
// what it waited on, by key. Every stage below a waiting or failed stage
// takes its state without running. `plan` runs no stage and reads nothing but
// the cache and the input files (no lab, no network): one whose key is not
// in the manifest is `stale`, and so is every stage below it, its output
// unknown, unless it last waited at that key, when it waits again (a plan
// granted its spend calls it stale); `touch` plans as if those files changed.
//
// A stage is decided under the manifest's lock (`ContentStore.transact`),
// runs outside it, and is recorded under it again, so a plan or another build
// reads the manifest while a 29 min train runs. The decision to run marks the
// key as running (by build, pid, host, start and heartbeat); the build renews
// the heartbeat every `HEARTBEAT` while the stage runs. A second build that
// finds a live mark waits and decides again, sooner at first and then every
// `BUSY_MOST` (the run it waits on may take an hour), so two builds never run
// one stage. A run that dies lets its mark go; a mark whose process is gone on
// this host, or from another host that this build has read unchanged for
// `RUNNING_LEASE_MS` of its own clock, is cleared and taken over. A build
// records what it ran only while its mark still holds the key (fencing): one
// whose mark was taken discards its output and reports it. What a stage
// writes outside the cache under the name its key owns (the reader's
// checkpoint on its volume) it writes first under the build's own name
// (`StageContext.run`), and its `promote` makes it the key's under the lock,
// while the mark holds the key, so a fenced run's write is never the key's.
// A promote that fails leaves the output recorded with its run unpromoted; the
// next build takes the key's mark and promotes that run again, and runs the
// stage again only if it no longer has the output.
// An optional input (`optionalInput`) holds its stage only while it is stale in
// a plan: a stage reading what this build made of a set (the training set) runs
// over the inputs that did not wait or fail.

import {
  Array as Arr,
  Clock,
  Effect,
  Exit,
  FileSystem,
  Option,
  Path,
  Random,
  Result,
  Schedule,
  Schema,
} from 'effect';
import { ContentStore, type Manifest, Processes } from '../content-store.ts';
import { sha256Hex } from '../digest.ts';

/** What a stage may spend: okra calls (the subscription route) or a Modal run. */
export const Spend = Schema.Literals(['okra', 'modal']);
export type Spend = typeof Spend.Type;

const StageState = Schema.Literals([
  'cached',
  'ran',
  'stale',
  'waiting-spend',
  'waiting-owner',
  'failed',
]);
type StageState = typeof StageState.Type;

/**
 * A stage's input: a file's bytes, an upstream stage's output, or an optional
 * upstream stage's: one that waits or failed does not hold the stage, which
 * runs without it (its key reads it as held); one stale in a plan does.
 */
export type Input =
  | { readonly _tag: 'File'; readonly path: string }
  | { readonly _tag: 'Stage'; readonly id: string }
  | { readonly _tag: 'Optional'; readonly id: string };

/** How an upstream input's line in a key is named, by its kind. */
const LINE = { Stage: 'stage', Optional: 'optional' } as const;

export const fileInput = (path: string): Input => ({ _tag: 'File', path });
export const stageInput = (id: string): Input => ({ _tag: 'Stage', id });
export const optionalInput = (id: string): Input => ({ _tag: 'Optional', id });

/** The stage would spend, and the build's `--spend` does not name it. */
class WaitingSpend extends Schema.TaggedError<WaitingSpend>()('WaitingSpend', {
  spend: Spend,
}) {}

/** The stage needs the owner: a drawing to draw or keep. */
export class WaitingOwner extends Schema.TaggedError<WaitingOwner>()('WaitingOwner', {
  reason: Schema.String,
}) {}

/** The stage ran and could not make its output. */
export class StageFailed extends Schema.TaggedError<StageFailed>()('StageFailed', {
  reason: Schema.String,
}) {}

/** The stages do not form a graph in order: one names a stage not before it, or two share an id. */
class GraphInvalid extends Schema.TaggedError<GraphInvalid>()('GraphInvalid', {
  reason: Schema.String,
}) {}

/** What a stage's run reads through: its inputs' bytes, and the one gate on spending. */
export interface StageContext {
  /** An input file's bytes. */
  readonly file: (path: string) => Effect.Effect<Uint8Array, StageFailed>;
  /** An upstream stage's output bytes. */
  readonly output: (id: string) => Effect.Effect<Uint8Array, StageFailed>;
  /** The cache file holding an upstream stage's output, for a tool that reads a path (a 95 MB checkpoint). */
  readonly outputPath: (id: string) => Effect.Effect<string, StageFailed>;
  /** Whether an upstream stage has an output in this build (an optional input that did not wait or fail). */
  readonly known: (id: string) => boolean;
  /** The cache's object `hash`, only when it is there and its bytes hash to it: what an earlier build made, kept by its content. */
  readonly object: (hash: string) => Effect.Effect<Option.Option<Uint8Array>>;
  /** This build's own name, which no other build shares: what a stage writes outside the cache is named by it until `promote`. */
  readonly run: string;
  /** Run `effect`, which spends `kind`, when the build allows it; else the stage waits. */
  readonly spend: <A, E, R>(
    kind: Spend,
    effect: Effect.Effect<A, E, R>,
    usd?: number,
  ) => Effect.Effect<A, E | WaitingSpend, R>;
  /** Keep `text` beside this run's output in `build.json`: what the run reported (a train's fit), read by `built`. It is in no key. */
  readonly note: (text: string) => Effect.Effect<void>;
  /** An upstream stage's record in `build.json`: its key, output, wall time, note and counted spend, as the run that made it left them. */
  readonly built: (id: string) => Effect.Effect<BuiltRecord, StageFailed>;
}

/** A stage's record as `build.json` keeps it, by key. */
export interface BuiltRecord {
  readonly key: string;
  readonly output: string;
  readonly ms: number;
  readonly note: Option.Option<string>;
  readonly usd: Option.Option<number>;
}

export interface Stage<R> {
  readonly id: string;
  /** The coverage entry it serves (`turnaround-front`, `raise/k2`). */
  readonly view?: string;
  readonly inputs: ReadonlyArray<Input>;
  /** Changed when the stage's code makes other bytes from the same inputs. */
  readonly version: string;
  /** Settings that change its output, as text (JSON). */
  readonly config?: string;
  readonly run: (ctx: StageContext) => Effect.Effect<Uint8Array, StageError, R>;
  /**
   * Make what `run` wrote outside the cache under `ctx.run` the key's own. It
   * runs under the manifest's lock, only while this build's mark holds the
   * key, before the output is recorded. When it fails, the output is still
   * recorded, with `ctx.run` unpromoted, and the next build promotes that run
   * again before the stage would run again: a paid run is never thrown away.
   */
  readonly promote?: (ctx: StageContext) => Effect.Effect<void, StageFailed, R>;
  /**
   * Whether a cached output still answers its key: one that no longer does
   * (the ask it names was closed) is run again as if never built. A plan does
   * not ask it: it may read the live lab, and a plan reads only the cache, so
   * it plans from the output last recorded.
   */
  readonly holds?: (output: Uint8Array) => Effect.Effect<boolean, StageFailed, R>;
}

/** The ways a stage's run ends other than with its output. */
type StageError = WaitingSpend | WaitingOwner | StageFailed;

interface BuildOptions {
  /**
   * The checkout's root: a file input is keyed by its path from here, so a
   * key reads the same in every checkout and the one cache serves them all.
   * A file input outside it is refused (`GraphInvalid`).
   */
  readonly root: string;
  /** The cache folder: `objects/` and `build.json`. */
  readonly cache: string;
  /** Run nothing; report what would run. */
  readonly plan: boolean;
  /** Files planned as changed. */
  readonly touch: ReadonlyArray<string>;
  /** What the build may spend. */
  readonly spend: ReadonlySet<Spend>;
}

export const StageReport = Schema.Struct({
  id: Schema.String,
  view: Schema.OptionFromOptionalKey(Schema.String),
  state: StageState,
  ms: Schema.Finite,
  key: Schema.OptionFromNullOr(Schema.String),
  reason: Schema.OptionFromOptionalKey(Schema.String),
});
export interface StageReport extends Schema.Schema.Type<typeof StageReport> {}

export const BuildReport = Schema.Struct({
  stages: Schema.Array(StageReport),
  okraCalls: Schema.Finite,
  modalCalls: Schema.Finite,
  spendUsd: Schema.Finite,
});
export interface BuildReport extends Schema.Schema.Type<typeof BuildReport> {}

/**
 * A run whose output is recorded but whose `promote` failed: the build that
 * wrote it (its write outside the cache is still named by it, the reader's
 * `/runs/<key>/<run>.pt`) and why the promote failed. The next build promotes
 * it again before anything would run the stage again.
 */
const Unpromoted = Schema.Struct({ run: Schema.String, reason: Schema.String });

/**
 * A stage's result as `build.json` keeps it, by key: its output's hash, the
 * wall time of the run that made it, the note it left (`ctx.note`), the USD
 * it counted (`ctx.spend`, when above 0) and, while its promote has not held,
 * the run it left unpromoted.
 */
const Built = Schema.Struct({
  id: Schema.String,
  output: Schema.String,
  ms: Schema.Finite,
  note: Schema.optionalKey(Schema.String),
  usd: Schema.optionalKey(Schema.Finite),
  unpromoted: Schema.optionalKey(Unpromoted),
});

/**
 * A stage whose last run at a key waited, by key: what it waited on, so a plan
 * reports it waiting rather than stale. A build runs it again (the spend may be
 * granted now, the owner may have answered).
 */
const Waited = Schema.Struct({
  id: Schema.String,
  state: Schema.Literals(['waiting-spend', 'waiting-owner']),
  spend: Schema.optionalKey(Spend),
  reason: Schema.String,
});

/** A key a build runs now, outside the lock: which build, its process and host, when it took the key and its last heartbeat (epoch ms). */
const Running = Schema.Struct({
  build: Schema.String,
  pid: Schema.Finite,
  host: Schema.String,
  at: Schema.optionalKey(Schema.Finite),
  beat: Schema.optionalKey(Schema.Finite),
});
type Running = typeof Running.Type;

const BuildManifest = Schema.Struct({
  stages: Schema.Record(Schema.String, Built),
  waited: Schema.optionalKey(Schema.Record(Schema.String, Waited)),
  running: Schema.optionalKey(Schema.Record(Schema.String, Running)),
});
type BuildManifest = typeof BuildManifest.Type;

const manifestIn = (path: Path.Path, cache: string): Manifest<BuildManifest> => ({
  file: path.join(cache, 'build.json'),
  codec: Schema.fromJsonString(BuildManifest),
  empty: { stages: {} },
});

/** The output the cache keeps for a stage's `key` (a report's), or none when it keeps none. */
export const builtOutput = Effect.fn('cast.build.output')(function* (cache: string, key: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const current = yield* (yield* ContentStore).read(manifestIn(path, cache));
  const built = Option.fromUndefinedOr(current.stages[key]);
  if (Option.isNone(built)) return Option.none<Uint8Array>();
  return yield* fs.readFile(path.join(cache, 'objects', built.value.output)).pipe(Effect.option);
});

/** A stage's place in this build: its output's hash once known, else the state that holds the stages below it. */
type Decided =
  | { readonly _tag: 'Known'; readonly output: string; readonly key: string }
  | { readonly _tag: 'Held'; readonly state: StageState };

/** The order check: every stage input names a stage before it, and no id repeats. */
const checkOrder = <R>(stages: ReadonlyArray<Stage<R>>) => {
  const seen = new Set<string>();
  for (const stage of stages) {
    if (seen.has(stage.id)) return Option.some(`${stage.id} is named twice`);
    for (const input of stage.inputs)
      if (input._tag !== 'File' && !seen.has(input.id))
        return Option.some(`${stage.id} reads ${input.id}, which is not before it`);
    seen.add(stage.id);
  }
  return Option.none<string>();
};

/** A file input's path from `root`, or none when it lies outside `root`. */
const fromRoot = (path: Path.Path, root: string, file: string) => {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  if (relative.startsWith('..') || path.isAbsolute(relative)) return Option.none<string>();
  return Option.some(relative);
};

/** The root check: every file input lies under `root`, since its key names it from there. */
const checkRoot = <R>(path: Path.Path, root: string, stages: ReadonlyArray<Stage<R>>) => {
  for (const stage of stages)
    for (const input of stage.inputs)
      if (input._tag === 'File' && Option.isNone(fromRoot(path, root, input.path)))
        return Option.some(`${stage.id} reads ${input.path}, outside the root ${root}`);
  return Option.none<string>();
};

/** How long a build waits before it first decides again on a key another build runs. */
const BUSY_FIRST = '100 millis';

/**
 * The longest a build waits between its decisions on a key another build
 * runs. Each decision takes the manifest's lock, which the running build's
 * heartbeat and record also take, so a long wait reads it at this pace.
 */
const BUSY_MOST = '5 seconds';

/** How often a build renews the marks of the stages it runs. */
const HEARTBEAT_MS = 60 * 1000;
const HEARTBEAT = Schedule.spaced(HEARTBEAT_MS);

/**
 * How long another host's mark holds its key once this host has read it
 * unchanged, on this host's clock: five heartbeats. Its pid cannot be asked
 * on this host, so past this the mark is taken as left by a build that died.
 * A live owner renews its mark however long its stage runs, so the lease does
 * not depend on any stage's timeout.
 */
const RUNNING_LEASE_MS = 5 * HEARTBEAT_MS;

/** The manifest with `key`'s mark renewed at `now`, when `build` holds it. */
const renewed = (
  current: BuildManifest,
  key: string,
  build: string,
  now: number,
): BuildManifest => {
  const mark = current.running?.[key];
  if (mark?.build !== build) return current;
  return { ...current, running: { ...current.running, [key]: { ...mark, beat: now } } };
};

/** Whether `build`'s mark holds `key`. */
const holds = (current: BuildManifest, key: string, build: string) =>
  current.running?.[key]?.build === build;

/** The manifest without `key`'s running mark, when `build` holds it. */
const unmarked = (current: BuildManifest, key: string, build: string): BuildManifest => {
  if (current.running?.[key]?.build !== build) return current;
  const { [key]: _done, ...running } = current.running;
  return { ...current, running };
};

/** How a stage's decision under the manifest's lock ended. */
type Outcome =
  | { readonly _tag: 'cached' | 'ran'; readonly output: string }
  | { readonly _tag: 'stale' }
  | {
      readonly _tag: 'waiting-spend' | 'waiting-owner' | 'failed';
      readonly reason: Option.Option<string>;
    };

/**
 * What a build decides under the lock: an outcome, a key another build runs
 * now, the run to make, or a recorded run's promote to make again.
 */
type Decision =
  | Outcome
  | { readonly _tag: 'busy' }
  | { readonly _tag: 'run' }
  | { readonly _tag: 'promote'; readonly output: string; readonly run: string };

/**
 * A busy decision's poll, until it is not busy: again after `BUSY_FIRST`,
 * then after twice the last wait, at most `BUSY_MOST`.
 */
const BUSY = {
  schedule: Schedule.min([Schedule.exponential(BUSY_FIRST), Schedule.spaced(BUSY_MOST)]),
  until: (decision: Decision) => decision._tag !== 'busy',
};

/** The state a stage takes from the stages above it that hold it: a waiting or failed one before a stale one. */
const heldBy = (states: ReadonlyArray<StageState>): Option.Option<StageState> =>
  Option.orElse(
    Arr.findFirst(states, (s) => s !== 'stale'),
    () => Arr.head(states),
  );

/** Build (or plan) `stages`, in their order, each over the outputs of the stages before it. */
export const buildGraph = Effect.fn('cast.build.graph')(function* <R>(
  stages: ReadonlyArray<Stage<R>>,
  options: BuildOptions,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const invalid = Option.orElse(checkOrder(stages), () => checkRoot(path, options.root, stages));
  if (Option.isSome(invalid)) return yield* GraphInvalid.make({ reason: invalid.value });
  const store = yield* ContentStore;
  const manifest = manifestIn(path, options.cache);
  const objects = path.join(options.cache, 'objects');
  const objectFile = (hash: string) => path.join(objects, hash);
  const touched = new Set(options.touch.map((p) => path.resolve(p)));
  const decided = new Map<string, Decided>();
  const counts = { okra: 0, modal: 0, usd: 0 };
  /** An upstream stage's output hash, once this build knows it. */
  const outputOf = (id: string): Option.Option<string> => {
    const known = decided.get(id);
    if (known?._tag === 'Known') return Option.some(known.output);
    return Option.none();
  };
  const processes = yield* Processes;
  const build = `${process.pid}-${yield* Random.nextIntBetween(0, 1e9)}`;
  /** What the running stage has noted and counted: stages run one at a time, so one tally serves, reset by each run. */
  const tally = { note: Option.none<string>(), usd: 0 };
  const ctx: StageContext = {
    run: build,
    note: (text) =>
      Effect.sync(() => {
        tally.note = Option.some(text);
      }),
    built: (id) =>
      Effect.gen(function* () {
        const known = decided.get(id);
        if (known?._tag !== 'Known') return yield* Effect.die(`${id} has no output in this build`);
        const current = yield* store
          .read(manifest)
          .pipe(Effect.mapError((e) => StageFailed.make({ reason: String(e) })));
        const record = Option.fromUndefinedOr(current.stages[known.key]);
        if (Option.isNone(record))
          return yield* StageFailed.make({
            reason: `${id}: build.json keeps no record of its key`,
          });
        const r = record.value;
        return {
          key: known.key,
          output: r.output,
          ms: r.ms,
          note: Option.fromUndefinedOr(r.note),
          usd: Option.fromUndefinedOr(r.usd),
        };
      }),
    file: (p) =>
      fs.readFile(p).pipe(Effect.mapError((e) => StageFailed.make({ reason: String(e) }))),
    output: (id) =>
      Option.match(outputOf(id), {
        onNone: () => Effect.die(`${id} has no output in this build`),
        onSome: (hash) =>
          fs
            .readFile(objectFile(hash))
            .pipe(Effect.mapError((e) => StageFailed.make({ reason: String(e) }))),
      }),
    outputPath: (id) =>
      Option.match(outputOf(id), {
        onNone: () => Effect.die(`${id} has no output in this build`),
        onSome: (hash) => Effect.succeed(objectFile(hash)),
      }),
    known: (id) => Option.isSome(outputOf(id)),
    object: (hash) =>
      fs
        .readFile(objectFile(hash))
        .pipe(Effect.option, Effect.map(Option.filter((bytes) => sha256Hex(bytes) === hash))),
    spend: (kind, effect, usd = 0) => {
      if (!options.spend.has(kind)) return Effect.fail(WaitingSpend.make({ spend: kind }));
      return Effect.sync(() => {
        counts[kind]++;
        counts.usd += usd;
        tally.usd += usd;
      }).pipe(Effect.andThen(effect));
    },
  };
  const fileHash = (p: string) =>
    fs.readFile(p).pipe(
      Effect.map((bytes) => sha256Hex(bytes)),
      Effect.orElseSucceed(() => 'absent'),
      Effect.map((hash) => {
        if (touched.has(path.resolve(p))) return `touched:${hash}`;
        return hash;
      }),
    );
  const inputLine = (input: Input) => {
    if (input._tag === 'File')
      // every file input lies under the root (`checkRoot`), so its line names no checkout
      return Option.match(fromRoot(path, options.root, input.path), {
        onNone: () => Effect.die(`${input.path} is outside the root ${options.root}`),
        onSome: (named) => fileHash(input.path).pipe(Effect.map((h) => `file:${named}=${h}`)),
      });
    return Effect.succeed(
      `${LINE[input._tag]}:${input.id}=${Option.getOrElse(outputOf(input.id), () => 'held')}`,
    );
  };
  /** This build's mark on a key it takes now. */
  const selfAt = Effect.map(Clock.currentTimeMillis, (at): Running => ({
    build,
    pid: process.pid,
    host: processes.host,
    at,
  }));
  /**
   * Each other host's mark this build has read, by key: the mark as written
   * (its build, start and beat) and when this host first read it so.
   */
  const seen = new Map<string, { readonly mark: string; readonly since: number }>();
  /**
   * Whether the build that marked a key runs it still: on this host, its
   * process runs; on another, whose pid and clock mean nothing here, this
   * host has read its mark change within the lease. The lease runs on this
   * host's clock from the first read of the mark as it stands, so the other
   * host's clock running ahead or behind neither frees a live key nor holds
   * a dead one.
   */
  const runs = (key: string, mark: Running) => {
    if (mark.host === processes.host) return processes.alive(mark.pid);
    const written = [mark.build, mark.at ?? '', mark.beat ?? ''].join(' ');
    return Effect.map(Clock.currentTimeMillis, (now) => {
      const last = seen.get(key);
      if (last?.mark === written) return now - last.since < RUNNING_LEASE_MS;
      seen.set(key, { mark: written, since: now });
      return true;
    });
  };
  /** Renew this build's mark on `key` every heartbeat, for as long as it runs. */
  const heartbeat = (key: string) =>
    Clock.currentTimeMillis.pipe(
      Effect.flatMap((now) =>
        store.update(manifest, (current) => renewed(current, key, build, now)),
      ),
      Effect.ignore,
      Effect.repeat(HEARTBEAT),
    );
  /** The outcome of a run whose mark was taken while it ran: its output is not recorded. */
  const fenced = (stage: { readonly id: string }) =>
    Effect.as(
      Effect.logWarning(
        `cast.build.fenced stage=${stage.id} reason="another build took its key while it ran; its output is discarded"`,
      ),
      {
        _tag: 'failed',
        reason: Option.some('another build took its key while it ran; its output is discarded'),
      } satisfies Outcome,
    );
  /** The manifest's marks that still run: a stale one is cleared. */
  const liveMarks = (current: BuildManifest) =>
    Effect.map(
      Effect.filter(Object.entries(current.running ?? {}), ([key, mark]) => runs(key, mark)),
      (live): BuildManifest => ({ ...current, running: Object.fromEntries(live) }),
    );
  /**
   * Record `outcome` and `change` under the lock while this build's mark holds
   * `key`, else discard them. A `promote` runs first: when it fails, the output
   * is still recorded, with the run it leaves unpromoted (`built`), so a paid
   * run is never thrown away and the next build promotes it again.
   */
  const recordUnder = <R>(
    stage: Stage<R>,
    key: string,
    outcome: Outcome,
    change: (done: BuildManifest) => BuildManifest,
    promote: Option.Option<{
      readonly run: string;
      readonly effect: Effect.Effect<void, StageFailed, R>;
      readonly built: (
        unpromoted: typeof Unpromoted.Type,
      ) => (done: BuildManifest) => BuildManifest;
    }> = Option.none(),
  ) =>
    store
      .transact(manifest, (current) => {
        if (!holds(current, key, build))
          return Effect.succeed([Option.none<Outcome>(), current] as const);
        const done = unmarked(current, key, build);
        const recorded = [Option.some(outcome), change(done)] as const;
        return Option.match(promote, {
          onNone: () => Effect.succeed(recorded),
          onSome: (p) =>
            p.effect.pipe(
              Effect.as(recorded),
              Effect.catchTag('StageFailed', (e) =>
                Effect.as(
                  Effect.logWarning(
                    `cast.build.promote-failed stage=${stage.id} key=${key} run=${p.run} reason="${e.reason}"`,
                  ),
                  [Option.some(outcome), p.built({ run: p.run, reason: e.reason })(done)] as const,
                ),
              ),
            ),
        });
      })
      .pipe(
        Effect.flatMap(
          Option.match({ onNone: () => fenced(stage), onSome: (o) => Effect.succeed(o) }),
        ),
      );
  /** Promote again a recorded output whose promote failed, under the lock while this build's mark holds its key. */
  const promoteOutside = <R>(
    stage: Stage<R>,
    key: string,
    pending: { readonly output: string; readonly run: string },
  ) =>
    Effect.suspend(() => {
      const effect = Option.match(Option.fromUndefinedOr(stage.promote), {
        onNone: () => Effect.void,
        onSome: (promote) => promote({ ...ctx, run: pending.run }),
      });
      const builtWith =
        (unpromoted: Option.Option<typeof Unpromoted.Type>) => (done: BuildManifest) =>
          Option.match(Option.fromUndefinedOr(done.stages[key]), {
            onNone: () => done,
            onSome: ({ unpromoted: _was, ...built }) => ({
              ...done,
              stages: {
                ...done.stages,
                [key]: Option.match(unpromoted, {
                  onNone: () => built,
                  onSome: (u) => ({ ...built, unpromoted: u }),
                }),
              },
            }),
          });
      return recordUnder(
        stage,
        key,
        { _tag: 'cached', output: pending.output },
        builtWith(Option.none()),
        Option.some({
          run: pending.run,
          effect,
          built: (u: typeof Unpromoted.Type) => builtWith(Option.some(u)),
        }),
      );
    }).pipe(
      Effect.onExit((exit) => {
        if (Exit.isSuccess(exit)) return Effect.void;
        return store
          .update(manifest, (current) => unmarked(current, key, build))
          .pipe(Effect.ignore);
      }),
    );
  /** Run a stage outside the lock, then record what it made, or what it waited on, under it. */
  const runOutside = <R>(stage: Stage<R>, key: string, start: number) =>
    Effect.gen(function* () {
      const record = (outcome: Outcome, change: (done: BuildManifest) => BuildManifest) =>
        recordUnder(stage, key, outcome, change);
      tally.note = Option.none();
      tally.usd = 0;
      const ran = yield* Effect.scoped(
        Effect.andThen(Effect.forkScoped(heartbeat(key)), stage.run(ctx)),
      ).pipe(
        Effect.map((bytes) => ({ _tag: 'made' as const, bytes })),
        Effect.catchTags({
          WaitingSpend: (e) =>
            Effect.succeed({
              _tag: 'waited' as const,
              waited: {
                id: stage.id,
                state: 'waiting-spend' as const,
                spend: e.spend,
                reason: `needs --spend ${e.spend}`,
              },
            }),
          WaitingOwner: (e) =>
            Effect.succeed({
              _tag: 'waited' as const,
              waited: { id: stage.id, state: 'waiting-owner' as const, reason: e.reason },
            }),
          StageFailed: (e) =>
            Effect.succeed<Outcome>({ _tag: 'failed', reason: Option.some(e.reason) }),
        }),
      );
      if (ran._tag === 'made') {
        const output = sha256Hex(ran.bytes);
        yield* store.writeFile(objectFile(output), ran.bytes);
        const ms = (yield* Clock.currentTimeMillis) - start;
        const made: typeof Built.Type = {
          id: stage.id,
          output,
          ms,
          ...Option.match(tally.note, { onNone: () => ({}), onSome: (note) => ({ note }) }),
          ...Option.match(
            Option.liftPredicate(tally.usd, (usd) => usd > 0),
            {
              onNone: () => ({}),
              onSome: (usd) => ({ usd }),
            },
          ),
        };
        const built =
          (unpromoted: Option.Option<typeof Unpromoted.Type>) => (done: BuildManifest) => ({
            ...done,
            stages: {
              ...done.stages,
              [key]: Option.match(unpromoted, {
                onNone: () => made,
                onSome: (u) => ({ ...made, unpromoted: u }),
              }),
            },
          });
        return yield* recordUnder(
          stage,
          key,
          { _tag: 'ran', output },
          built(Option.none()),
          Option.map(Option.fromUndefinedOr(stage.promote), (promote) => ({
            run: ctx.run,
            effect: promote(ctx),
            built: (u: typeof Unpromoted.Type) => built(Option.some(u)),
          })),
        );
      }
      if (ran._tag !== 'waited') return yield* record(ran, (done) => done);
      const waited = ran.waited;
      return yield* record({ _tag: waited.state, reason: Option.some(waited.reason) }, (done) => ({
        ...done,
        waited: { ...done.waited, [key]: waited },
      }));
    }).pipe(
      Effect.onExit((exit) => {
        if (Exit.isSuccess(exit)) return Effect.void;
        // a run that died or was interrupted lets its key go, so the next build runs it
        return store
          .update(manifest, (current) => unmarked(current, key, build))
          .pipe(Effect.ignore);
      }),
    );
  /** A decision's outcome: the run made, when it is this build's to make. */
  const settle = <R>(stage: Stage<R>, key: string, start: number, decision: Decision) => {
    if (decision._tag === 'run') return runOutside(stage, key, start);
    if (decision._tag === 'promote') return promoteOutside(stage, key, decision);
    if (decision._tag === 'busy')
      return Effect.die(`${stage.id} is settled while another build runs it`);
    return Effect.succeed<Outcome>(decision);
  };
  yield* fs.makeDirectory(objects, { recursive: true });
  const reports: Array<StageReport> = [];
  for (const stage of stages) {
    const start = yield* Clock.currentTimeMillis;
    const report = (state: StageState, key: Option.Option<string>, reason: Option.Option<string>) =>
      Clock.currentTimeMillis.pipe(
        Effect.map((end) => {
          reports.push({
            id: stage.id,
            view: Option.fromUndefinedOr(stage.view),
            state,
            ms: end - start,
            key,
            reason,
          });
        }),
      );
    const held = heldBy(
      stage.inputs.flatMap((input) => {
        if (input._tag === 'File') return [];
        const up = decided.get(input.id);
        // an optional input holds the stage only while its output may yet come (a plan's stale)
        if (up?._tag === 'Held' && (input._tag === 'Stage' || up.state === 'stale'))
          return [up.state];
        return [];
      }),
    );
    if (Option.isSome(held)) {
      decided.set(stage.id, { _tag: 'Held', state: held.value });
      yield* report(held.value, Option.none(), Option.none());
      continue;
    }
    const lines = yield* Effect.forEach(stage.inputs, inputLine);
    const key = sha256Hex(
      [
        `id=${stage.id}`,
        `version=${stage.version}`,
        `config=${Option.getOrElse(Option.fromUndefinedOr(stage.config), () => '')}`,
        ...lines,
      ].join('\n'),
    );
    // decide under the lock: cached, a plan's answer, another build's run to wait on, this build's to run, or a promote to make again;
    // the output `spent` (one that no longer holds) counts as never built
    const decideOver = (spent: Option.Option<string>) =>
      store.transact(manifest, (current) =>
        Effect.gen(function* () {
          const built = Option.filter(
            Option.fromUndefinedOr(current.stages[key]),
            (b) => !Option.contains(spent, b.output),
          );
          if (Option.isSome(built)) {
            const kept = yield* fs
              .exists(objectFile(built.value.output))
              .pipe(Effect.orElseSucceed(() => false));
            // a run left unpromoted is promoted again under this build's mark (a plan reads it cached)
            const pending = Option.filter(
              Option.fromUndefinedOr(built.value.unpromoted),
              () => !options.plan && Option.isSome(Option.fromUndefinedOr(stage.promote)),
            );
            if (kept && Option.isNone(pending))
              return [
                { _tag: 'cached', output: built.value.output } satisfies Decision,
                current,
              ] as const;
            if (kept && Option.isSome(pending)) {
              const live = yield* liveMarks(current);
              if (Option.isSome(Option.fromUndefinedOr(live.running?.[key])))
                return [{ _tag: 'busy' } satisfies Decision, live] as const;
              return [
                {
                  _tag: 'promote',
                  output: built.value.output,
                  run: pending.value.run,
                } satisfies Decision,
                { ...live, running: { ...live.running, [key]: yield* selfAt } },
              ] as const;
            }
          }
          const waited = Option.fromUndefinedOr(current.waited?.[key]);
          if (options.plan) {
            // a stage that last waited at this key waits again, unless this plan grants its spend
            const waits = Option.filter(
              waited,
              (w) => !Option.exists(Option.fromUndefinedOr(w.spend), (s) => options.spend.has(s)),
            );
            return [
              Option.match(waits, {
                onNone: (): Decision => ({ _tag: 'stale' }),
                onSome: (w): Decision => ({ _tag: w.state, reason: Option.some(w.reason) }),
              }),
              current,
            ] as const;
          }
          const live = yield* liveMarks(current);
          if (Option.isSome(Option.fromUndefinedOr(live.running?.[key])))
            return [{ _tag: 'busy' } satisfies Decision, live] as const;
          return [
            { _tag: 'run' } satisfies Decision,
            { ...live, running: { ...live.running, [key]: yield* selfAt } },
          ] as const;
        }),
      );
    let decision: Decision = yield* decideOver(Option.none());
    let spent = Option.none<string>();
    // a plan reads only the cache, so it takes the output last recorded as holding
    const holds = Option.filter(Option.fromUndefinedOr(stage.holds), () => !options.plan);
    if (decision._tag === 'cached' && Option.isSome(holds)) {
      // a cached output that no longer holds is built again
      const output = decision.output;
      const held = yield* fs.readFile(objectFile(output)).pipe(
        Effect.mapError((e) => StageFailed.make({ reason: `its output: ${e.message}` })),
        Effect.flatMap(holds.value),
        Effect.result,
      );
      if (Result.isFailure(held))
        decision = { _tag: 'failed', reason: Option.some(held.failure.reason) };
      else if (!held.success) {
        spent = Option.some(output);
        decision = yield* decideOver(spent);
      }
    }
    if (decision._tag === 'busy') {
      // another build's run: decide again (BUSY) until its output or its key is free
      yield* Effect.logInfo(
        `cast.build.busy stage=${stage.id} reason="another build runs it; waiting on its output"`,
      );
      decision = yield* decideOver(spent).pipe(Effect.repeat(BUSY), Effect.delay(BUSY_FIRST));
    }
    const outcome = yield* settle(stage, key, start, decision);
    switch (outcome._tag) {
      case 'cached':
      case 'ran':
        decided.set(stage.id, { _tag: 'Known', output: outcome.output, key });
        yield* report(outcome._tag, Option.some(key), Option.none());
        break;
      case 'stale':
        decided.set(stage.id, { _tag: 'Held', state: 'stale' });
        yield* report('stale', Option.some(key), Option.none());
        break;
      default:
        decided.set(stage.id, { _tag: 'Held', state: outcome._tag });
        yield* report(outcome._tag, Option.some(key), outcome.reason);
    }
  }
  return {
    stages: reports,
    okraCalls: counts.okra,
    modalCalls: counts.modal,
    spendUsd: counts.usd,
  } satisfies BuildReport;
});
