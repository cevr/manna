import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import { expect, it } from 'effect-bun-test';

import cliPackage from '../../package.json' with { type: 'json' };
import { cliDefines } from '../../scripts/cli-defines.js';

const cli = new URL('../../', import.meta.url).pathname.replace(/\/$/u, '');

const run = Effect.fn('InstallRootTest.run')(
  function* (executable: string, cwd: string, args: readonly string[]) {
    const spawner = yield* ChildProcessSpawner;
    const child = yield* spawner.spawn(
      ChildProcess.make(executable, args, {
        cwd,
        env: { HOME: cwd, PATH: '/usr/bin:/bin', NO_COLOR: '1' },
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
    return { output: `${stdout}${stderr}`, status: Number(status) };
  },
  Effect.scoped,
  Effect.timeout('20 seconds'),
);

it.scoped('a binary built in one directory finds the checkout it is installed in', () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.realPath(yield* fs.makeTempDirectoryScoped({ prefix: 'cli-root-' }));
    const buildDir = `${dir}/build/packages/cli/bin`;
    const installed = `${dir}/checkout/packages/cli`;
    const linkDir = `${dir}/home/.bun/bin`;
    for (const folder of [buildDir, `${installed}/bin`, `${installed}/outputs/messages`, linkDir])
      yield* fs.makeDirectory(folder, { recursive: true });
    const built = yield* Effect.promise(() =>
      Bun.build({
        entrypoints: [`${cli}/src/main.ts`],
        target: 'bun',
        compile: { outfile: `${buildDir}/manna`, autoloadBunfig: false },
        define: cliDefines('abc1234'),
        plugins: [
          {
            name: 'text-only-sharp',
            setup(builder) {
              builder.onResolve({ filter: /^sharp$/u }, () => ({
                path: `${cli}/scripts/sharp-stub.ts`,
              }));
            },
          },
        ],
      }),
    );
    expect(built.success).toBe(true);
    yield* fs.rename(`${buildDir}/manna`, `${installed}/bin/manna`);
    yield* fs.remove(`${dir}/build`, { recursive: true });
    yield* fs.symlink(`${installed}/bin/manna`, `${linkDir}/manna`);
    yield* fs.writeFileString(`${installed}/outputs/messages/2026-01-01-probe.md`, '# Probe\n');

    const listed = yield* run(`${linkDir}/manna`, dir, ['messages', 'list', '--json']);
    expect(listed.status).toBe(0);
    expect(listed.output).toContain(`${installed}/outputs/messages/2026-01-01-probe.md`);

    const version = yield* run(`${linkDir}/manna`, dir, ['--version']);
    expect(version.status).toBe(0);
    expect(version.output.trim()).toBe(`manna v${cliPackage.version} (abc1234)`);
  }).pipe(Effect.provide(BunServices.layer)),
);
