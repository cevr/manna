import { describe, expect, it } from 'effect-bun-test';
import { Effect, Exit } from 'effect';
import { Relaunch } from './exports-watch.ts';
import { RelaunchBun } from './relaunch-bun.ts';

describe('the relaunch over Bun', () => {
  it.effect('ends Chrome, then starts the command again in this process', () => {
    const seen: Array<unknown> = [];
    const execve = process.execve;
    const closeAll = Bun.WebView.closeAll;
    return Effect.acquireUseRelease(
      Effect.sync(() => {
        Bun.WebView.closeAll = () => {
          seen.push('chrome ended');
        };
        process.execve = (file, args): never => {
          seen.push({ execve: file, args });
          // oxlint-disable-next-line effect/noThrowStatement, effect/noNewError -- execve's own contract: it never returns, so the stand-in throws where the real one replaces the process
          throw new Error('started again');
        };
      }),
      () =>
        Effect.gen(function* () {
          const ended = yield* Effect.exit(Effect.flatMap(Relaunch, (r) => r.relaunch('a test')));
          expect(Exit.hasDies(ended)).toBe(true);
          expect(seen).toEqual([
            'chrome ended',
            {
              execve: process.execPath,
              // oxlint-disable-next-line effect/noGlobals -- the command line this process was started with is what the relaunch hands on
              args: [process.execPath, ...process.execArgv, ...process.argv.slice(1)],
            },
          ]);
        }),
      () =>
        Effect.sync(() => {
          Bun.WebView.closeAll = closeAll;
          process.execve = execve;
        }),
    ).pipe(Effect.provide(RelaunchBun));
  });
});
