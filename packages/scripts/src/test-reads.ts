#!/usr/bin/env bun

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, FileSystem, Path, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import { testDryRun, unitTests } from './test-budget/units.js';
import { readsEnv } from './test-reads/env.js';
import { hashedBy, unhashed } from './test-reads/unhashed.js';

const drain = <E>(stream: Stream.Stream<Uint8Array, E>) => Stream.runDrain(stream);

Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner;
  const root = yield* fs.realPath(path.resolve(import.meta.dir, '..', '..', '..'));
  const preload = path.join(import.meta.dir, 'test-reads', 'preload.ts');
  const dry = yield* testDryRun(root, path.join(root, 'node_modules', '.bin', 'turbo'));
  const tests = unitTests(dry);
  const scratch = yield* fs.makeTempDirectoryScoped({ prefix: 'test-reads-' });

  const failures = yield* Effect.forEach(tests, (unit) =>
    Effect.gen(function* () {
      const log = path.join(scratch, `${unit.taskId.replaceAll(/[/#:]/g, '_')}.reads`);
      yield* fs.writeFileString(log, '');
      const code = yield* Effect.scoped(
        Effect.flatMap(
          spawner.spawn(
            ChildProcess.make('bun', ['run', unit.task], {
              cwd: path.join(root, unit.directory),
              env: readsEnv(preload, log),
              extendEnv: true,
              forceKillAfter: '5 seconds',
            }),
          ),
          (child) =>
            Effect.map(
              Effect.all([drain(child.stdout), drain(child.stderr), child.exitCode], {
                concurrency: 3,
              }),
              ([, , exit]) => Number(exit),
            ),
        ),
      );
      const reads = (yield* fs.readFileString(log)).split('\n').filter((line) => line !== '');
      const candidates = unhashed(root, reads, hashedBy(dry.tasks, unit.taskId));
      const files = yield* Effect.filter(candidates, (file) =>
        fs.stat(path.join(root, file)).pipe(
          Effect.map((info) => info.type === 'File'),
          Effect.orElseSucceed(() => false),
        ),
      );
      yield* Console.log(
        `test-reads ${unit.taskId}: test exit ${code}, ${new Set(reads).size} paths read, ${files.length} not hashed`,
      );
      yield* Effect.forEach(files, (file) => Console.log(`  not hashed: ${file}`), {
        discard: true,
      });
      return files.length + Number(code !== 0);
    }),
  );
  const failed = failures.reduce((sum, each) => sum + each, 0);
  yield* Console.log(`test-reads: ${tests.length} unit-test tasks, ${failed} failures`);
  yield* Effect.sync(() => {
    process.exitCode = Number(failed > 0);
  });
}).pipe(Effect.scoped, Effect.provide(BunServices.layer), BunRuntime.runMain);
