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

export type Input =
  | { readonly _tag: 'File'; readonly path: string }
  | { readonly _tag: 'Stage'; readonly id: string }
  | { readonly _tag: 'Optional'; readonly id: string };

const LINE = { Stage: 'stage', Optional: 'optional' } as const;

export const fileInput = (path: string): Input => ({ _tag: 'File', path });
export const stageInput = (id: string): Input => ({ _tag: 'Stage', id });
export const optionalInput = (id: string): Input => ({ _tag: 'Optional', id });

class WaitingSpend extends Schema.TaggedError<WaitingSpend>()('WaitingSpend', {
  spend: Spend,
}) {}

export class WaitingOwner extends Schema.TaggedError<WaitingOwner>()('WaitingOwner', {
  reason: Schema.String,
}) {}

export class StageFailed extends Schema.TaggedError<StageFailed>()('StageFailed', {
  reason: Schema.String,
}) {}

class GraphInvalid extends Schema.TaggedError<GraphInvalid>()('GraphInvalid', {
  reason: Schema.String,
}) {}

export interface StageContext {
  readonly file: (path: string) => Effect.Effect<Uint8Array, StageFailed>;
  readonly output: (id: string) => Effect.Effect<Uint8Array, StageFailed>;
  readonly outputPath: (id: string) => Effect.Effect<string, StageFailed>;
  readonly known: (id: string) => boolean;
  readonly object: (hash: string) => Effect.Effect<Option.Option<Uint8Array>>;
  readonly run: string;
  readonly spend: <A, E, R>(
    kind: Spend,
    effect: Effect.Effect<A, E, R>,
    usd?: number,
  ) => Effect.Effect<A, E | WaitingSpend, R>;
  readonly note: (text: string) => Effect.Effect<void>;
  readonly built: (id: string) => Effect.Effect<BuiltRecord, StageFailed>;
}

export interface BuiltRecord {
  readonly key: string;
  readonly output: string;
  readonly ms: number;
  readonly note: Option.Option<string>;
  readonly usd: Option.Option<number>;
}

export interface Stage<R> {
  readonly id: string;
  readonly view?: string;
  readonly inputs: ReadonlyArray<Input>;
  readonly version: string;
  readonly config?: string;
  readonly run: (ctx: StageContext) => Effect.Effect<Uint8Array, StageError, R>;
  readonly promote?: (ctx: StageContext) => Effect.Effect<void, StageFailed, R>;
  readonly holds?: (output: Uint8Array) => Effect.Effect<boolean, StageFailed, R>;
}

type StageError = WaitingSpend | WaitingOwner | StageFailed;

