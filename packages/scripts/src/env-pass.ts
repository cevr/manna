#!/usr/bin/env bun

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Glob, JSONC } from 'bun';
import { builtinModules } from 'node:module';
import { Clock, Console, Effect, FileSystem, Option, Path, Schema, Stdio } from 'effect';

import { type Gap, type Reported, gapsOf, splitReported } from './env-pass/gaps.ts';
import {
  type Module,
  type Package,
  aliasesFor,
  isModule,
  loadedBy,
  isTestSupport,
  productOf,
  readsThrough,
  resolverOf,
} from './env-pass/graph.ts';
import { envReads, importsOf, parsedImports } from './env-pass/reads.ts';
import { TurboEnv } from './env-pass/turbo.ts';
import { reachesIn, repoTests } from './test-budget/reach.ts';
import { gateFiles } from './guard/files.ts';
import { commandsOf } from './test-budget/shell.ts';

const RootManifest = Schema.fromJsonString(
  Schema.Struct({ workspaces: Schema.optionalKey(Schema.Array(Schema.String)) }),
);

/** What this reads of a workspace's `turbo.json` beside its variables: the tasks its `test` waits on. */
const TurboParts = Schema.Struct({
  tasks: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.Struct({ dependsOn: Schema.optionalKey(Schema.Array(Schema.String)) }),
    ),
  ),
});

/** The tasks turbo runs a workspace's tests in, besides its unit-test parts: `bun run gate`'s, `test:slow`'s and `test:perf`'s. */
const TEST_TASKS = ['test', 'test:slow', 'test:perf'];

/** What this reads of a workspace's `package.json`: the name and the `exports` other modules import it by. */
const Manifest = Schema.fromJsonString(
  Schema.Struct({
    name: Schema.optionalKey(Schema.String),
    exports: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  }),
);

/** What this reads of a `tsconfig.json`: what bun resolves a module's `paths` aliases by. */
const Tsconfig = Schema.Struct({
  extends: Schema.optionalKey(Schema.String),
  compilerOptions: Schema.optionalKey(
    Schema.Struct({
      baseUrl: Schema.optionalKey(Schema.String),
      paths: Schema.optionalKey(Schema.Record(Schema.String, Schema.Array(Schema.String))),
    }),
  ),
});

/** The packages installed in a `node_modules` folder, `@scope/name` included; none when there is no such folder. */
const installedIn = (folder: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const names = yield* Effect.orElseSucceed(fs.readDirectory(folder), () => []);
    const scoped = yield* Effect.forEach(
      names.filter((name) => name.startsWith('@')),
      (scope) =>
        Effect.map(
          Effect.orElseSucceed(fs.readDirectory(`${folder}/${scope}`), () => []),
          (inside) => inside.map((name) => `${scope}/${name}`),
        ),
    );
    return new Set([...names, ...scoped.flat()]);
  });

/**
 * The gaps in the films' workspaces, each a task and a variable: the films
 * lane owns `packages/film` and `apps/animations`, so the check reports
 * these each run and does not fail on them, and fails when one is no gap
 * any more, so the list never outlives its gaps.
 */
const REPORTED: ReadonlyArray<Reported> = [
  { dir: 'packages/film', task: 'test:slow', name: 'FILM_E2E_CPU_THROTTLE' },
  { dir: 'packages/film', task: 'test:slow', name: 'FILM_TEST_BUNDLES' },
  { dir: 'packages/film', task: 'test:slow', name: 'TMPDIR' },
];

/**
 * The other package scripts a task's script runs by naming them to a runner
 * of the repo's (`bun scripts/slow.ts test:slow: test:browser`): each word
 * after the runner's file that is a script's name, and each that ends in
 * `:` stands for every script under it. They run inside the task, with the
 * variables turbo hands it. A `bun run <script>` the reach follows itself.
 */
