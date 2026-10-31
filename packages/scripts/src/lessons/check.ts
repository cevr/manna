#!/usr/bin/env bun
// The lessons ledger's check (`ledger.ts`), run by `gate.sh` beside the lint
// and by the pre-commit (`lefthook.yml`) on every commit: each entry of
// `docs/lessons.md` held to its fields, and each guard to what its file holds.
// A guard names files anywhere in the repo, and a rename in any of them can
// break an entry, so the check reads the working tree on every run; turbo's
// cached `test` could hash only a fixed list of inputs. Prints each problem as
// `lessons <entry>: <problem>`, then one line of counts and time; exits 1 on
// any problem.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Clock, Console, Effect, Path } from 'effect';

import { ledgerProblems } from './ledger.js';

Effect.gen(function* () {
  const path = yield* Path.Path;
  const started = yield* Clock.currentTimeMillis;
  // packages/scripts/src/lessons → the repo root.
  const root = path.resolve(import.meta.dir, '..', '..', '..', '..');
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
