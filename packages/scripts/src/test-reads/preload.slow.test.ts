import { describe, expect, it } from 'effect-bun-test';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Path } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import { readsEnv } from './env.ts';

/** A test that reads a file, imports a module and loads a native library. */
const FIXTURE = `import { expect, test } from 'bun:test';

import { value } from './module.ts';

test('reads', async () => {
  const ffi = await import('bun:' + 'ffi');
  expect(() => ffi.dlopen(new URL('./native.dylib', import.meta.url).pathname, {})).toThrow();
  expect(await Bun.file(new URL('./page.md', import.meta.url)).text()).toBe('page');
  expect(value).toBe(1);
});
`;

const REALPATH_FIXTURE = `import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';

const [syncPath, callbackPath, promisePath, resultPath] = process.argv.slice(2);
const callbackRealPath = await new Promise((resolve, reject) => {
  fs.realpath.native(callbackPath, (error, realPath) => error ? reject(error) : resolve(realPath));
});
fs.writeFileSync(resultPath, JSON.stringify([
  fs.realpathSync.native(syncPath),
  callbackRealPath,
  await fsp.realpath(promisePath),
]));
`;

const PROPERTY_FIXTURE = `import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';

const READS = ['readFile', 'stat', 'lstat', 'open', 'access', 'realpath'];
const SYNC_READS = [
  'readFileSync',
  'existsSync',
  'statSync',
  'lstatSync',
  'openSync',
  'accessSync',
  'realpathSync',
  'createReadStream',
];
const ownKeys = (module, names) => Object.fromEntries(
  names.map((name) => [name, Reflect.ownKeys(module[name]).map(String)]),
);
const [resultPath] = process.argv.slice(2);
fs.writeFileSync(resultPath, JSON.stringify({
  promises: ownKeys(fsp, READS),
  sync: ownKeys(fs, [...SYNC_READS, ...READS]),
}));
`;

