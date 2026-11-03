import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Duration, Effect, Schedule, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { launchArgs } from '../browser.ts';
import { openView } from '../chrome.ts';
import { collect } from '../process.ts';

const ours = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const ps = yield* collect(
    spawner,
    ChildProcess.make('ps', ['-axo', 'pid=,ppid=,args='], { forceKillAfter: '5 seconds' }),
  );
  return ps.stdout
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter(
      ([, ppid, ...args]) =>
        ppid === String(process.pid) && args.includes('--remote-debugging-pipe'),
    )
    .map(([pid = '', , ...args]) => ({ pid: Number(pid), args: args.join(' ') }));
});

const viewed = Effect.scoped(
  Effect.gen(function* () {
    const view = yield* openView(launchArgs, { width: 800, height: 600 });
    yield* Effect.promise(() => view.navigate('about:blank'));
    return yield* ours;
  }),
);

const Seen = Schema.fromJsonString(
  Schema.Struct({
    pid: Schema.Finite,
    first: Schema.Array(Schema.String),
    second: Schema.Array(Schema.String),
  }),
);

Effect.gen(function* () {
  const first = yield* viewed;
  for (const chrome of first) process.kill(chrome.pid, 'SIGKILL');
  yield* Effect.filterOrFail(ours, (left) => left.length === 0).pipe(
    Effect.retry({ schedule: Schedule.spaced(Duration.millis(100)), times: 50 }),
  );
  const second = yield* viewed;
  yield* Console.log(
    yield* Schema.encodeEffect(Seen)({
      pid: process.pid,
      first: first.map((c) => c.args),
      second: second.map((c) => c.args),
    }),
  );
}).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
