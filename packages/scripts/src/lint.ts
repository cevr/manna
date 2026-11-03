#!/usr/bin/env bun

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Path, Stdio } from 'effect';
import { availableParallelism } from 'node:os';

import { gateFiles, lintIgnored } from './guard/files.js';
import { partsOf, runParts, shareOf, sizesOf } from './guard/parts.js';

/** The files oxlint lints, by extension. */
const LINTED = /\.[cm]?[jt]sx?$/;

Effect.gen(function* () {
  const path = yield* Path.Path;
  const root = path.resolve(import.meta.dir, '..', '..', '..');
  const ignored = yield* lintIgnored(root);
  const files = (yield* gateFiles(root)).filter((file) => LINTED.test(file) && !ignored(file));
  const passed = yield* (yield* Stdio.Stdio).args;
  const share = shareOf(availableParallelism());
  const parts = partsOf(yield* sizesOf(root, files), share.parts);
  const code = yield* runParts(
    root,
    'node_modules/.bin/oxlint',
    [`--threads=${share.threads}`, ...passed],
    parts,
  );
  yield* Effect.sync(() => {
    process.exitCode = code;
  });
}).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
