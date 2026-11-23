import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Duration, Effect } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { collectWithin } from './process.ts';

describe('the browser', () => {
  it.live.layer(BunServices.layer)(
    "ends this process's Chrome with the scope that used it, so a command that is done exits, launches it again for the next, and keeps it for a view still open",
    () =>
      Effect.gen(function* () {
        const done = yield* collectWithin(
          yield* ChildProcessSpawner.ChildProcessSpawner,
          'chrome-idle-exit',
          ChildProcess.make('bun', [`${import.meta.dir}/fixtures/chrome-idle-exit.ts`], {
            forceKillAfter: '5 seconds',
          }),
          Duration.seconds(60),
        );
        expect([done.exitCode, done.stdout.trim()]).toEqual([
          0,
          '{"open":1,"closed":0,"again":1,"beside":42,"last":0}',
        ]);
      }),
    70_000,
  );
});
