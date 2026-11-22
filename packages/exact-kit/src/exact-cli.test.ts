import * as BunServices from '@effect/platform-bun/BunServices';
import { Duration, Effect, FileSystem, Path, Schema, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { describe, expect, it } from 'effect-bun-test';

import { APPS } from './apps.ts';

/** The simulator the run is on, as the wrapper names it in `EXACT_SIM`, and its udid in the stand-in `simctl` list. */
const SIMULATOR = APPS['heartseed-exact'].simulator;
const UDID = '26FBDB9E-3FFE-432A-8FE0-ABB32A69B378';

/** When the wrapper started, and a console from a run before it and one from after. */
const START = Date.parse('2026-11-19T12:00:00Z');
const STALE = 'launch_console-10040-1';
const FRESH = 'launch_console-77-1';

/** `value` as JSON text, which is also a quoted string in a script. */
const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/**
 * A stand-in Exact clone: a `package.json` naming a Bun, a `scripts/bun.mjs` that checks nothing, and a
 * `scripts/app-cli.mjs` whose `run` exits 0 only when the stale console is already gone as it starts, so the clear
 * runs before Exact's CLI.
 */
const standInExact = (dir: string, stale: string) => ({
  [`${dir}/package.json`]: '{"packageManager":"bun@0.0.0"}',
  [`${dir}/scripts/bun.mjs`]: 'export const ensureBun = () => {};\n',
  [`${dir}/scripts/app-cli.mjs`]: `import { existsSync } from 'node:fs';\nexport const run = async () => (existsSync(${json(stale)}) ? 3 : 0);\n`,
});

/** A stand-in `xcrun` that prints the file `list` for any command, as `simctl list devices --json` would. */
const standInXcrun = (list: string) => `#!/bin/sh\nexec cat ${json(list)}\n`;

describe('exact-cli, the child the wrapper starts', () => {
  it.effect(
    "on an iOS run clears the app simulator's stale launch consoles, says so, and only then runs Exact's CLI",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
          const root = yield* fs.makeTempDirectoryScoped({ prefix: 'exact-cli-' });
          const home = path.join(root, 'home');
          const bin = path.join(root, 'bin');
          const exact = path.join(root, 'exact');
          const tmp = path.join(
            home,
            'Library/Developer/CoreSimulator/Devices',
            UDID,
            'data',
            'tmp',
          );
          const list = json({
            devices: {
              'com.apple.CoreSimulator.SimRuntime.iOS-27-0': [{ udid: UDID, name: SIMULATOR }],
            },
          });
          const files = {
            ...standInExact(exact, path.join(tmp, STALE)),
            [`${bin}/xcrun`]: standInXcrun(path.join(root, 'devices.json')),
            [`${root}/devices.json`]: list,
            [`${tmp}/${STALE}`]: '',
            [`${tmp}/${FRESH}`]: '',
          };
          for (const [file, content] of Object.entries(files)) {
            yield* fs.makeDirectory(path.dirname(file), { recursive: true });
            yield* fs.writeFileString(file, content);
          }
          yield* fs.chmod(path.join(bin, 'xcrun'), 0o755);
          yield* fs.utimes(path.join(tmp, STALE), (START - 60_000) / 1000, (START - 60_000) / 1000);
          yield* fs.utimes(path.join(tmp, FRESH), (START + 1_000) / 1000, (START + 1_000) / 1000);
          const ran = yield* Effect.scoped(
            Effect.gen(function* () {
              const handle = yield* spawner.spawn(
                ChildProcess.make(
                  process.execPath,
                  [path.join(import.meta.dir, 'exact-cli.ts'), root, 'heartseed-exact', 'ios'],
                  {
                    env: {
                      HOME: home,
                      PATH: `${bin}:/usr/bin:/bin`,
                      EXACT: exact,
                      EXACT_SIM: SIMULATOR,
                      EXACT_KIT_CLEAR_BEFORE: String(START),
                    },
                    extendEnv: false,
                    forceKillAfter: Duration.seconds(5),
                  },
                ),
              );
              const [said, code] = yield* Effect.all(
                [Stream.mkString(Stream.decodeText(handle.stderr)), handle.exitCode],
                { concurrency: 2 },
              );
              return { said: said.trim(), code };
            }),
          );
          expect(ran).toEqual({
            said: `exact-kit: cleared 1 stale launch_console FIFOs from ${tmp}`,
            code: ChildProcessSpawner.ExitCode(0),
          });
          expect((yield* fs.readDirectory(tmp)).toSorted()).toEqual([FRESH]);
        }),
      ).pipe(Effect.provide(BunServices.layer)),
  );
});
