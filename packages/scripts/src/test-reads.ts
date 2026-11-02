#!/usr/bin/env bun
// `bun run test:reads`: each file, module and native library a unit-test
// task's bun processes open is a file that cached task hashes. A unit-test
// task (`test-budget/units.ts`) is a workspace's `test`, or each part of a
// workspace whose tests are cut into parts (`@manna/film#test:lab`). turbo
// replays a cached pass while the files a task hashes are unchanged, so a test
// that reads a file its task does not hash (a skill page, a root file, another
// workspace's data, a library built on the host) passes from the cache after
// that file changes in a way that would fail it.
//
// This runs each unit-test task's script, the ones `bun run test` runs, one
// after another, under a preload that records what their bun processes open
// (`test-reads/preload.ts`, which names what it does not see), then holds the
// reads to the files turbo's dry run says the task hashes, its dependencies'
// `transit` tasks included (`test-reads/unhashed.ts`). It prints each task's
// count and each file read and not hashed, and fails on any such file, or on
// a task whose tests do not pass (its reads would be partial). The fix is the
// file in the task's inputs in its workspace's `turbo.json`
// (`$TURBO_ROOT$/<path>`), and in its `transit` inputs when other workspaces'
// tests read it through this one. Run by `bun run test:slow`; it runs every
// unit test, so it is not in the gate.

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
  // packages/scripts/src → the repo root, as the preload resolves paths.
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
