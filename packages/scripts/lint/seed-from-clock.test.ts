import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Predicate } from 'effect';
import { Testing } from 'oxlint-plugin-effect/rule-bindings';
import { type Node, parseSync, visitorKeys } from 'oxc-parser';
import { seedFromClock } from './seed-from-clock.ts';

/** Whether a value read off a node is a node: an object with a string `type`. */
const isNode = (value: unknown): value is Node =>
  Predicate.hasProperty(value, 'type') && Predicate.isString(value.type);

/** The child nodes of `node`, in source order, by the parser's own visitor keys. */
const childrenOf = (node: Node): ReadonlyArray<Node> =>
  (visitorKeys[node.type] ?? []).flatMap((key) => {
    const value: unknown = Reflect.get(node, key);
    if (Array.isArray(value)) return value.filter(isNode);
    return Option.toArray(Option.liftPredicate(value, isNode));
  });

/** Every node under `node`, outer first, each given its `parent` as oxlint gives it. */
const nodesOf = (node: Node): ReadonlyArray<Node> =>
  childrenOf(node).flatMap((child) => {
    Reflect.set(child, 'parent', node);
    return [child, ...nodesOf(child)];
  });

/** The 1-based line of each offset in `text`. */
const lineOf = (text: string, offset: number) => text.slice(0, offset).split('\n').length;

/** The lines the rule reports in a source, run on the parser's tree as oxlint walks it. */
const reportedLines = (file: string, text: string) => {
  const nodes = nodesOf(parseSync(file, text).program);
  const diagnostics = Testing.runRuleMulti(
    seedFromClock,
    nodes
      .filter((node) => node.type === 'MemberExpression' || node.type === 'NewExpression')
      .map((node) => [node.type, node] as const),
    { filename: file, sourceText: text },
  );
  return diagnostics.map(({ diagnostic }) =>
    lineOf(text, Number(Reflect.get(Reflect.get(diagnostic, 'node') ?? {}, 'start'))),
  );
};

/** The lines a fixture marks RED for the rule. */
const markedLines = (text: string) =>
  text
    .split('\n')
    .flatMap((line, i) => [i + 1].filter(() => line.includes('RED manna/seed-from-clock')));

/** A seed read by name with a fallback: `make(read, source)` writes the expression. */
interface Fallback {
  readonly read: string;
  readonly source: string;
  readonly make: (read: string, source: string) => string;
}

/** The ways a test turns a variable's text into a number. */
const WRAPPERS: ReadonlyArray<(x: string) => string> = [
  (x) => x,
  (x) => `Number(${x})`,
  (x) => `parseInt(${x}, 10)`,
  (x) => `Math.trunc(${x})`,
];

/** The ways a seed's variable is named. */
const VARIABLES = ["process.env['X_SEED']", 'process.env.X_SEED', 'Bun.env.X_SEED'];

/** The ways its text is taken: as it is, through a method on an optional chain or past `!`, or in a template. */
const TAKES: ReadonlyArray<(x: string) => string> = [
  (x) => x,
  (x) => `${x}?.trim()`,
  (x) => `${x}!.trim()`,
  (x) => `\`\${${x}}\``,
];

/** The ways a seed's variable is read: each variable, each way taken. */
const READS = VARIABLES.flatMap((variable) => TAKES.map((take) => take(variable)));

/** The ways a fallback is chosen when the variable is unset, given a wrapper. */
const CHOICES: ReadonlyArray<
  (wrap: (x: string) => string) => (read: string, source: string) => string
> = [
  (wrap) => (read, source) => `${wrap(read)} ?? ${source}`,
  (wrap) => (read, source) => wrap(`${read} ?? ${source}`),
  (wrap) => (read, source) => `${wrap(read)} || ${source}`,
  (wrap) => (read, source) => wrap(`${read} || ${source}`),
  (wrap) => (read, source) => `${read} ? ${wrap(read)} : ${source}`,
  (wrap) => (read, source) => `${read} === undefined ? ${source} : ${wrap(read)}`,
];

/** The clock and random sources a fallback may read. */
const SOURCES = [
  'Date.now()',
  'Math.random()',
  'performance.now()',
  'crypto.randomUUID()',
  'crypto.getRandomValues(bytes)',
  'Clock.currentTimeMillis',
  'Clock.currentTimeNanos',
  'new Date()',
];

/** What may hold the whole choice: nothing, the seeded generator, or a rounding. */
const HOLDERS: ReadonlyArray<(x: string) => string> = [
  (x) => x,
  (x) => `random(${x})`,
  (x) => `Math.floor(${x})`,
];

/**
 * Every fallback form: each wrapper, read, choice and source together, the
 * holders taken in turn, so each holder meets every wrapper, read, choice
 * and source.
 */
