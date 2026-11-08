import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Path, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { gateFiles, lintIgnored } from './files.js';
import { TEST_GIT } from '../testing.js';

/** Runs `git <args>` in `cwd`, to the end. */
const git = (cwd: string, args: ReadonlyArray<string>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make('git', [...TEST_GIT, ...args], { cwd, forceKillAfter: '5 seconds' }),
      );
      yield* Stream.runDrain(handle.stdout);
      return yield* handle.exitCode;
    }),
  );

/** Writes `files` (each its text) under `dir`. */
const write = (dir: string, files: Record<string, string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* Effect.forEach(Object.entries(files), ([file, text]) =>
      Effect.gen(function* () {
        yield* fs.makeDirectory(path.dirname(path.join(dir, file)), { recursive: true });
        yield* fs.writeFileString(path.join(dir, file), text);
      }),
    );
  });

/** A repository that commits `committed`, then has `tree` written over it uncommitted. */
const repo = (committed: Record<string, string>, tree: Record<string, string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'gate-files-' });
    yield* git(dir, ['init', '-q', '-b', 'main']);
    yield* write(dir, committed);
    yield* git(dir, ['add', '-A']);
    yield* git(dir, ['commit', '-qm', 'base']);
    yield* write(dir, tree);
    return dir;
  });

const withFs = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.scoped, Effect.provide(BunServices.layer));

describe("the gate's files", () => {
  it.live(
    'are every tracked file, and new ones inside a workspace, less the ignored and the deleted',
    () =>
      withFs(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* repo(
            {
              'package.json': '{ "workspaces": ["packages/*", "apps/*/"] }',
              '.gitignore': 'out/\n',
              'README.md': '# root\n',
              'packages/a/src/kept.ts': 'export {};\n',
              'packages/a/src/gone.ts': 'export {};\n',
              'tools/script.ts': 'export {};\n',
            },
            {
              'packages/a/src/new.ts': 'export {};\n',
              'apps/b/new.tsx': 'export {};\n',
              'packages/a/out/built.ts': 'export {};\n',
              'prototypes/sketch/main.ts': 'export {};\n',
              'loose.png': 'png',
              'tools/staged.ts': 'export {};\n',
            },
          );
          yield* fs.remove(path.join(dir, 'packages/a/src/gone.ts'));
          yield* git(dir, ['add', 'tools/staged.ts']);
          expect(yield* gateFiles(dir)).toEqual([
            '.gitignore',
            'README.md',
            'apps/b/new.tsx',
            'package.json',
            'packages/a/src/kept.ts',
            'packages/a/src/new.ts',
            'tools/script.ts',
            'tools/staged.ts',
          ]);
        }),
      ),
  );

  it.live('are the tracked files alone when the root names no workspace', () =>
    withFs(
      Effect.gen(function* () {
        const dir = yield* repo({ 'src/a.ts': 'export {};\n' }, { 'src/b.ts': 'export {};\n' });
        expect(yield* gateFiles(dir)).toEqual(['src/a.ts']);
      }),
    ),
  );

  it.live("read the lint config's ignore patterns, JSONC comments and all", () =>
    withFs(
      Effect.gen(function* () {
        const dir = yield* repo(
          {
            '.oxlintrc.json':
              '{\n  // the lint\n  "ignorePatterns": ["**/dist/**", "**/fixtures/**"],\n}\n',
          },
          {},
        );
        const ignored = yield* lintIgnored(dir);
        expect(
          ['a/dist/x.ts', 'a/lint/fixtures/y.ts', 'a/src/z.ts'].filter((file) => ignored(file)),
        ).toEqual(['a/dist/x.ts', 'a/lint/fixtures/y.ts']);
      }),
    ),
  );

  it.live(
    "under the repo's own config, lint an app's declarations and still ignore a package's, the typegen forms, One's route types, node_modules and dist",
    () =>
      withFs(
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const ignored = yield* lintIgnored(path.resolve(import.meta.dir, '../../../..'));
          const linted = [
            'apps/hymnal/src/virtual.d.ts',
            'apps/heartseed/src/virtual.d.ts',
            'apps/hymnal/assets/meaning/meaning.d.ts',
            'apps/egw-search/src/vite-env.d.ts',
            'apps/firsttheblade/src/deep/er/types.d.ts',
          ];
          const left = [
            'packages/core/src/types.d.ts',
            'packages/film/src/deep/x.d.ts',
            'apps/hymnal/src/offline/Foundation.d.swift.ts',
            'apps/heartseed/modules/speech.d.kt.ts',
            'apps/hymnal/app/routes.d.ts',
            'packages/sim/src/a.d.swift.ts',
            'apps/hymnal/node_modules/one/index.d.ts',
            'node_modules/effect/dist/index.d.ts',
            'apps/heartseed/dist/index.d.ts',
            'packages/ui/dist/a.d.ts',
          ];
          expect({
            linted: linted.filter((file) => ignored(file)),
            left: left.filter((file) => !ignored(file)),
          }).toEqual({ linted: [], left: [] });
        }),
      ),
  );

  it.live('fail, tagged, when the lint config is not JSONC', () =>
    withFs(
      Effect.gen(function* () {
        const dir = yield* repo({ '.oxlintrc.json': '{ "ignorePatterns": [' }, {});
        const failed = yield* Effect.flip(lintIgnored(dir));
        expect(failed._tag).toBe('LintConfigUnreadable');
      }),
    ),
  );
});
