import * as BunServices from '@effect/platform-bun/BunServices';
import { Config, Effect, FileSystem } from 'effect';

// oxlint-disable-next-line effect/noAsyncFunction -- a preload: bun runs the first test once this module settles, the folder made
const root = await Effect.runPromise(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const user = yield* Config.String('USER').pipe(Config.withDefault('test'));
    const dir = `/tmp/manna-film-${user}`;
    yield* fs.makeDirectory(dir, { recursive: true });
    return dir;
  }).pipe(Effect.provide(BunServices.layer)),
);

// oxlint-disable-next-line node/no-process-env, effect/noGlobals -- the unit tests' temp root, which os.tmpdir() reads from the environment
process.env['TMPDIR'] = root;
