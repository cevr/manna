#!/usr/bin/env bun
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Config, Console, Effect, Path } from 'effect';

import { toPin } from './pin.ts';

/** `EXACT=<clone> bun packages/exact-kit/src/patch.ts`: the clone brought to the pin, or why not, exiting 2. */
Effect.gen(function* () {
  const path = yield* Path.Path;
  const clone = yield* Config.String('EXACT');
  const patches = path.join(
    yield* path.fromFileUrl(new URL('.', import.meta.url)),
    '..',
    'patches',
  );
  const pin = yield* toPin(clone, patches);
  yield* Console.log(`exact patch: ${clone} is at the pin ${pin}`);
  return 0;
}).pipe(
  Effect.catchTag('PatchRefused', (refused) => Effect.as(Console.error(refused.message), 2)),
  // oxlint-disable-next-line effect/noGlobals -- a refused replay exits non-zero, as the wrapper does
  Effect.flatMap((code) => Effect.sync(() => process.exit(code))),
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
