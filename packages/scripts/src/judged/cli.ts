import { Cause, Console, Effect, Layer, Option, Path, Ref, Runtime, Schema } from 'effect';
import type { DecisionModel } from 'effect/ai';
import { Command, Flag } from 'effect/cli';

import { JudgedStore, judgedStoreLayer, readOnlyStoreLayer } from './cache.js';
import { Findings, findingsFileOf, makersHash, ruleSignature } from './findings.js';
import { readByOxlint } from './items.js';
import { JudgedLint, judgedLintLayer } from './config.js';
import { refusingModel } from './model.js';
import { cacheModel, ruleKey } from './rule.js';
import { LIMITS, detailOf, findingLine, judge, reviewLine, runLine } from './run.js';
import { repoItems } from './sources.js';
import { storeFileOf } from './store.js';

/** Findings that fail the run: a rule at `error`, or any finding under `--strict`. */
class GatingFindings extends Schema.TaggedError<GatingFindings>()('GatingFindings', {
  findings: Schema.Finite,
}) {
  override readonly [Runtime.errorReported] = false;
}

const isGatingFindings = Schema.is(GatingFindings);

/** A model layer for a model's name. */
type ModelOf<E, R> = (model: string) => Layer.Layer<DecisionModel.DecisionModel, E, R>;

/**
 * The findings file of a run that marked its answers seen on `day` (so it
 * expires no later than they do), from the store `store` names: each file the run read, by its hash,
 * with the findings of each rule whose every item there has an answer the
 * store keeps, for the plugin to report; a Markdown file oxlint never reads
 * holds none.
 */
const findingsOf = (
  day: number,
  store: string,
  model: string,
  outcomes: Effect.Success<ReturnType<typeof judge>>['outcomes'],
  files: ReadonlyArray<{ readonly file: string; readonly hash: string }>,
) =>
  Effect.map(
    Effect.forEach(outcomes, (outcome) =>
      Effect.map(ruleKey(outcome.rule), (key) => [
        outcome.rule.id,
        ruleSignature(model, key, outcome.rule),
      ]),
    ),
    (signatures): Findings => ({
      day,
      store,
      makers: makersHash(),
      rules: Object.fromEntries(signatures),
      files: Object.fromEntries(
        files
          .filter(({ file }) => readByOxlint(file))
          .map(({ file, hash }) => [
            file,
            {
              hash,
              rules: Object.fromEntries(
                outcomes
                  .filter((outcome) => !outcome.unkept.has(file))
                  .map((outcome) => [
                    outcome.rule.id,
                    outcome.findings
                      .filter((finding) => finding.kept && finding.file === file)
                      .map(({ start, p }) => ({ start, p })),
                  ]),
              ),
            },
          ]),
      ),
    }),
  );

/** Writes `findings` to `file` whole, as the run's store writes a checkout file; one that cannot be written is said on one line. */
const writeFindings = (file: string, findings: Findings) =>
  Effect.gen(function* () {
    const store = yield* JudgedStore;
    yield* store.write(file, yield* Schema.encodeEffect(Findings)(findings));
  }).pipe(
    Effect.catch((error) => Console.error(`[judged] findings not kept detail=${error._tag}`)),
  );

/**
 * Judges the repo's items and writes the checkout's findings for the plugin:
 * each rule's outcome. `read` holds how many items the selectors found.
 */
const judgeRepo = Effect.fn('judged.judgeRepo')(function* (read: Ref.Ref<number>) {
  const config = yield* JudgedLint;
  const path = yield* Path.Path;
  const root = config.root;
  const model = cacheModel(config.settings.model);
  const tree = yield* repoItems(root, config.ignorePatterns, config.rules, {
    model,
    file: path.join(root, config.settings.checkout, 'items.json'),
  });
  yield* Ref.set(read, tree.items.length);
  const { outcomes, usage, day } = yield* judge(config.rules, tree.items, {
    model,
    storeFile: storeFileOf(root, config.settings.store),
    textsOf: tree.textsOf,
    ...LIMITS,
  });
  if (usage.inputTokens > 0)
    yield* Console.error(`[judged] tokens input=${usage.inputTokens} output=${usage.outputTokens}`);
  yield* writeFindings(
    findingsFileOf(root, config.settings.checkout),
    yield* findingsOf(day, config.settings.store, model, outcomes, tree.files),
  );
  return outcomes;
});

/**
 * Prints the findings of `outcomes` oxlint does not report (a kept finding in
 * a file it lints is its own), or every one under `strict`: each rule's.
 */
const printFindings = Effect.fn('judged.printFindings')(function* (
  outcomes: Effect.Success<ReturnType<typeof judgeRepo>>,
  strict: boolean,
) {
  const own = outcomes.map((outcome) => ({
    rule: outcome.rule,
    findings: outcome.findings.filter(
      (finding) => strict || !finding.kept || !readByOxlint(finding.file),
    ),
  }));
  for (const outcome of own)
    yield* Effect.forEach(outcome.findings, (finding) =>
      Console.log(findingLine(outcome.rule, finding)),
    );
  return own;
});

