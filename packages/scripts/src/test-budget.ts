#!/usr/bin/env bun

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import {
  Array as Arr,
  Console,
  Effect,
  FileSystem,
  Option,
  Path,
  Result,
  Schema,
  Stream,
} from 'effect';
import { Argument, Command } from 'effect/cli';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import { availableParallelism, loadavg } from 'node:os';
import { judge } from './test-budget/budget.js';
import { reachesIn, repoTests } from './test-budget/reach.js';
import { weakeningFlags } from './test-budget/strength.js';
import { type UnitTest, testDryRun, unitTests } from './test-budget/units.js';

/** What this reads of turbo's run summary (`--summarize`): each task's span. */
const RunSummary = Schema.Struct({
  tasks: Schema.Array(
    Schema.Struct({
      taskId: Schema.String,
      execution: Schema.Struct({ startTime: Schema.Finite, endTime: Schema.Finite }),
    }),
  ),
});

/** A name given that no workspace's unit-test task answers to. */
class UnknownWorkspace extends Schema.TaggedError<UnknownWorkspace>()('UnknownWorkspace', {
  message: Schema.String,
}) {}

/** A workspace with a unit-test task whose script weakens its tests: its time would not be its tests' at full strength. */
class WeakenedTests extends Schema.TaggedError<WeakenedTests>()('WeakenedTests', {
  message: Schema.String,
}) {}

/** A workspace with a test file no script of it runs: its time would leave that file out. */
class UnreachedTests extends Schema.TaggedError<UnreachedTests>()('UnreachedTests', {
  message: Schema.String,
}) {}

/** A workspace with a test file two of its unit-test tasks run: the gate runs it twice. */
class DoubledTests extends Schema.TaggedError<DoubledTests>()('DoubledTests', {
  message: Schema.String,
}) {}

/** A run whose own turbo left no summary this can read: no path printed, or a file that does not decode or names no `<ws>#<task>`. */
class SummaryUnreadable extends Schema.TaggedError<SummaryUnreadable>()('SummaryUnreadable', {
  message: Schema.String,
}) {}

/** turbo's line naming the summary it wrote: `Summary:    <root>/.turbo/runs/<id>.json`. */
const SUMMARY_LINE = /^Summary:\s+(\S.*\.json)\s*$/;

/**
 * This run's own summary, by the path its own turbo printed: the file, and the
 * span of `taskId` in it. Nothing else in `.turbo/runs` is read, so a summary
 * another writer left there (a second budget run, a hand-run turbo) is never
 * taken for this one.
 */
const ownSummary = (runs: string, taskId: string, printed: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const unreadable = (why: string) =>
      SummaryUnreadable.make({
        message: `test:budget: ${taskId}: ${why}; nothing is measured or removed.`,
      });
    const only = Arr.head(printed);
    if (Option.isNone(only) || printed.length > 1)
      return yield* unreadable(`turbo printed ${printed.length} summary paths, not one`);
    const file = only.value;
    const inRuns = yield* Effect.all([fs.realPath(path.dirname(file)), fs.realPath(runs)]).pipe(
      Effect.map(([dir, expected]) => dir === expected),
      Effect.orElseSucceed(() => false),
    );
    if (!inRuns) return yield* unreadable(`turbo's summary ${file} is not in ${runs}`);
    const summary = yield* fs.readFileString(file).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(RunSummary))),
      Effect.mapError((error) =>
        unreadable(`turbo's summary ${file} does not read: ${error.message}`),
      ),
    );
    const task = Arr.findFirst(summary.tasks, (each) => each.taskId === taskId);
    if (Option.isNone(task)) return yield* unreadable(`turbo's summary ${file} names no ${taskId}`);
    return { file, ms: task.value.execution.endTime - task.value.execution.startTime };
  });

