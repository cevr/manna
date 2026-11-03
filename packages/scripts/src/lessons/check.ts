#!/usr/bin/env bun

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Clock, Console, Effect, Path, Stdio } from 'effect';

import { ledgerProblems } from './ledger.js';

Effect.gen(function* () {
  const path = yield* Path.Path;
  const started = yield* Clock.currentTimeMillis;
  const [given] = yield* (yield* Stdio.Stdio).args;
  const root = path.resolve(given ?? path.join(import.meta.dir, '..', '..', '..', '..'));
  const { entries, problems } = yield* ledgerProblems(root);
  yield* Effect.forEach(problems, (problem) => Console.log(`lessons ${problem}`), {
    discard: true,
  });
  const ended = yield* Clock.currentTimeMillis;
  yield* Console.log(
    `lessons: ${entries} entries, ${problems.length} problem(s), ${ended - started} ms`,
  );
  yield* Effect.sync(() => {
    process.exitCode = Math.min(problems.length, 1);
  });
}).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
