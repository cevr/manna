import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Duration, Effect, FileSystem, Schedule, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

const FIXTURE = `${import.meta.dir}/fixtures/profile-page.ts`;

/** Every Chrome profile a temp folder holds: Bun's own, puppeteer's own, and the film launcher's by process. */
const profilesIn = (tmp: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const names = yield* fs.readDirectory(tmp);
    const own = names.filter(
      (name) => name.endsWith('.bun-chrome') || name.startsWith('puppeteer_dev_chrome_profile'),
    );
    const film = yield* Effect.map(
      Effect.orElseSucceed(fs.readDirectory(`${tmp}/bible-film-chrome`), () => []),
      (pids) => pids.map((pid) => `bible-film-chrome/${pid}`),
    );
    return [...own, ...film].toSorted();
  });

/** Every process with a profile under `tmp`. */
const holding = (tmp: string) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const ps = yield* spawner.string(
      ChildProcess.make('ps', ['-axo', 'args='], { forceKillAfter: '5 seconds' }),
    );
    return ps.split('\n').filter((line) => line.includes(`--user-data-dir=${tmp}`));
  });

/** Within 10 s, no process holds a profile under `tmp`. */
const noneHold = (tmp: string) =>
  Effect.filterOrFail(holding(tmp), (left) => left.length === 0).pipe(
    Effect.retry({ schedule: Schedule.spaced(Duration.millis(100)), times: 100 }),
    Effect.asVoid,
  );

/** The fixture's page rendered in a process whose temp folder is `tmp`: to its end, or SIGKILLed once it rendered. */
const renderIn = (tmp: string, page: 'storybook' | 'toon3d', end: 'exit' | 'hold') =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make(process.execPath, [FIXTURE], {
          env: { TMPDIR: `${tmp}/`, PROFILE_PAGE: page, PROFILE_END: end },
          extendEnv: true,
          forceKillAfter: '5 seconds',
        }),
      );
      const said = yield* handle.stdout.pipe(
        Stream.decodeText,
        Stream.splitLines,
        Stream.takeUntil((line) => line.startsWith('rendered')),
        Stream.runCollect,
      );
      expect(said.some((line) => line.startsWith('rendered'))).toBe(true);
      if (end === 'hold') yield* handle.kill({ killSignal: 'SIGKILL' });
      yield* Effect.ignore(handle.exitCode);
      return handle.pid;
    }),
  );

describe("the films' renders leave no Chrome profile", () => {
  for (const page of ['storybook', 'toon3d'] as const)
    it.live.layer(BunServices.layer)(
      `${page}: none after an exit; after a SIGKILL its own alone, removed by the next run`,
      () =>
        Effect.scoped(
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const tmp = yield* fs.makeTempDirectoryScoped();
            yield* renderIn(tmp, page, 'exit');
            expect(yield* profilesIn(tmp)).toEqual([]);
            const killed = yield* renderIn(tmp, page, 'hold');
            yield* noneHold(tmp);
            expect(yield* profilesIn(tmp)).toEqual([`bible-film-chrome/${killed}`]);
            yield* renderIn(tmp, page, 'exit');
            expect(yield* profilesIn(tmp)).toEqual([]);
            yield* noneHold(tmp);
          }),
        ),
      60_000,
    );
});