interface BuildOptions {
  readonly root: string;
  readonly cache: string;
  readonly plan: boolean;
  readonly touch: ReadonlyArray<string>;
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

const Unpromoted = Schema.Struct({ run: Schema.String, reason: Schema.String });

const Built = Schema.Struct({
  id: Schema.String,
  output: Schema.String,
  ms: Schema.Finite,
  note: Schema.optionalKey(Schema.String),
  usd: Schema.optionalKey(Schema.Finite),
  unpromoted: Schema.optionalKey(Unpromoted),
});

const Waited = Schema.Struct({
  id: Schema.String,
  state: Schema.Literals(['waiting-spend', 'waiting-owner']),
  spend: Schema.optionalKey(Spend),
  reason: Schema.String,
});

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

export const builtOutput = Effect.fn('cast.build.output')(function* (cache: string, key: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const current = yield* (yield* ContentStore).read(manifestIn(path, cache));
  const built = Option.fromUndefinedOr(current.stages[key]);
  if (Option.isNone(built)) return Option.none<Uint8Array>();
  return yield* fs.readFile(path.join(cache, 'objects', built.value.output)).pipe(Effect.option);
});

type Decided =
  | { readonly _tag: 'Known'; readonly output: string; readonly key: string }
  | { readonly _tag: 'Held'; readonly state: StageState };

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

const fromRoot = (path: Path.Path, root: string, file: string) => {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  if (relative.startsWith('..') || path.isAbsolute(relative)) return Option.none<string>();
  return Option.some(relative);
};

const checkRoot = <R>(path: Path.Path, root: string, stages: ReadonlyArray<Stage<R>>) => {
  for (const stage of stages)
    for (const input of stage.inputs)
      if (input._tag === 'File' && Option.isNone(fromRoot(path, root, input.path)))
        return Option.some(`${stage.id} reads ${input.path}, outside the root ${root}`);
  return Option.none<string>();
};

const BUSY_FIRST = '100 millis';

const BUSY_MOST = '5 seconds';

const HEARTBEAT_MS = 60 * 1000;
const HEARTBEAT = Schedule.spaced(HEARTBEAT_MS);

const RUNNING_LEASE_MS = 5 * HEARTBEAT_MS;

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

const holds = (current: BuildManifest, key: string, build: string) =>
  current.running?.[key]?.build === build;

const unmarked = (current: BuildManifest, key: string, build: string): BuildManifest => {
  if (current.running?.[key]?.build !== build) return current;
  const { [key]: _done, ...running } = current.running;
  return { ...current, running };
};

type Outcome =
  | { readonly _tag: 'cached' | 'ran'; readonly output: string }
  | { readonly _tag: 'stale' }
  | {
      readonly _tag: 'waiting-spend' | 'waiting-owner' | 'failed';
      readonly reason: Option.Option<string>;
    };

type Decision =
  | Outcome
  | { readonly _tag: 'busy' }
  | { readonly _tag: 'run' }
  | { readonly _tag: 'promote'; readonly output: string; readonly run: string };

const BUSY = {
  schedule: Schedule.min([Schedule.exponential(BUSY_FIRST), Schedule.spaced(BUSY_MOST)]),
  until: (decision: Decision) => decision._tag !== 'busy',
};

const heldBy = (states: ReadonlyArray<StageState>): Option.Option<StageState> =>
  Option.orElse(
    Arr.findFirst(states, (s) => s !== 'stale'),
    () => Arr.head(states),
  );

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
  const outputOf = (id: string): Option.Option<string> => {
    const known = decided.get(id);
    if (known?._tag === 'Known') return Option.some(known.output);
    return Option.none();
  };
  const processes = yield* Processes;
  const build = `${process.pid}-${yield* Random.nextIntBetween(0, 1e9)}`;
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
      return Option.match(fromRoot(path, options.root, input.path), {
        onNone: () => Effect.die(`${input.path} is outside the root ${options.root}`),
        onSome: (named) => fileHash(input.path).pipe(Effect.map((h) => `file:${named}=${h}`)),
      });
    return Effect.succeed(
      `${LINE[input._tag]}:${input.id}=${Option.getOrElse(outputOf(input.id), () => 'held')}`,
    );
  };
  const selfAt = Effect.map(Clock.currentTimeMillis, (at): Running => ({
    build,
    pid: process.pid,
    host: processes.host,
    at,
  }));
  const seen = new Map<string, { readonly mark: string; readonly since: number }>();
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
  const heartbeat = (key: string) =>
    Clock.currentTimeMillis.pipe(
      Effect.flatMap((now) =>
        store.update(manifest, (current) => renewed(current, key, build, now)),
      ),
      Effect.ignore,
      Effect.repeat(HEARTBEAT),
    );
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
  const liveMarks = (current: BuildManifest) =>
    Effect.map(
      Effect.filter(Object.entries(current.running ?? {}), ([key, mark]) => runs(key, mark)),
      (live): BuildManifest => ({ ...current, running: Object.fromEntries(live) }),
    );
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
        return store
          .update(manifest, (current) => unmarked(current, key, build))
          .pipe(Effect.ignore);
      }),
    );
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
    const holds = Option.filter(Option.fromUndefinedOr(stage.holds), () => !options.plan);
    if (decision._tag === 'cached' && Option.isSome(holds)) {
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
