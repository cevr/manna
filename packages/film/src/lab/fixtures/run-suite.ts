import { availableParallelism, loadavg } from 'node:os';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Config, Console, Effect, FileSystem, Stdio } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import { ENTRIES, compile } from './bundles.ts';
import { runFolder } from './run-folder.ts';
import { workersFor } from './workers.ts';

const run = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const dir = yield* runFolder('film-test-bundles-');
  yield* Effect.forEach(
    ENTRIES,
    (entry) =>
      Effect.flatMap(compile(entry), (script) => fs.writeFileString(`${dir}/${entry}.js`, script)),
    { concurrency: 3 },
  );
  const args = yield* (yield* Stdio.Stdio).args;
  const [load = 0] = loadavg();
  const ci = yield* Config.Boolean('CI').pipe(Config.withDefault(false));
  const cores = availableParallelism();
  const workers = workersFor({ cores, load, ci });
  if (args.includes('--parallel'))
    yield* Console.log(
      `run-suite: ${workers} workers (${cores} cores, load ${load.toFixed(1)}, CI ${ci})`,
    );
  const spawner = yield* ChildProcessSpawner;
  const child = yield* spawner.spawn(
    ChildProcess.make(
      process.execPath,
      [
        'test',
        ...args.map((arg) => {
          if (arg === '--parallel') return `--parallel=${workers}`;
          return arg;
        }),
      ],
      {
        env: { FILM_TEST_BUNDLES: dir, FILM_CHROME_PROFILES: `${dir}/chrome` },
        extendEnv: true,
        stdin: 'inherit',
        stdout: 'inherit',
        stderr: 'inherit',
        forceKillAfter: '5 seconds',
      },
    ),
  );
  const code = yield* child.exitCode;
  yield* Effect.sync(() => {
    process.exitCode = code;
  });
}).pipe(Effect.scoped, Effect.provide(BunServices.layer));

BunRuntime.runMain(run);
