// A workspace's unit-test tasks: the tasks with a command that `turbo run
// test` (the gate's) runs in it, by turbo's own dry run. Most workspaces have
// one, `<ws>#test`. One whose tests are cut into parts (`@manna/film`) gives
// its `test` no command and has it depend on its parts (`test:lab`,
// `test:tools`, `test:engine`, each a script and a task of its
// `turbo.json`); its unit-test tasks are those parts. Each task's name is the
// package script it runs.
//
// The test budget (`test-budget.ts`) times each unit-test task alone, the
// strength rule (`strength.test.ts`) reads each one's script, the reach check
// (`reach.ts`) credits a test file to the unit-test task that takes it and
// fails one that two take, and the read check (`test-reads.ts`) holds each
// task's reads to its own inputs. All four read this one list, so none of
// them leaves a part out by looking for `#test`.

import { Effect, Schema } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

/** turbo's word for a task whose workspace has no script of its name. */
const NO_COMMAND = '<NONEXISTENT>';

/** What the scripts read of one task of turbo's dry run (`--dry=json`). */
const DryTask = Schema.Struct({
  taskId: Schema.String,
  task: Schema.String,
  package: Schema.String,
  directory: Schema.String,
  command: Schema.String,
  /** The files the task hashes, from its workspace's folder. */
  inputs: Schema.Record(Schema.String, Schema.String),
  dependencies: Schema.Array(Schema.String),
});

/** What the scripts read of turbo's dry run (`--dry=json`): each task it would run. */
export const DryRun = Schema.Struct({ tasks: Schema.Array(DryTask) });
export type DryRun = typeof DryRun.Type;

/** One unit-test task: its workspace's name and folder, its task (the script it runs), its id and its command. */
export interface UnitTest {
  readonly workspace: string;
  readonly directory: string;
  readonly task: string;
  readonly taskId: string;
  readonly command: string;
}

/** The unit-test tasks of `dry` (a dry run of `turbo run test`): each task with a command, by workspace, then task. */
export const unitTests = (dry: Pick<DryRun, 'tasks'>): ReadonlyArray<UnitTest> =>
  dry.tasks
    .filter((task) => task.command !== NO_COMMAND)
    .map((task) => ({
      workspace: task.package,
      directory: task.directory,
      task: task.task,
      taskId: task.taskId,
      command: task.command,
    }))
    .toSorted((a, b) => a.workspace.localeCompare(b.workspace) || a.task.localeCompare(b.task));

/** turbo's dry run of `turbo run test` at `root`, by the turbo binary `turbo` (a path, or a name on `PATH`). */
export const testDryRun = (root: string, turbo: string) =>
  Effect.flatMap(ChildProcessSpawner, (spawner) =>
    spawner.string(
      ChildProcess.make(turbo, ['run', 'test', '--dry=json'], {
        cwd: root,
        forceKillAfter: '5 seconds',
      }),
    ),
  ).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(DryRun))));
