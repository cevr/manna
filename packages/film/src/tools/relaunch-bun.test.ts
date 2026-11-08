import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Duration, Effect, Exit } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { holdChrome } from './chrome-profile.ts';
import { Relaunch } from './exports-watch.ts';
import { RelaunchBun } from './relaunch-bun.ts';

describe('the relaunch over Bun', () => {
  it.effect.layer(BunServices.layer)(
    "ends Chrome's process group, then starts the command again in this process",
    () => {
      const seen: Array<unknown> = [];
      const execve = process.execve;
      return Effect.scoped(
        Effect.gen(function* () {
          const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
          const chrome = yield* spawner.spawn(
            ChildProcess.make('sleep', ['30'], { forceKillAfter: '5 seconds' }),
          );
          yield* Effect.acquireUseRelease(
            Effect.sync(() => {
              holdChrome(chrome.pid);
              process.execve = (file, args): never => {
                seen.push({ execve: file, args });
                // oxlint-disable-next-line effect/noThrowStatement, effect/noNewError -- execve's own contract: it never returns, so the stand-in throws where the real one replaces the process
                throw new Error('started again');
              };
            }),
            () =>
              Effect.gen(function* () {
                const ended = yield* Effect.exit(
                  Effect.flatMap(Relaunch, (r) => r.relaunch('a test')),
                );
                expect(Exit.hasDies(ended)).toBe(true);
                const killed = yield* Effect.exit(chrome.exitCode).pipe(
                  Effect.timeout(Duration.seconds(5)),
                );
                expect(Exit.isSuccess(killed)).toBe(false);
                expect(yield* chrome.isRunning).toBe(false);
                expect(seen).toEqual([
                  {
                    execve: process.execPath,
                    // oxlint-disable-next-line effect/noGlobals -- the command line this process was started with is what the relaunch hands on
                    args: [process.execPath, ...process.execArgv, ...process.argv.slice(1)],
                  },
                ]);
              }),
            () =>
              Effect.sync(() => {
                process.execve = execve;
              }),
          );
        }),
      ).pipe(Effect.provide(RelaunchBun));
    },
    20_000,
  );
});