describe('the read recorder test:reads preloads', () => {
  it.effect.layer(BunServices.layer)(
    'preserves own property keys for every name in READS and SYNC_READS',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner;
        const dir = yield* fs.realPath(
          yield* fs.makeTempDirectoryScoped({ prefix: 'test-reads-own-properties-' }),
        );
        const fixture = path.join(dir, 'properties.ts');
        yield* fs.writeFileString(fixture, PROPERTY_FIXTURE);
        const preload = path.join(import.meta.dir, 'preload.ts');
        const log = path.join(dir, 'properties.reads');
        const run = (recorded: boolean) =>
          Effect.gen(function* () {
            const result = path.join(dir, `${recorded}.json`);
            yield* fs.writeFileString(result, '');
            if (recorded) yield* fs.writeFileString(log, '');
            const env = {
              BUN_OPTIONS: '',
              MANNA_TEST_READS: '',
              BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
            };
            if (recorded) Object.assign(env, readsEnv(preload, log));
            const exit = yield* spawner.exitCode(
              ChildProcess.make('bun', [fixture, result], {
                cwd: dir,
                env,
                extendEnv: true,
                forceKillAfter: '5 seconds',
              }),
            );
            expect(Number(exit)).toBe(0);
            return yield* fs.readFileString(result);
          });
        expect(yield* run(true)).toBe(yield* run(false));
      }).pipe(Effect.scoped),
  );

  it.effect.layer(BunServices.layer)(
    'keeps native realpath behavior and records each path when a child uses the preload',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner;
        const dir = yield* fs.realPath(
          yield* fs.makeTempDirectoryScoped({ prefix: 'test-reads-native-realpath-' }),
        );
        const targets = ['sync.txt', 'callback.txt', 'promise.txt'].map((name) =>
          path.join(dir, name),
        );
        for (const target of targets) yield* fs.writeFileString(target, 'path');
        const fixture = path.join(dir, 'realpath.ts');
        yield* fs.writeFileString(fixture, REALPATH_FIXTURE);
        const preload = path.join(import.meta.dir, 'preload.ts');
        const log = path.join(dir, 'native.reads');
        const run = (recorded: boolean) =>
          Effect.gen(function* () {
            const result = path.join(dir, `${recorded}.json`);
            yield* fs.writeFileString(result, '');
            if (recorded) yield* fs.writeFileString(log, '');
            const env = {
              BUN_OPTIONS: '',
              MANNA_TEST_READS: '',
              BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
            };
            if (recorded) Object.assign(env, readsEnv(preload, log));
            const exit = yield* spawner.exitCode(
              ChildProcess.make('bun', [fixture, ...targets, result], {
                cwd: dir,
                env,
                extendEnv: true,
                forceKillAfter: '5 seconds',
              }),
            );
            expect(Number(exit)).toBe(0);
            return yield* fs.readFileString(result);
          });
        const plain = yield* run(false);
        const recorded = yield* run(true);
        expect(recorded).toBe(plain);
        const reads = (yield* fs.readFileString(log)).split('\n').filter(Boolean);
        for (const target of targets) expect(reads).toContain(target);
      }).pipe(Effect.scoped),
  );

  it.effect.layer(BunServices.layer)(
    'records a file a test reads, a module it imports and a native library it loads, in each test runner mode',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner;
        const dir = yield* fs.realPath(
          yield* fs.makeTempDirectoryScoped({ prefix: 'test-reads-' }),
        );
        yield* fs.writeFileString(path.join(dir, 'reads.test.ts'), FIXTURE);
        yield* fs.writeFileString(path.join(dir, 'module.ts'), 'export const value = 1;\n');
        yield* fs.writeFileString(path.join(dir, 'page.md'), 'page');
        yield* fs.writeFileString(path.join(dir, 'native.dylib'), 'not a library');
        const preload = path.join(import.meta.dir, 'preload.ts');
        const recorded = (mode: string) =>
          Effect.gen(function* () {
            const log = path.join(dir, `${mode}.reads`);
            yield* fs.writeFileString(log, '');
            const exit = yield* spawner.exitCode(
              ChildProcess.make('bun', ['test', mode, './reads.test.ts'], {
                cwd: dir,
                env: readsEnv(preload, log),
                extendEnv: true,
                forceKillAfter: '5 seconds',
              }),
            );
            const reads = (yield* fs.readFileString(log)).split('\n');
            return { exit: Number(exit), reads };
          });
        for (const mode of ['--isolate', '--no-isolate', '--parallel']) {
          const { exit, reads } = yield* recorded(mode);
          expect(exit).toBe(0);
          for (const file of ['module.ts', 'page.md', 'native.dylib', 'reads.test.ts']) {
            expect(reads).toContain(path.join(dir, file));
          }
          expect(reads).not.toContain(preload);
        }
      }).pipe(Effect.scoped),
  );

  it.effect.layer(BunServices.layer)(
    'leaves nothing in the HOME of a bun process a test starts, as that process leaves without it',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner;
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'test-reads-home-' });
        const home = path.join(dir, 'home');
        yield* fs.makeDirectory(home);
        yield* fs.writeFileString(path.join(dir, 'child.js'), 'console.log(1);\n');
        const log = path.join(dir, 'child.reads');
        yield* fs.writeFileString(log, '');
        const exit = yield* spawner.exitCode(
          ChildProcess.make('bun', [path.join(dir, 'child.js')], {
            cwd: dir,
            env: {
              ...readsEnv(path.join(import.meta.dir, 'preload.ts'), log),
              HOME: home,
              XDG_CACHE_HOME: path.join(home, '.cache'),
            },
            extendEnv: true,
            forceKillAfter: '5 seconds',
          }),
        );
        expect(Number(exit)).toBe(0);
        expect(yield* fs.readDirectory(home, { recursive: true })).toEqual([]);
      }).pipe(Effect.scoped),
  );
});
