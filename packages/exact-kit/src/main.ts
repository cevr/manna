import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, Path } from 'effect';

import { runExact } from './run.ts';

/** `bun run exact <args>` in an app: the wrapper over `exact-cli.ts`, its refusal printed, its exit code the child's. */
export const main = (appDir: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const launcher = yield* path.fromFileUrl(new URL('./exact-cli.ts', import.meta.url));
    return yield* runExact(appDir, args, launcher);
  }).pipe(
    Effect.catchTag('ExactRefused', (refused) => Effect.as(Console.error(refused.message), 2)),
    // oxlint-disable-next-line effect/noGlobals -- the wrapper exits with its child's code, as `bun exact.mjs` does
    Effect.flatMap((code) => Effect.sync(() => process.exit(code))),
    Effect.provide(BunServices.layer),
    BunRuntime.runMain,
  );
