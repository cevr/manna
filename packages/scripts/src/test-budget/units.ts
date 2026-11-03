import { Effect, Schema } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

const NO_COMMAND = '<NONEXISTENT>';

const DryTask = Schema.Struct({
  taskId: Schema.String,
  task: Schema.String,
  package: Schema.String,
  directory: Schema.String,
  command: Schema.String,
  inputs: Schema.Record(Schema.String, Schema.String),
  dependencies: Schema.Array(Schema.String),
});

export const DryRun = Schema.Struct({ tasks: Schema.Array(DryTask) });
export type DryRun = typeof DryRun.Type;

export interface UnitTest {
  readonly workspace: string;
  readonly directory: string;
  readonly task: string;
  readonly taskId: string;
  readonly command: string;
}

const PART = /^test:[^:]+$/u;

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

export const testDryRun = (root: string, turbo: string) =>
  Effect.flatMap(ChildProcessSpawner, (spawner) =>
    spawner.string(
      ChildProcess.make(turbo, ['run', 'test', '--dry=json'], {
        cwd: root,
        forceKillAfter: '5 seconds',
      }),
    ),
  ).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(DryRun))));