/**
 * Fails with the count of `printed` findings that gate: a rule's at `error`,
 * or any under `strict`.
 */
const gate = Effect.fn('judged.gate')(function* (
  printed: Effect.Success<ReturnType<typeof printFindings>>,
  strict: boolean,
) {
  const gating = printed
    .filter((outcome) => strict || outcome.rule.severity === 'error')
    .reduce((n, outcome) => n + outcome.findings.length, 0);
  if (gating > 0) return yield* GatingFindings.make({ findings: gating });
});

/** Lints the repo's items; `read` holds how many items the selectors found. */
const lint = Effect.fn('lintJudged')(function* (strict: boolean, read: Ref.Ref<number>) {
  const outcomes = yield* judgeRepo(read);
  const own = yield* printFindings(outcomes, strict);
  yield* Effect.forEach(outcomes, (outcome) => Console.log(runLine(outcome)));
  yield* gate(own, strict);
});

/**
 * Reviews the repo's items by the store's answers alone, as the lint does:
 * it prints and fails on the findings oxlint cannot report (a Markdown
 * series script), of a rule at `error`, and prints each rule's review line.
 * oxlint reports the rest from the store itself (`lint/judged.ts`).
 */
const review = Effect.fn('lintReview')(function* (read: Ref.Ref<number>) {
  const outcomes = yield* judgeRepo(read);
  const own = yield* printFindings(outcomes, false);
  yield* Effect.forEach(outcomes, (outcome) => Console.log(reviewLine(outcome)));
  yield* gate(own, false);
});

const commandOf = (read: Ref.Ref<number>) =>
  Command.make(
    'lint-judged',
    {
      strict: Flag.Boolean('strict').pipe(
        Flag.withDefault(false),
        Flag.withDescription(
          "print every finding, oxlint's too, and exit non-zero on any (off: only a finding oxlint cannot report, of a rule at severity error, fails the run)",
        ),
      ),
    },
    ({ strict }) => lint(strict, read),
  ).pipe(Command.withDescription("Run the judged lint rules over the repo's items"));

/**
 * `program` with every failure but `GatingFindings` and an interrupt turned
 * into the run's `reason=error` skip line (`rule=*`: the failure is the
 * run's, before or across its rules; `detail=` the failure's tag, or
 * `defect`), the failure's first line on stderr, and success.
 */
const failOpen =
  (read: Ref.Ref<number>) =>
  <A, E extends { readonly _tag: string }, R>(program: Effect.Effect<A, E, R>) =>
    Effect.catchCause(program, (cause) => {
      const error = Cause.findErrorOption(cause);
      if (Cause.hasInterrupts(cause) || Option.exists(error, isGatingFindings))
        return Effect.failCause(cause);
      return Effect.gen(function* () {
        const detail = Option.match(error, { onNone: () => 'defect', onSome: detailOf });
        yield* Console.log(
          `[judged] skipped rule=* reason=error items=${yield* Ref.get(read)} detail=${detail}`,
        );
        yield* Console.error(`[judged] ${Cause.pretty(cause).split('\n')[0]?.slice(0, 300)}`);
      });
    });

/**
 * The judged lint run with `args` in the repo at `cwd`, over `modelOf` the
 * config's model: the config and the model layer are built inside the
 * boundary, so their failure fails open too.
 */
export const lintJudged = <E extends { readonly _tag: string }, R>(
  args: ReadonlyArray<string>,
  cwd: string,
  modelOf: ModelOf<E, R>,
) =>
  Effect.suspend(() => {
    const read = Ref.makeUnsafe(0);
    const repo = Layer.merge(judgedLintLayer(cwd), judgedStoreLayer);
    const model = Layer.unwrap(
      Effect.gen(function* () {
        const config = yield* JudgedLint;
        return modelOf(config.settings.model);
      }),
    );
    return Command.runWith(commandOf(read), { version: '1.0.0' })(args).pipe(
      Effect.provide(Layer.provideMerge(model, repo)),
      failOpen(read),
    );
  });

const reviewCommandOf = (read: Ref.Ref<number>) =>
  Command.make('lint-review', {}, () => review(read)).pipe(
    Command.withDescription(
      "Report the judged rules' kept answers over the repo's items, and count the items with none: no key, no model, no write",
    ),
  );

/**
 * The judged review with `args` in the repo at `cwd`: the judged lint over
 * the refusing model (`refusingModel`) and the read-only store
 * (`readOnlyStoreLayer`), so it reads no key, calls no host, takes no lock
 * and writes nothing. It fails on a kept finding of a rule at `error`, and
 * otherwise fails open, as the lint does.
 */
export const lintReview = (args: ReadonlyArray<string>, cwd: string) =>
  Effect.suspend(() => {
    const read = Ref.makeUnsafe(0);
    return Command.runWith(reviewCommandOf(read), { version: '1.0.0' })(args).pipe(
      Effect.provide(Layer.mergeAll(judgedLintLayer(cwd), readOnlyStoreLayer, refusingModel)),
      failOpen(read),
    );
  });