const fallbacks = (): ReadonlyArray<Fallback> =>
  WRAPPERS.flatMap((wrap) =>
    READS.flatMap((read) =>
      CHOICES.flatMap((choice) => SOURCES.map((source) => ({ wrap, read, choice, source }))),
    ),
  ).map(({ wrap, read, choice, source }, i) => ({
    read,
    source,
    make: (r: string, s: string) =>
      (HOLDERS[i % HOLDERS.length] ?? ((x: string) => x))(choice(wrap)(r, s)),
  }));

/** A constant seed as a test names it: a binding, or the variable read with a constant fallback. */
const CONSTANT_SEEDS = ['seed', ...READS.map((read) => `Number(${read} ?? 20261112)`)];

/** The ways a test reads the clock beside a seed, its value never the seed's: a timing, a log, a check, a label. */
const BESIDES: ReadonlyArray<(seed: string, source: string) => string> = [
  (seed, source) => `${seed} > 0 && ${source} < 5_000`,
  (seed, source) => `${seed} && ${source}`,
  (seed, source) => `String(${seed}).length > 0 && ${source} > 0`,
  (seed, source) => `${seed} > 0 ? \`seed \${${seed}}\` : \`took \${${source}} ms\``,
  (seed, source) => `${seed} ? log(${source}) : 0`,
  (seed, source) => `check(${seed}, () => { const started = ${source}; return started; })`,
  (seed, source) => `check(${seed}, () => ${source})`,
  (seed, source) => `console.log(${seed}, ${source})`,
  (seed, source) => `[${seed}, ${source}]`,
  (seed, source) => `({ seed: ${seed}, at: ${source} })`,
  (seed, source) => `\`seed \${${seed}} at \${${source}}\``,
  (seed, source) => `${seed} + ${source} * 0`,
];

/** Every line that reads the clock beside a constant seed, each under a binding of its own. */
const besides = (): ReadonlyArray<string> =>
  CONSTANT_SEEDS.flatMap((seed) =>
    BESIDES.flatMap((beside) => SOURCES.map((source) => beside(seed, source))),
  ).map((expression, i) => `const v${i} = ${expression};`);

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(import.meta.dir, 'fixtures', 'seed-from-clock.ts');
  return { file, text: yield* fs.readFileString(file) };
}).pipe(Effect.provide(BunServices.layer));

describe('manna/seed-from-clock', () => {
  it.effect('reports each seed its fixture marks RED, and nothing else', () =>
    Effect.gen(function* () {
      const { file, text } = yield* fixture;
      const marked = markedLines(text);
      expect(marked.length).toBe(12);
      expect(reportedLines(file, text)).toEqual(marked);
    }),
  );

  it.effect(
    'property: every clock or random fallback of a seed read by name is reported, however it is chosen and wrapped, and the same line with a constant or a name not a seed is not',
    () =>
      Effect.sync(() => {
        const all = fallbacks();
        const lines = (source: (line: Fallback) => string, read: (line: Fallback) => string) =>
          all.map((line) => `const at = ${line.make(read(line), source(line))};`).join('\n');
        const everyLine = all.map((_, i) => i + 1);
        const named = lines(
          (line) => line.source,
          (line) => line.read,
        );
        const reported = new Set(reportedLines('walk.ts', named));
        const missed = everyLine.filter((n) => !reported.has(n));
        expect({ cases: all.length, missed: missed.map((n) => named.split('\n')[n - 1]) }).toEqual({
          cases: 2304,
          missed: [],
        });
        const constant = lines(
          () => '20261112',
          (line) => line.read,
        );
        expect(reportedLines('walk.ts', constant)).toEqual([]);
        const unnamed = lines(
          (line) => line.source,
          (line) => line.read.replaceAll('X_SEED', 'X_PORT'),
        );
        expect(reportedLines('walk.ts', unnamed)).toEqual([]);
      }),
  );

  it.effect(
    'property: a clock or random read beside a constant seed whose value it does not make is never reported: a timing, a log, a check, a label',
    () =>
      Effect.sync(() => {
        const lines = besides();
        const reported = reportedLines('rows.test.ts', lines.join('\n'));
        expect({
          cases: lines.length,
          reported: reported.map((n) => lines[n - 1]).slice(0, 5),
        }).toEqual({ cases: 1248, reported: [] });
      }),
  );

  it.effect(
    'leaves a clock read held by a name that only holds the letters seed, or in a title that says seed',
    () =>
      Effect.sync(() => {
        const text = [
          'const heartseedLaunch = Date.now();',
          'const seeded = mulberry(performance.now());',
          "it('draws the seed', () => Math.random());",
        ].join('\n');
        expect(reportedLines('rows.test.ts', text)).toEqual([]);
      }),
  );
});
