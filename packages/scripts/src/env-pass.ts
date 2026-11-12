#!/usr/bin/env bun

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Glob, JSONC } from 'bun';
import { Clock, Console, Effect, FileSystem, Option, Path, Schema, Stdio } from 'effect';

import { gapsOf } from './env-pass/gaps.ts';
import { envReads } from './env-pass/reads.ts';
import { TurboEnv } from './env-pass/turbo.ts';
import { reachesIn, repoTests } from './test-budget/reach.ts';
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

/** A cheap first look: a file that holds neither word reads no variable `envReads` finds. */
const MAY_READ = /\benv\b|\bConfig\./;

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
  const reading = repo.tests
    .filter(({ text }) => MAY_READ.test(text))
    .map((test) => ({ ...test, reads: envReads(test.file, test.text) }))
    .filter(({ reads }) => reads.length > 0);
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
            reads: readsOf.get(file) ?? [],
          },
        ],
      },
    ),
  );
  const gaps = gapsOf(rootTurbo, turbos, reached);

  yield* Effect.forEach(
    gaps,
    ({ dir, task, file, name }) =>
      Console.log(
        `env-pass ${dir}#${task}: ${file} reads ${name}, which turbo does not hand the task (add it to its passThroughEnv or env)`,
      ),
    { discard: true },
  );
  const ended = yield* Clock.currentTimeMillis;
  yield* Console.log(
    `env-pass: ${reached.length} test file(s) read variables, ${gaps.length} gap(s), ${ended - started} ms`,
  );
  yield* Effect.sync(() => {
    process.exitCode = Math.min(gaps.length, 1);
  });
}).pipe(Effect.scoped, Effect.provide(BunServices.layer), BunRuntime.runMain);
