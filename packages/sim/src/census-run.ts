/**
 * `bun run census:slow`: run this package's slow tests once with a JUnit
 * report and judge each case's time (`census.ts`). It prints one line per
 * case over the limit, then `census: <verdict> …`, and exits 0 when every
 * case is under the limit, 1 when one is over on a quiet host or the tests
 * fail, and 2 when one is over on a loaded host (unjudged).
 */
import { loadavg } from 'node:os';

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, FileSystem, Path } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { casesOf, judge, LIMIT, QUIET } from './census.ts';

const oneMinute = () => loadavg()[0] ?? 0;

const EXITS = { pass: 0, over: 1, unjudged: 2 } as const;

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'sim-census-' });
  const report = path.join(dir, 'slow.xml');
  const before = oneMinute();
  const handle = yield* spawner.spawn(
    ChildProcess.make(
      process.execPath,
      ['test', '.slow.test.', '--reporter=junit', `--reporter-outfile=${report}`],
      {
        cwd: path.join(import.meta.dirname, '..'),
        stdin: 'ignore',
        stdout: 'inherit',
        stderr: 'inherit',
        forceKillAfter: '5 seconds',
      },
    ),
  );
  const code = yield* handle.exitCode;
  const after = oneMinute();
  const cases = casesOf(yield* fs.readFileString(report).pipe(Effect.orElseSucceed(() => '')));
  const found = judge(cases, before, after);
  for (const one of found.over)
    yield* Console.log(`census over ${one.seconds.toFixed(2)} s ${one.file} ${one.name}`);
  const load = `load ${before.toFixed(1)} before, ${after.toFixed(1)} after (quiet <= ${QUIET})`;
  if (code !== 0 || cases.length === 0) {
    yield* Console.log(
      `census: failed: the slow tests exited ${code} with ${cases.length} cases; ${load}`,
    );
    return 1;
  }
  yield* Console.log(
    `census: ${found.verdict}: ${found.over.length} of ${cases.length} cases over ${LIMIT} s; ${load}`,
  );
  return EXITS[found.verdict];
}).pipe(
  Effect.scoped,
  Effect.flatMap((code) =>
    Effect.sync(() => {
      process.exitCode = code;
    }),
  ),
  Effect.provide(BunServices.layer),
);

BunRuntime.runMain(program);
