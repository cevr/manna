// The cast build's stage graph and its cache. A stage is `{ id, view?,
// inputs, version, config?, run }`; its key is the SHA-256 of its id, its
// version, its config and the hash of each input, where an input is a file's
// bytes or an upstream stage's output. A stage's output is bytes, kept in
// the cache as `objects/<sha256>`, and `build.json` (a `ContentStore`
// manifest) maps each key to its output's hash and the stage's wall time.
// A stage whose key is in the manifest is `cached` and does not run; one
// that reruns and makes the same bytes leaves every stage below it cached
// (early cutoff), since their keys read its output's hash, not its inputs.
//
// A stage spends (okra, Modal) only through `ctx.spend`, which runs the
// spend when the build's `spend` names it and otherwise fails the stage as
// `waiting-spend`; a stage that needs the owner fails as `waiting-owner`.
// Neither is cached, so the next build asks again; the manifest keeps only
// what it waited on, by key. Every stage below a waiting or failed stage
// takes its state without running. `plan` runs no stage: one whose key is not
// in the manifest is `stale`, and so is every stage below it, its output
// unknown, unless it last waited at that key, when it waits again (a plan
// granted its spend calls it stale); `touch` plans as if those files changed. Each stage is decided and run under the manifest's lock
// (`ContentStore.transact`), so two builds never decide on one stage at once.

import { Array as Arr, Clock, Effect, FileSystem, Option, Path, Schema } from 'effect';
import { ContentStore, type Manifest } from '../content-store.ts';
import { sha256Hex } from '../digest.ts';

/** What a stage may spend: okra calls (the subscription route) or a Modal run. */
export const Spend = Schema.Literals(['okra', 'modal']);
export type Spend = typeof Spend.Type;

export const StageState = Schema.Literals([
  'cached',
  'ran',
  'stale',
  'waiting-spend',
  'waiting-owner',
  'failed',
]);
export type StageState = typeof StageState.Type;

/** A stage's input: a file's bytes, or an upstream stage's output. */
export type Input =
  | { readonly _tag: 'File'; readonly path: string }
  | { readonly _tag: 'Stage'; readonly id: string };

export const fileInput = (path: string): Input => ({ _tag: 'File', path });
export const stageInput = (id: string): Input => ({ _tag: 'Stage', id });

/** The stage would spend, and the build's `--spend` does not name it. */
export class WaitingSpend extends Schema.TaggedError<WaitingSpend>()('WaitingSpend', {
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
export class GraphInvalid extends Schema.TaggedError<GraphInvalid>()('GraphInvalid', {
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
  /** Run `effect`, which spends `kind`, when the build allows it; else the stage waits. */
  readonly spend: <A, E, R>(
    kind: Spend,
    effect: Effect.Effect<A, E, R>,
    usd?: number,
  ) => Effect.Effect<A, E | WaitingSpend, R>;
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
}

/** The ways a stage's run ends other than with its output. */
export type StageError = WaitingSpend | WaitingOwner | StageFailed;

export interface BuildOptions {
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

/** A stage's result as `build.json` keeps it, by key: its output's hash and the wall time of the run that made it. */
const Built = Schema.Struct({
  id: Schema.String,
  output: Schema.String,
  ms: Schema.Finite,
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

const BuildManifest = Schema.Struct({
  stages: Schema.Record(Schema.String, Built),
  waited: Schema.optionalKey(Schema.Record(Schema.String, Waited)),
});
type BuildManifest = typeof BuildManifest.Type;

const manifestIn = (path: Path.Path, cache: string): Manifest<BuildManifest> => ({
  file: path.join(cache, 'build.json'),
  codec: Schema.fromJsonString(BuildManifest),
  empty: { stages: {} },
});

/** A stage's place in this build: its output's hash once known, else the state that holds the stages below it. */
type Decided =
  | { readonly _tag: 'Known'; readonly output: string }
  | { readonly _tag: 'Held'; readonly state: StageState };

/** The order check: every stage input names a stage before it, and no id repeats. */
const checkOrder = <R>(stages: ReadonlyArray<Stage<R>>) => {
  const seen = new Set<string>();
  for (const stage of stages) {
    if (seen.has(stage.id)) return Option.some(`${stage.id} is named twice`);
    for (const input of stage.inputs)
      if (input._tag === 'Stage' && !seen.has(input.id))
        return Option.some(`${stage.id} reads ${input.id}, which is not before it`);
    seen.add(stage.id);
  }
  return Option.none<string>();
};

/** How a stage's decision under the manifest's lock ended. */
type Outcome =
  | { readonly _tag: 'cached' | 'ran'; readonly output: string }
  | { readonly _tag: 'stale' }
  | {
      readonly _tag: 'waiting-spend' | 'waiting-owner' | 'failed';
      readonly reason: Option.Option<string>;
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
  const invalid = checkOrder(stages);
  if (Option.isSome(invalid)) return yield* GraphInvalid.make({ reason: invalid.value });
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
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
  const ctx: StageContext = {
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
    spend: (kind, effect, usd = 0) => {
      if (!options.spend.has(kind)) return Effect.fail(WaitingSpend.make({ spend: kind }));
      return Effect.sync(() => {
        counts[kind]++;
        counts.usd += usd;
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
      return fileHash(input.path).pipe(Effect.map((h) => `file:${input.path}=${h}`));
    return Effect.succeed(
      `stage:${input.id}=${Option.getOrElse(outputOf(input.id), () => 'unknown')}`,
    );
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
        if (input._tag !== 'Stage') return [];
        const up = decided.get(input.id);
        if (up?._tag === 'Held') return [up.state];
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
    const outcome = yield* store.transact(manifest, (current) =>
      Effect.gen(function* () {
        const built = Option.fromUndefinedOr(current.stages[key]);
        if (Option.isSome(built)) {
          const kept = yield* fs
            .exists(objectFile(built.value.output))
            .pipe(Effect.orElseSucceed(() => false));
          if (kept)
            return [
              { _tag: 'cached', output: built.value.output } satisfies Outcome,
              current,
            ] as const;
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
              onNone: (): Outcome => ({ _tag: 'stale' }),
              onSome: (w): Outcome => ({ _tag: w.state, reason: Option.some(w.reason) }),
            }),
            current,
          ] as const;
        }
        const ran = yield* stage.run(ctx).pipe(
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
        if (ran._tag === 'waited')
          return [
            { _tag: ran.waited.state, reason: Option.some(ran.waited.reason) } satisfies Outcome,
            { ...current, waited: { ...current.waited, [key]: ran.waited } },
          ] as const;
        if (ran._tag !== 'made') return [ran, current] as const;
        const output = sha256Hex(ran.bytes);
        yield* store.writeFile(objectFile(output), ran.bytes);
        const ms = (yield* Clock.currentTimeMillis) - start;
        return [
          { _tag: 'ran', output } satisfies Outcome,
          { ...current, stages: { ...current.stages, [key]: { id: stage.id, output, ms } } },
        ] as const;
      }),
    );
    switch (outcome._tag) {
      case 'cached':
      case 'ran':
        decided.set(stage.id, { _tag: 'Known', output: outcome.output });
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
