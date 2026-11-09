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
const DryRun = Schema.Struct({ tasks: Schema.Array(DryTask) });
type DryRun = typeof DryRun.Type;

/** One unit-test task: its workspace's name and folder, its task (the script it runs), its id and its command. */
export interface UnitTest {
  readonly workspace: string;
  readonly directory: string;
  readonly task: string;
  readonly taskId: string;
  readonly command: string;
}

/** A part's task name: `test:<part>`. */
const PART = /^test:[^:]+$/u;

/**
 * The unit-test tasks of `dry` (a dry run of `turbo run test`), by workspace,
 * then task: each `<ws>#test` with a command, and each `<ws>#test:<part>`
 * with a command that a commandless `<ws>#test` depends on. A task the test
 * run reaches for another reason (a `transit` or a `build` given a script) is
 * none.
 */
export const unitTests = (dry: Pick<DryRun, 'tasks'>): ReadonlyArray<UnitTest> => {
  const parts = new Set(
    dry.tasks
      .filter((task) => task.task === 'test' && task.command === NO_COMMAND)
      .flatMap((test) => test.dependencies.filter((id) => id.startsWith(`${test.package}#`))),
  );
  return dry.tasks
    .filter(
      (task) =>
        task.command !== NO_COMMAND &&
        (task.task === 'test' || (PART.test(task.task) && parts.has(task.taskId))),
    )
    .map((task) => ({
      workspace: task.package,
      directory: task.directory,
      task: task.task,
      taskId: task.taskId,
      command: task.command,
    }))
    .toSorted((a, b) => a.workspace.localeCompare(b.workspace) || a.task.localeCompare(b.task));
};

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
