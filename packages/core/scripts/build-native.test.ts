import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Path } from 'effect';
import { expect, it } from 'effect-bun-test';

/* oxlint-disable effect/noGlobals -- Host process harness for a real shell script with an isolated fake toolchain. */

const fakeZig = `#!/bin/bash
set -eu
if [ "$1" = version ]; then printf 'fake-zig\n'; exit 0; fi
printf '%s\n%s\n' "\${ZIG_GLOBAL_CACHE_DIR-unset}" "\${ZIG_LOCAL_CACHE_DIR-unset}" > "$CACHE_RECEIPT"
while [ "$#" -gt 0 ]; do
  if [ "$1" = -o ]; then shift; printf 'synthetic artifact\n' > "$1"; exit 0; fi
  shift
done
exit 1
`;

it.scopedLive(
  'native and wasm builds keep implicit Zig caches in the workspace and preserve overrides',
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'native-cache-' });
      const workspace = path.join(root, 'workspace Ω');
      const home = path.join(root, 'empty home Ω');
      const bin = path.join(root, 'bin');
      for (const dir of [
        home,
        bin,
        path.join(workspace, 'scripts'),
        path.join(workspace, 'native'),
      ]) {
        yield* fs.makeDirectory(dir, { recursive: true });
      }
      const script = path.join(workspace, 'scripts/build-native.sh');
      yield* fs.copyFile(path.join(import.meta.dir, 'build-native.sh'), script);
      yield* fs.writeFileString(path.join(bin, 'zig'), fakeZig);
      yield* fs.chmod(path.join(bin, 'zig'), 0o755);
      // The wasm stamp hashes its source; both sources and every output belong to this fixture.
      for (const name of ['vector-scan.c', 'vector-scan-wasm.c']) {
        yield* fs.writeFileString(path.join(workspace, 'native', name), 'synthetic source');
      }
      const receipt = path.join(root, 'cache.txt');
      for (const target of ['native', 'wasm']) {
        for (const override of [false, true]) {
          const global = path.join(root, 'chosen global Ω');
          const local = path.join(root, 'chosen local Ω');
          const env: NodeJS.ProcessEnv = {
            ...process.env,
            HOME: home,
            PATH: `${bin}:${process.env['PATH'] ?? ''}`,
            TARGET: '',
            CACHE_RECEIPT: receipt,
          };
          delete env['ZIG_GLOBAL_CACHE_DIR'];
          delete env['ZIG_LOCAL_CACHE_DIR'];
          let expected = `${workspace}/node_modules/.cache/zig/global\n${workspace}/node_modules/.cache/zig/local\n`;
          if (override) {
            env['ZIG_GLOBAL_CACHE_DIR'] = global;
            env['ZIG_LOCAL_CACHE_DIR'] = local;
            expected = `${global}\n${local}\n`;
          }
          const result = Bun.spawnSync(['bash', script, target], {
            env,
          });
          expect(result.exitCode).toBe(0);
          expect(yield* fs.readFileString(receipt)).toBe(expected);
          expect(yield* fs.readDirectory(home)).toEqual([]);
        }
      }
    }).pipe(Effect.provide(BunServices.layer)),
);
