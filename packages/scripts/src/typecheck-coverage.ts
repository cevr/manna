#!/usr/bin/env bun

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, Path } from 'effect';

import { check } from './typecheck-coverage/check.js';

Effect.gen(function* () {
  const path = yield* Path.Path;
  return yield* check(path.resolve(import.meta.dir, '..'));
}).pipe(
  Effect.tapError((error) => {
    if (error._tag !== 'ListFailed' && error._tag !== 'Uncovered' && error._tag !== 'Unchecked') {
      return Effect.void;
    }
    return Console.error(error.message);
  }),
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
