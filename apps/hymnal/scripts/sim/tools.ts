import { Duration, Effect, Stream } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { ReadinessTimedOut, ToolFailed, ToolMissing } from './errors.ts';

export interface Finished {
  readonly exitCode: number;
  readonly output: string;
}

const text = (stream: Stream.Stream<Uint8Array, PlatformError>) =>
  Stream.mkString(Stream.decodeText(stream));

const isNotFound = (error: PlatformError) =>
  error.reason._tag === 'NotFound' && error.reason.module === 'ChildProcess';

export const attempt = Effect.fn('Sim.attempt')(function* (
  tool: string,
  args: ReadonlyArray<string>,
  limit: Duration.Duration,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const run = Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make(tool, [...args], { detached: false, forceKillAfter: '3 seconds' }),
      );
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [text(handle.stdout), text(handle.stderr), handle.exitCode],
        { concurrency: 3 },
      );
      const finished: Finished = { exitCode, output: `${stdout}${stderr}` };
      return finished;
    }),
  );
  return yield* run.pipe(
    Effect.catchIf(isNotFound, () => Effect.fail(ToolMissing.make({ tool }))),
    Effect.mapError((error) => {
      if (error._tag === 'ToolMissing') return error;
      return ToolFailed.make({ tool, args: [...args], exitCode: -1, output: error.message });
    }),
    Effect.timeoutOrElse({
      duration: limit,
      orElse: () =>
        Effect.fail(
          ToolFailed.make({
            tool,
            args: [...args],
            exitCode: -1,
            output: `still running after ${Duration.toSeconds(limit)} s`,
          }),
        ),
    }),
  );
});

export const succeed = Effect.fn('Sim.succeed')(function* (
  tool: string,
  args: ReadonlyArray<string>,
  limit: Duration.Duration,
) {
  const finished = yield* attempt(tool, args, limit);
  if (finished.exitCode !== 0)
    return yield* ToolFailed.make({
      tool,
      args: [...args],
      exitCode: finished.exitCode,
      output: finished.output.trim().slice(-2000),
    });
  return finished.output;
});

export const ready = <A, E, R>(what: string, seconds: number, check: Effect.Effect<A, E, R>) =>
  check.pipe(
    Effect.tapError(() => Effect.sleep('500 millis')),
    Effect.eventually,
    Effect.timeoutOrElse({
      duration: Duration.seconds(seconds),
      orElse: () => Effect.fail(ReadinessTimedOut.make({ what, seconds })),
    }),
  );
