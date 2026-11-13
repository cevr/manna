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

/** The ways a seed's variable is read. */
const READS = ["process.env['X_SEED']", 'process.env.X_SEED', 'Bun.env.X_SEED'];

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

/** Every fallback form: each wrapper, read, choice, source and holder together. */
const fallbacks = (): ReadonlyArray<Fallback> =>
  WRAPPERS.flatMap((wrap) =>
    READS.flatMap((read) =>
      CHOICES.flatMap((choice) =>
        SOURCES.flatMap((source) =>
          HOLDERS.map((hold) => ({
            read,
            source,
            make: (r: string, s: string) => hold(choice(wrap)(r, s)),
          })),
        ),
      ),
    ),
  );

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
      expect(marked.length).toBe(11);
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
          cases: 1728,
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
