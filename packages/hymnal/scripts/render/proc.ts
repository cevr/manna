import { Effect, Schema, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

export class RenderFailed extends Schema.TaggedError<RenderFailed>()('RenderFailed', {
  step: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.step}: ${this.reason}`;
  }
}

export const run = (command: string, args: ReadonlyArray<string>, cwd?: string) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner;
    const child = yield* spawner.spawn(
      ChildProcess.make(command, args, { cwd, forceKillAfter: '5 seconds' }),
    );
    const [stdout, stderr, code] = yield* Effect.all(
      [
        Stream.mkString(Stream.decodeText(child.stdout)),
        Stream.mkString(Stream.decodeText(child.stderr)),
        child.exitCode,
      ],
      { concurrency: 3 },
    );
    return { stdout, stderr, code: Number(code) };
  }).pipe(
    Effect.scoped,
    Effect.mapError((error) =>
      RenderFailed.make({ step: command, reason: `could not run: ${error.message}` }),
    ),
  );

export const runOk = (step: string, command: string, args: ReadonlyArray<string>, cwd?: string) =>
  run(command, args, cwd).pipe(
    Effect.filterOrFail(
      (out) => out.code === 0,
      (out) =>
        RenderFailed.make({
          step,
          reason: `exit ${out.code}: ${`${out.stdout}\n${out.stderr}`.trim().slice(-3000)}`,
        }),
    ),
  );
