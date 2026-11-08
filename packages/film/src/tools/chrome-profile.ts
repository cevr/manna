// oxlint-disable-next-line effect/noNodeBuiltinImport -- the exit handler's delete: an exiting process runs no effect, only synchronous calls
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { Effect, FileSystem, Option, Path } from 'effect';
import { BrowserFailed } from './errors.ts';

/**
 * Where every process's Chrome keeps its profile, a folder per process id,
 * unless `FILM_CHROME_PROFILES` names another. `bun test` runs no exit
 * handler (Bun 1.4.4), so the e2e runner (`lab/fixtures/run-suite.ts`) names
 * a folder of its run's own, released once its workers have exited.
 */
export const PROFILE_ROOT = `${tmpdir()}/bible-film-chrome`;

/** The process group of this process's Chrome while one runs: its leader's pid, as its launch started it. */
let group: Option.Option<number> = Option.none();

/** This process's Chrome is now the group `leader` leads (`tools/chrome.ts`, on each launch). */
export const holdChrome = (leader: number): void => {
  group = Option.some(leader);
};

/** The group `leader` led is gone (its Chrome closed the pipe): it is not signalled again. */
export const releaseChrome = (leader: number): void => {
  group = Option.filter(group, (held) => held !== leader);
};

/**
 * Ends this process's Chrome at once, synchronously: SIGKILL to the process
 * group its launch started, and nothing else. The exit handler calls it
 * before it removes the profile, and the lab's relaunch before it replaces
 * this process.
 */
export const endChrome = (): void => {
  Option.map(group, (leader) =>
    Effect.runSync(Effect.ignore(Effect.try(() => process.kill(-leader, 'SIGKILL')))),
  );
  group = Option.none();
};

/** Whether process `pid` still runs (`EPERM`: it runs, as another user). */
const alive = (pid: number) =>
  Effect.try(() => process.kill(pid, 0)).pipe(
    Effect.as(true),
    Effect.catch((error) => Effect.succeed(Reflect.get(Object(error.cause), 'code') === 'EPERM')),
  );

/** Removes the profiles under `root` whose processes no longer run. */
const removeOrphans = (root: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(root, { recursive: true });
    const orphans = yield* Effect.filter(
      (yield* fs.readDirectory(root)).filter((name) => /^\d+$/.test(name)),
      (name) => Effect.map(alive(Number(name)), (running) => !running),
    );
    yield* Effect.forEach(
      orphans,
      (name) => Effect.ignore(fs.remove(path.join(root, name), { recursive: true })),
      { discard: true },
    );
  });

/**
 * This process's Chrome profile, `<root>/<pid>`, removed when the process
 * exits (after its Chrome is killed). A process that runs no exit handler
 * (one killed, or a `bun test` worker) leaves its folder, so the orphans are
 * removed first.
 */
export const profileFolder = (root: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* removeOrphans(root);
    const folder = path.join(root, String(process.pid));
    yield* fs.makeDirectory(folder, { recursive: true });
    process.once('exit', () => {
      endChrome();
      rmSync(folder, { recursive: true, force: true });
    });
    return folder;
  }).pipe(Effect.mapError((cause) => BrowserFailed.make({ reason: String(cause) })));