/** Runs one unit-test task alone and answers its time and its exit code. */
const measure = (root: string, unit: UnitTest) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner;
    yield* Console.log(`\ntest:budget: ${unit.taskId} alone`);
    const [exitCode, printed] = yield* Effect.scoped(
      Effect.flatMap(
        spawner.spawn(
          ChildProcess.make(
            'turbo',
            [
              'run',
              unit.task,
              `--filter=${unit.workspace}`,
              '--force',
              '--summarize',
              '--ui=stream',
              '--no-color',
            ],
            {
              cwd: root,
              stdin: 'inherit',
              stderr: 'inherit',
              forceKillAfter: '5 seconds',
            },
          ),
        ),
        (child) =>
          Effect.all(
            [
              child.exitCode,
              child.stdout.pipe(
                Stream.decodeText,
                Stream.splitLines,
                Stream.tap((line) => Console.log(line)),
                Stream.filter((line) => SUMMARY_LINE.test(line)),
                Stream.map((line) => line.replace(SUMMARY_LINE, '$1')),
                Stream.runCollect,
              ),
            ],
            { concurrency: 2 },
          ),
      ),
    );
    const own = yield* Effect.result(
      ownSummary(path.join(root, '.turbo', 'runs'), unit.taskId, printed),
    );
    if (Result.isSuccess(own)) yield* fs.remove(own.success.file, { force: true });
    if (Result.isFailure(own)) yield* Console.error(own.failure.message);
    return {
      workspace: unit.workspace,
      taskId: unit.taskId,
      ms: Result.match(own, {
        onSuccess: (summary) => Option.some(summary.ms),
        onFailure: () => Option.none<number>(),
      }),
      exitCode: Number(exitCode),
    };
  });

/** A refusal: its words on stderr, and the run fails. */
const refuse = (message: string) =>
  Effect.andThen(
    Console.error(message),
    Effect.sync(() => {
      process.exitCode = 1;
    }),
  );

const command = Command.make(
  'test-budget',
  {
    names: Argument.String('workspace').pipe(
      Argument.variadic(),
      Argument.withDescription(
        'the workspaces to measure, by package name (default: every workspace `bun run test` runs)',
      ),
    ),
  },
  ({ names }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const root = path.resolve(import.meta.dir, '..', '..', '..');
      const units = unitTests(yield* testDryRun(root, 'turbo'));
      const known = Arr.dedupe(units.map((unit) => unit.workspace));
      const unknown = names.filter((name) => !known.includes(name));
      if (unknown.length > 0)
        return yield* UnknownWorkspace.make({
          message: `test:budget: no workspace's unit tests are named ${unknown.join(', ')}; the workspaces are ${known.join(', ')}.`,
        });
      const chosen = Arr.match(names, {
        onEmpty: () => known,
        onNonEmpty: (given) => Arr.dedupe(given),
      });
      const measured = chosen.flatMap((name) => units.filter((unit) => unit.workspace === name));
      const weakened = measured.flatMap((unit) =>
        weakeningFlags(unit.command).map((why) => `${unit.taskId}: ${why}`),
      );
      if (weakened.length > 0)
        return yield* WeakenedTests.make({
          message: `test:budget: nothing is measured; a unit-test task's script weakens its tests:\n${weakened.join('\n')}`,
        });
      const dirs = Arr.dedupe(measured.map((unit) => unit.directory));
      const { workspaces: all, tests: sources } = yield* repoTests(root, units);
      const reached = reachesIn(all, sources).filter(({ file }) =>
        dirs.some((dir) => file.startsWith(`${dir}/`)),
      );
      const unreached = reached.filter(({ by }) => Option.isNone(by)).map(({ file }) => file);
      if (unreached.length > 0)
        return yield* UnreachedTests.make({
          message: `test:budget: nothing is measured; no script of its workspace runs these test files:\n${unreached.join('\n')}`,
        });
      const doubled = reached
        .filter(({ units: by }) => by.length > 1)
        .map(({ file, units: by }) => `${file} (${by.join(', ')})`);
      if (doubled.length > 0)
        return yield* DoubledTests.make({
          message: `test:budget: nothing is measured; two unit-test tasks of its workspace run these test files:\n${doubled.join('\n')}`,
        });
      const [one = 0, five = 0] = loadavg();
      const tasks = yield* Effect.forEach(measured, (unit) => measure(root, unit));
      const judged = judge({ tasks, load: { one, five }, cores: availableParallelism() });
      yield* Console.log(judged.report.join('\n'));
      if (judged.failure.length > 0) yield* Console.error(judged.failure.join('\n'));
      yield* Effect.sync(() => {
        process.exitCode = judged.code;
      });
    }).pipe(
      Effect.catchTags({
        UnknownWorkspace: (error) => refuse(error.message),
        WeakenedTests: (error) => refuse(error.message),
        UnreachedTests: (error) => refuse(error.message),
        DoubledTests: (error) => refuse(error.message),
      }),
    ),
).pipe(
  Command.withDescription("Measure each workspace's unit-test tasks alone against the 1 s budget"),
);

Command.run(command, { version: '1.0.0' }).pipe(
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
