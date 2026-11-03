#!/usr/bin/env bun

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Path, Stdio } from 'effect';
import { availableParallelism } from 'node:os';

import { gateFiles } from './guard/files.js';
import { runParts } from './guard/parts.js';

Effect.gen(function* () {
  const path = yield* Path.Path;
  const root = path.resolve(import.meta.dir, '..', '..', '..');
  const files = yield* gateFiles(root);
  const passed = yield* (yield* Stdio.Stdio).args;
  const code = yield* runParts(
    root,
    'node_modules/.bin/oxfmt',
    [`--threads=${availableParallelism()}`, '--no-error-on-unmatched-pattern', ...passed],
    [files].filter((part) => part.length > 0),
  );
  yield* Effect.sync(() => {
    process.exitCode = code;
  });
}).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
