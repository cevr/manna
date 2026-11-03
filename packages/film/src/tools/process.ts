import { Duration, Effect, FileSystem, Stream } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import type { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { ProcessTimedOut } from './errors.ts';

export interface Finished {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

const text = (stream: Stream.Stream<Uint8Array, PlatformError>) =>
  Stream.mkString(Stream.decodeText(stream));

export const collect = (
  spawner: ChildProcessSpawner.ChildProcessSpawner['Service'],
  command: ChildProcess.Command,
): Effect.Effect<Finished, PlatformError> =>
  Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(command);
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [text(handle.stdout), text(handle.stderr), handle.exitCode],
        { concurrency: 3 },
      );
      return { exitCode, stdout, stderr };
    }),
  );

export const collectWithin = (
  spawner: ChildProcessSpawner.ChildProcessSpawner['Service'],
  name: string,
  command: ChildProcess.Command,
  limit: Duration.Duration,
): Effect.Effect<Finished, PlatformError | ProcessTimedOut> =>
  collect(spawner, command).pipe(
    Effect.timeoutOrElse({
      duration: limit,
      orElse: () =>
        Effect.fail(ProcessTimedOut.make({ command: name, seconds: Duration.toSeconds(limit) })),
    }),
  );

interface Outputs {
  readonly stdout: string;
  readonly stderr: string;
}

export const runInto = (
  spawner: ChildProcessSpawner.ChildProcessSpawner['Service'],
  name: string,
  command: ChildProcess.Command,
  limit: Duration.Duration,
  outputs: Outputs,
): Effect.Effect<number, PlatformError | ProcessTimedOut, FileSystem.FileSystem> =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const handle = yield* spawner.spawn(command);
      const [, , exitCode] = yield* Effect.all(
        [
          Stream.run(handle.stdout, fs.sink(outputs.stdout)),
          Stream.run(handle.stderr, fs.sink(outputs.stderr)),
          handle.exitCode,
        ],
        { concurrency: 3 },
      );
      return exitCode;
    }),
  ).pipe(
    Effect.timeoutOrElse({
      duration: limit,
      orElse: () =>
        Effect.fail(ProcessTimedOut.make({ command: name, seconds: Duration.toSeconds(limit) })),
    }),
  );

export const isNotFound = (error: PlatformError): boolean =>
  error.reason._tag === 'NotFound' && error.reason.module === 'ChildProcess';
