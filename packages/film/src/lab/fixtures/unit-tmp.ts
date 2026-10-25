// Preloaded by the unit test script (package.json `test`) after bunfig's
// preload: the unit tests' temp folders, and the modules they write there and
// import, live under `/tmp/manna-film-<user>`, not under the system's
// `$TMPDIR`. Bun reads every folder above a module it resolves, once a
// process, and the laptop's `$TMPDIR` holds about 30,000 entries (20-50 ms a
// test file that imports from it, alone); `/tmp` holds a few thousand. The
// folder stays outside any git checkout and holds no dot segment, as the
// tests that stand for "outside a checkout" (`stamp.test.ts`) and for "a
// path the router reads as a film name" (`choices-http.test.ts`) need.
// `os.tmpdir()` reads `TMPDIR` at each call, so every `makeTempDirectory`
// after this makes its folder there, and the child processes a test spawns
// inherit it. Each test removes the folders it makes in its own scope; the
// folder itself is the user's, kept between runs.

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
