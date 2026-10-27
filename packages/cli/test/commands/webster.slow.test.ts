import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Option, Result, Schema, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import { expect, it } from 'effect-bun-test';

import { dataCandidates } from '../../src/lib/paths.js';
import { initializeWebster } from '../../src/commands/webster.js';

const root = new URL('../../../../', import.meta.url).pathname.replace(/\/$/u, '');

it.scoped('keeps a verified active runtime corpus unchanged across repeated init', () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'webster-runtime-' });
    const destination = `${dir}/webster.db`;
    yield* initializeWebster({
      directory: dir,
      packagedPaths: [`${root}/packages/core/data/webster.db`],
      workspaceRoot: '/nonexistent/webster-workspace',
    });
    const before = yield* fs.readFile(destination);
    const input = {
      directory: dir,
      packagedPaths: [],
      workspaceRoot: '/nonexistent/webster-workspace',
    };
    expect(yield* initializeWebster(input)).toMatchObject({
      _tag: 'Success',
      success: { skipped: ['canonical'] },
    });
    expect(yield* initializeWebster(input)).toMatchObject({
      _tag: 'Success',
      success: { skipped: ['canonical'] },
    });
    expect(yield* fs.readFile(destination)).toEqual(before);
    expect(yield* initializeWebster({ ...input, refresh: true })).toMatchObject({
      _tag: 'Success',
      success: { activated: [{ corpus: 'webster', installed: 62391 }] },
    });
  }).pipe(Effect.provide(BunServices.layer)),
);
const decode = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      query: Schema.String,
      entries: Schema.Array(
        Schema.Struct({ id: Schema.Int, headword: Schema.String, definition: Schema.String }),
      ),
    }),
  ),
);

const runCompiled = Effect.fn('WebsterTest.runCompiled')(
  function* (executable: string, home: string, cwd: string, args: readonly string[]) {
    const spawner = yield* ChildProcessSpawner;
    const child = yield* spawner.spawn(
      ChildProcess.make(executable, args, {
        cwd,
        env: { HOME: home, PATH: '/usr/bin:/bin', NO_COLOR: '1' },
        forceKillAfter: '5 seconds',
      }),
    );
    const [stdout, stderr, status] = yield* Effect.all(
      [
        Stream.mkString(Stream.decodeText(child.stdout)),
        Stream.mkString(Stream.decodeText(child.stderr)),
        child.exitCode,
      ],
      { concurrency: 3 },
    );
    return { stdout, stderr, status: Number(status) };
  },
  Effect.scoped,
  Effect.timeout('20 seconds'),
);

it.scoped(
  'relocated CLI reads packaged corpus without checkout fallback and preserves active data after failed refresh',
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'webster-relocated-' });
      const home = `${dir}/home`;
      const bin = `${dir}/relocated`;
      const cwd = `${dir}/unrelated`;
      for (const folder of [home, `${bin}/data`, cwd])
        yield* fs.makeDirectory(folder, { recursive: true });
      const executable = `${bin}/manna`;
      // Compile production entry without reading or embedding a developer .env.
      const built = yield* Effect.promise(() =>
        Bun.build({
          entrypoints: [`${root}/packages/cli/src/main.ts`],
          target: 'bun',
          compile: { outfile: executable, autoloadBunfig: false },
          define: { 'globalThis.__MANNA_CLI_ROOT__': '"/nonexistent/webster-build-root"' },
          plugins: [
            {
              name: 'text-only-sharp',
              setup(builder) {
                builder.onResolve({ filter: /^sharp$/u }, () => ({
                  path: `${root}/packages/cli/scripts/sharp-stub.ts`,
                }));
              },
            },
          ],
        }),
      );
      expect(built.success).toBe(true);
      yield* fs.copyFile(`${root}/packages/core/data/webster.db`, `${bin}/data/webster.db`);
      for (const name of ['webster1828-LICENSE.txt', 'webster1828-NOTICE.md'])
        yield* fs.copyFile(`${root}/packages/core/assets/${name}`, `${bin}/data/${name}`);
      const destination = `${home}/.bible/webster.db`;
      const candidates = dataCandidates(
        { executableDir: bin, buildRoot: Option.none() },
        'webster.db',
      );
      const input = {
        directory: `${home}/.bible`,
        packagedPaths: candidates,
        workspaceRoot: '/nonexistent/webster-workspace',
      };
      const first = yield* initializeWebster(input);
      expect(first).toMatchObject({
        _tag: 'Success',
        success: { activated: [{ corpus: 'webster', installed: 62391 }] },
      });
      expect(yield* initializeWebster(input)).toMatchObject({
        _tag: 'Success',
        success: { skipped: ['canonical'] },
      });
      expect(yield* initializeWebster({ ...input, refresh: true })).toMatchObject({
        _tag: 'Success',
        success: { activated: [{ corpus: 'webster', installed: 62391 }] },
      });
      const lookup = yield* runCompiled(executable, home, cwd, ['webster', 'dismayed', '--json']);
      expect(lookup.status).toBe(0);
      expect(decode(lookup.stdout).entries[0]?.headword).toBe('dismayed');
      const verb = yield* runCompiled(executable, home, cwd, ['webster', 'doeth', '--json']);
      expect(decode(verb.stdout).entries[0]?.headword).toBe('do');
      const search = yield* runCompiled(executable, home, cwd, [
        'webster',
        'search',
        'disheartened',
        '--limit',
        '1',
        '--json',
      ]);
      expect(search.status).toBe(0);
      expect(decode(search.stdout).entries[0]?.headword).toBe('dismayed');
      const previous = yield* fs.readFile(destination);
      yield* fs.writeFileString(`${bin}/data/webster.db`, 'corrupt candidate');
      expect(Result.isFailure(yield* initializeWebster({ ...input, refresh: true }))).toBe(true);
      expect(yield* fs.readFile(destination)).toEqual(previous);
      expect(
        (yield* runCompiled(executable, home, cwd, ['webster', 'dismayed', '--json'])).status,
      ).toBe(0);
      const preserved = yield* initializeWebster({
        ...input,
        packagedPaths: [`${bin}/absent.db`],
        refresh: false,
      });
      expect(preserved).toMatchObject({ _tag: 'Success', success: { skipped: ['canonical'] } });
      expect(yield* fs.readFile(destination)).toEqual(previous);
    }).pipe(Effect.provide(BunServices.layer)),
  120000,
);