const namedScripts = (scripts: Readonly<Record<string, string>>, task: string) =>
  commandsOf(scripts[task] ?? '')
    .filter(([program, runner = '']) => program === 'bun' && /\.[cm]?[jt]s$/.test(runner))
    .flatMap((words) => words.slice(2))
    .flatMap((word) => {
      if (word.endsWith(':')) return Object.keys(scripts).filter((name) => name.startsWith(word));
      if (word === task || !Object.hasOwn(scripts, word)) return [];
      return [word];
    });

Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const started = yield* Clock.currentTimeMillis;
  const [given] = yield* (yield* Stdio.Stdio).args;
  const root = path.resolve(given ?? path.join(import.meta.dir, '..', '..', '..'));
  const readJsonc = (file: string) =>
    Effect.map(
      Effect.option(fs.readFileString(path.join(root, file))),
      Option.map((text): unknown => JSONC.parse(text)),
    );

  const { workspaces: globs = [] } = yield* Schema.decodeEffect(RootManifest)(
    yield* fs.readFileString(path.join(root, 'package.json')),
  );
  const dirs = globs.flatMap((glob) =>
    [...new Glob(`${glob.replace(/\/+$/, '')}/package.json`).scanSync({ cwd: root })].map(
      (manifest) => path.dirname(manifest),
    ),
  );
  const rootTurbo = yield* Schema.decodeUnknownEffect(TurboEnv)(
    JSONC.parse(yield* fs.readFileString(path.join(root, 'turbo.json'))),
  );
  const turbos = new Map<string, TurboEnv>();
  const tasksOf = new Map<string, ReadonlyArray<string>>();
  yield* Effect.forEach(
    dirs,
    (dir) =>
      Effect.gen(function* () {
        const found = yield* readJsonc(path.join(dir, 'turbo.json'));
        if (Option.isNone(found)) return tasksOf.set(dir, TEST_TASKS);
        turbos.set(dir, yield* Schema.decodeUnknownEffect(TurboEnv)(found.value));
        const { tasks = {} } = yield* Schema.decodeUnknownEffect(TurboParts)(found.value);
        const parts = (tasks['test']?.dependsOn ?? []).filter((id) => /^test:[^:#^$]+$/.test(id));
        return tasksOf.set(dir, [...TEST_TASKS, ...parts]);
      }),
    { discard: true },
  );

  const repo = yield* repoTests(root, []);
  const workspaces = repo.workspaces.map((workspace) => {
    const runs = new Map(
      (tasksOf.get(workspace.dir) ?? [])
        .filter((task) => Object.hasOwn(workspace.scripts, task))
        .map((task) => [task, [task, ...namedScripts(workspace.scripts, task)]] as const),
    );
    return { ...workspace, units: [...new Set([...runs.values()].flat())], runs };
  });
  const packages = yield* Effect.forEach(dirs, (dir) =>
    Effect.map(
      Effect.flatMap(
        fs.readFileString(path.join(root, dir, 'package.json')),
        Schema.decodeEffect(Manifest),
      ),
      ({ name, exports = {} }): ReadonlyArray<Package> =>
        Option.toArray(
          Option.map(Option.fromUndefinedOr(name), (named) => ({ name: named, dir, exports })),
        ),
    ),
  );
  const files = yield* gateFiles(root);
  const tsconfigs = new Map(
    yield* Effect.forEach(
      files.filter((file) => file.split('/').at(-1) === 'tsconfig.json'),
      (file) =>
        Effect.map(
          Effect.flatMap(fs.readFileString(path.join(root, file)), (text) =>
            Schema.decodeUnknownEffect(Tsconfig)(JSONC.parse(text)),
          ),
          (config) => [file, config] as const,
        ),
    ),
  );
  const modulesIn = new Map(
    yield* Effect.forEach(['', ...dirs], (dir) =>
      Effect.map(
        installedIn(path.join(root, dir, 'node_modules')),
        (names) => [dir, names] as const,
      ),
    ),
  );
  const resolve = resolverOf({
    files: new Set(files),
    packages: packages.flat(),
    aliasesFor: aliasesFor(tsconfigs),
    installed: (from, name) =>
      [...modulesIn].some(
        ([dir, names]) => (dir === '' || from.startsWith(`${dir}/`)) && names.has(name),
      ),
    builtins: new Set(builtinModules),
  });
  const scanned: Array<readonly [string, string]> = [];
  const texts = new Map(repo.tests.map(({ file, text }) => [file, text]));
  const graph = new Map(
    yield* Effect.forEach(
      files.filter((file) => isModule(file) && !file.split('/').includes('node_modules')),
      (file) =>
        Effect.map(
          Option.match(Option.fromUndefinedOr(texts.get(file)), {
            onNone: () => fs.readFileString(path.join(root, file)),
            onSome: (held) => Effect.succeed(held),
          }),
          (text): readonly [string, Module] => [
            file,
            {
              reads: envReads(file, text),
              entry: /\bimport\.meta\.main\b/.test(text),
              deps: importsOf(text).flatMap((specifier) => {
                const resolved = resolve(file, specifier);
                if (resolved._tag === 'Module') return [resolved.file];
                if (resolved._tag === 'Unresolved') scanned.push([file, specifier]);
                return [];
              }),
            },
          ],
        ),
      { concurrency: 16 },
    ),
  );
  const product = productOf(graph, (file) => texts.has(file) || isTestSupport(file));
  const reading = repo.tests
    .map((test) => ({ ...test, reads: readsThrough(test.file, graph, product) }))
    .filter(({ reads }) => reads.size > 0);
  const readsOf = new Map(reading.map(({ file, reads }) => [file, reads]));
  const reached = reachesIn(workspaces, reading).flatMap(({ file, units: scripts }) =>
    Option.match(
      Option.fromUndefinedOr(
        workspaces
          .filter(({ dir }) => file.startsWith(`${dir}/`))
          .toSorted((a, b) => b.dir.length - a.dir.length)[0],
      ),
      {
        onNone: () => [],
        onSome: ({ dir, runs }) => [
          {
            file,
            dir,
            tasks: [...runs]
              .filter(([, held]) => held.some((script) => scripts.includes(script)))
              .map(([task]) => task),
            reads: readsOf.get(file) ?? new Map<string, string>(),
          },
        ],
      },
    ),
  );
  const { open, reported, stale } = splitReported(gapsOf(rootTurbo, turbos, reached), REPORTED);
  const said = (gap: Gap) => {
    const through = [gap.by].filter((by) => by !== gap.file).map((by) => ` through ${by}`);
    return `${gap.dir}#${gap.task}: ${gap.file} reads ${gap.name}${through.join('')}`;
  };

  yield* Effect.forEach(
    open,
    (gap) =>
      Console.log(
        `env-pass ${said(gap)}, which turbo does not hand the task (add it to its passThroughEnv or env)`,
      ),
    { discard: true },
  );
  yield* Effect.forEach(
    REPORTED.filter((entry) => !stale.includes(entry)),
    ({ dir, task, name }) => {
      const files = reported.filter(
        (gap) => gap.dir === dir && gap.task === task && gap.name === name,
      );
      return Console.log(
        `env-pass reported (the films lane's to close) ${dir}#${task} ${name}: ${files.length} test file(s), as ${files.map(said).slice(0, 1).join('')}`,
      );
    },
    { discard: true },
  );
  yield* Effect.forEach(
    stale,
    ({ dir, task, name }) =>
      Console.log(`env-pass stale: REPORTED names ${dir}#${task} ${name}, which is no gap now`),
    { discard: true },
  );
  const testSide = new Set(
    repo.tests.flatMap(({ file }) => loadedBy(file, graph)).filter((file) => !product.has(file)),
  );
  const unresolved = (yield* Effect.forEach(
    [...new Set(scanned.map(([file]) => file))].filter((file) => testSide.has(file)),
    (file) =>
      Effect.map(
        Effect.map(fs.readFileString(path.join(root, file)), (text) => parsedImports(file, text)),
        (real) => scanned.filter(([at, specifier]) => at === file && real.has(specifier)),
      ),
  )).flat();
  yield* Effect.forEach(
    unresolved,
    ([file, specifier]) =>
      Console.log(
        `env-pass unresolved: ${file} imports '${specifier}', which names no module of the repo (relative, a tsconfig \`paths\` alias, a workspace package) and no builtin or installed package, so the check cannot see what it reads`,
      ),
    { discard: true },
  );
  const ended = yield* Clock.currentTimeMillis;
  yield* Console.log(
    `env-pass: ${reached.length} test file(s) read variables, ${open.length} gap(s), ${reported.length} reported, ${stale.length} stale, ${unresolved.length} unresolved, ${ended - started} ms`,
  );
  yield* Effect.sync(() => {
    process.exitCode = Math.min(open.length + stale.length + unresolved.length, 1);
  });
}).pipe(Effect.scoped, Effect.provide(BunServices.layer), BunRuntime.runMain);
