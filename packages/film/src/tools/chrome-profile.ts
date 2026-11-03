// oxlint-disable-next-line effect/noNodeBuiltinImport -- the exit handler's delete: an exiting process runs no effect, only synchronous calls
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { Effect, FileSystem, Path } from 'effect';
import { BrowserFailed } from './errors.ts';

export const PROFILE_ROOT = `${tmpdir()}/bible-film-chrome`;

const alive = (pid: number) =>
  Effect.try(() => process.kill(pid, 0)).pipe(
    Effect.as(true),
    Effect.catch((error) => Effect.succeed(Reflect.get(Object(error.cause), 'code') === 'EPERM')),
  );

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

export const profileFolder = (root: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* removeOrphans(root);
    const folder = path.join(root, String(process.pid));
    yield* fs.makeDirectory(folder, { recursive: true });
    process.once('exit', () => {
      Bun.WebView.closeAll();
      rmSync(folder, { recursive: true, force: true });
    });
    return folder;
  }).pipe(Effect.mapError((cause) => BrowserFailed.make({ reason: String(cause) })));
