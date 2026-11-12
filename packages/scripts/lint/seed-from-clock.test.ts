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
      expect(marked.length).toBe(7);
      expect(reportedLines(file, text)).toEqual(marked);
    }),
  );

  it.effect('reports a clock read standing in for a seed read by name, whatever holds it', () =>
    Effect.sync(() => {
      const text = [
        "const at = Number(process.env['HSWAKE_WALK_SEED'] ?? Date.now());",
        'const from = Bun.env.WALK_SEED || new Date().getTime();',
      ].join('\n');
      expect(reportedLines('walk.ts', text)).toEqual([1, 2]);
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
