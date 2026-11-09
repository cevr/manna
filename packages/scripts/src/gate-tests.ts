#!/usr/bin/env bun

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, Option, Path } from 'effect';
import { availableParallelism } from 'node:os';

import { gateTestsCommand, POLL_MS, runBounded, share, TASK_BOUND_MS } from './gate-tests/bound.ts';

/**
 * The gate's unit tests: `turbo run test` at a share of the cores, under a
 * watchdog that ends the run with 124 when a task's process outlives
 * `TASK_BOUND_MS`, and names each such process.
 */
Effect.gen(function* () {
  const path = yield* Path.Path;
  const root = path.resolve(import.meta.dir, '../../..');
  const cores = availableParallelism();
  yield* Console.log(
    `gate: tests at concurrency ${share(cores)} of ${cores} cores, a task past ${TASK_BOUND_MS / 1_000} s is a hang`,
  );
  const ended = yield* runBounded({
    command: gateTestsCommand(cores),
    cwd: root,
    boundMs: TASK_BOUND_MS,
    pollMs: POLL_MS,
  });
  yield* Option.match(ended.over, {
    onNone: () => Effect.void,
    onSome: (over) =>
      Console.error(
        `gate: a test task outlived ${TASK_BOUND_MS / 1_000} s, so the run was ended:\n${over}`,
      ),
  });
  yield* Effect.sync(() => {
    process.exitCode = ended.code;
  });
}).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
