// A Chrome's profile folder is its process's own. That every Chrome is
// spawned by chrome.ts alone (`openView`), which silences it, is lint
// (packages/film/lint/webview-through-chrome.ts); that a running Chrome
// carries the flags is read from its own command line by the browser tests
// (`e2e/lab/fixtures/browsers.dom.test.ts`).

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem } from 'effect';
import { profileFolder } from './chrome-profile.ts';

/** A process id past every system's limit: no process runs as it. */
const STOPPED = 2 ** 30;

describe("a Chrome's profile folder", () => {
  it.effect.layer(BunServices.layer)(
    'is this process, after the folders of processes that stopped are removed',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const root = yield* fs.makeTempDirectoryScoped();
          yield* fs.makeDirectory(`${root}/${STOPPED}/Default`, { recursive: true });
          yield* fs.makeDirectory(`${root}/${process.ppid}`);
          yield* fs.makeDirectory(`${root}/not-a-pid`);
          const folder = yield* profileFolder(root);
          expect(folder).toBe(`${root}/${process.pid}`);
          expect((yield* fs.readDirectory(root)).toSorted()).toEqual(
            [String(process.pid), String(process.ppid), 'not-a-pid'].toSorted(),
          );
        }),
      ),
  );
});
