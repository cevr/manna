import { Cause, Context, Effect, Layer, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

export interface AppleScriptService {
  readonly exec: (script: string) => Effect.Effect<string, Cause.UnknownError>;

  readonly execJxa: (script: string) => Effect.Effect<string, Cause.UnknownError>;
}

export class AppleScript extends Context.Service<AppleScript, AppleScriptService>()(
  '@manna/cli/services/apple-script/AppleScript',
) {}

export const AppleScriptLive = Layer.effect(
  AppleScript,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const exec = (script: string) =>
      spawner
        .string(ChildProcess.make('osascript', ['-e', script], { forceKillAfter: '5 seconds' }))
        .pipe(Effect.mapError((cause) => new Cause.UnknownError(cause)));
    const execJxa = (script: string) =>
      Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* spawner.spawn(
            ChildProcess.make('osascript', ['-l', 'JavaScript', '-e', script], {
              forceKillAfter: '5 seconds',
            }),
          );
          const [out, err, code] = yield* Effect.all(
            [
              Stream.decodeText(handle.stdout).pipe(Stream.mkString),
              Stream.decodeText(handle.stderr).pipe(Stream.mkString),
              handle.exitCode,
            ],
            { concurrency: 'unbounded' },
          );
          if (code !== 0) {
            return yield* new Cause.UnknownError(
              `osascript (JXA) exited ${code}: ${err.trim() || out.trim()}`,
            );
          }
          return out;
        }),
      ).pipe(Effect.mapError((cause) => new Cause.UnknownError(cause)));
    return AppleScript.of({ exec, execJxa });
  }),
);
