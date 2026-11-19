import * as BunServices from '@effect/platform-bun/BunServices';
import {
  ConfigProvider,
  Console,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Path,
  Schema,
  Sink,
  Stream,
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { describe, expect, it } from 'effect-bun-test';

import { APPS } from './apps.ts';
import { clearSimulatorConsoles } from './sim-tmp.ts';

/** The owner's own simulators, which no run of the wrapper may ever clear, with the names they carry. */
const OWNERS = [
  { udid: '04DFEF68-A26B-4BEA-B1CA-D70FB1F4E81A', name: 'verify-heartseed' },
  { udid: 'D2BF2773-54A7-4F47-BEDD-1392D2065DB8', name: 'verify-hymnal' },
] as const;

/** The Exact apps' simulators, as `simctl` lists them on this Mac. */
const EXACTS = [
  { udid: '26FBDB9E-3FFE-432A-8FE0-ABB32A69B378', name: 'verify-heartseed-exact' },
  { udid: '9969DB1A-0F0C-4F3E-B27B-055B1AA83E35', name: 'verify-hymnal-exact' },
] as const;

type Device = { readonly udid: string; readonly name: string };

/** `simctl list devices --json` over `devices`, split across two runtimes as it prints them. */
const listing = (devices: ReadonlyArray<Device>) =>
  Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))({
    devices: {
      'com.apple.CoreSimulator.SimRuntime.iOS-26-0': devices
        .slice(0, 2)
        .map((d) => ({ ...d, state: 'Shutdown' })),
      'com.apple.CoreSimulator.SimRuntime.iOS-27-0': devices
        .slice(2)
        .map((d) => ({ ...d, state: 'Booted' })),
    },
  });

/** The start the run clears before, and a time on each side of it, in seconds as `utimes` takes them. */
const START = Date.parse('2026-11-19T12:00:00Z');
const OLD = (START - 60_000) / 1000;
const FRESH = (START + 1_000) / 1000;

/** What a simulator's `data/tmp` holds before a run: two stale consoles (one a FIFO), a fresh one, and what is not a console. */
const STALE = ['launch_console-10040-1', 'launch_console-10040-2'];
const KEPT = [
  'kept.sqlite',
  'launch_console-5-1.log',
  'launch_console-77-1',
  'launch_console-9-1',
  'launch_console-notes',
];

/** A spawner that starts nothing: it keeps each command it is asked for and prints `list` as `simctl`'s answer. */
const simctl = (list: string, asked: Array<string>) =>
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) => {
      if (command._tag === 'StandardCommand')
        asked.push([command.command, ...command.args.map(String)].join(' '));
      return Effect.succeed(
        ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(0),
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          stdin: Sink.drain,
          stdout: Stream.make(new TextEncoder().encode(list)),
          stderr: Stream.empty,
          all: Stream.make(new TextEncoder().encode(list)),
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          unref: Effect.succeed(Effect.void),
        }),
      );
    }),
  );

/** Fills `home`'s simulator `udid`'s `data/tmp` as `STALE` and `KEPT` say; its path. */
const seeded = (home: string, udid: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const dir = path.join(home, 'Library/Developer/CoreSimulator/Devices', udid, 'data', 'tmp');
    const at = (name: string) => path.join(dir, name);
    yield* fs.makeDirectory(at('launch_console-9-1'), { recursive: true });
    const made = yield* spawner.exitCode(
      ChildProcess.make('mkfifo', [at('launch_console-10040-1')], {
        forceKillAfter: Duration.seconds(5),
      }),
    );
    expect(made).toBe(ChildProcessSpawner.ExitCode(0));
    for (const name of [...STALE, ...KEPT].filter(
      (n) => !['launch_console-9-1', 'launch_console-10040-1'].includes(n),
    ))
      yield* fs.writeFileString(at(name), '');
    for (const name of [...STALE, ...KEPT]) yield* fs.utimes(at(name), OLD, OLD);
    yield* fs.utimes(at('launch_console-77-1'), FRESH, FRESH);
    return dir;
  });

/**
 * `clearSimulatorConsoles` with `HOME` at `home` and `simctl` answering `list`; the commands it asked for are kept in
 * `asked`, and the lines it printed to the console's error stream in `said`.
 */
const clearing = (
  simulator: string,
  home: string,
  list: string,
  asked: Array<string> = [],
  said: Array<string> = [],
) =>
  clearSimulatorConsoles(simulator, START).pipe(
    Effect.provideService(Console.Console, {
      ...globalThis.console,
      error: (...args: ReadonlyArray<unknown>) => {
        said.push(args.map(String).join(' '));
      },
    }),
    Effect.provide(
      Layer.mergeAll(
        simctl(list, asked),
        ConfigProvider.layer(ConfigProvider.fromUnknown({ HOME: home })),
      ),
    ),
  );

/** The names in `dir`, sorted. */
const listed = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return (yield* fs.readDirectory(dir)).toSorted();
  });

describe('the stale launch consoles of a simulator', () => {
  it.effect(
    "removes, under each app entry's own simulator alone, the launch_console FIFOs older than the start, and never touches the owner's simulators",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const home = yield* fs.makeTempDirectoryScoped({ prefix: 'sim-tmp-' });
          const dirs = new Map<string, string>();
          for (const { udid } of [...OWNERS, ...EXACTS]) dirs.set(udid, yield* seeded(home, udid));
          const list = listing([...OWNERS, ...EXACTS]);
          const simulators = [...new Set(Object.values(APPS).map((app) => app.simulator))];
          expect(simulators.toSorted()).toEqual(EXACTS.map((e) => e.name));
          for (const simulator of simulators) {
            const asked: Array<string> = [];
            const said: Array<string> = [];
            expect(yield* clearing(simulator, home, list, asked, said)).toBe(STALE.length);
            expect(asked).toEqual(['xcrun simctl list devices --json']);
            const own = EXACTS.find((e) => e.name === simulator)?.udid ?? '';
            const dir = dirs.get(own) ?? '';
            expect(said).toEqual([
              `exact-kit: cleared ${STALE.length} stale launch_console FIFOs from ${dir}`,
            ]);
            expect(yield* listed(dir)).toEqual(KEPT);
            const again: Array<string> = [];
            expect(yield* clearing(simulator, home, list, [], again)).toBe(0);
            expect(again).toEqual([]);
          }
          for (const { udid } of OWNERS)
            expect(yield* listed(dirs.get(udid) ?? '')).toEqual([...STALE, ...KEPT].toSorted());
        }),
      ).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect(
    'finds nothing to clear, and says nothing, when the simulator has no data/tmp yet',
    () =>
      Effect.gen(function* () {
        const said: Array<string> = [];
        expect(
          yield* clearing(EXACTS[0].name, '/nonexistent/loop-probe-x', listing(EXACTS), [], said),
        ).toBe(0);
        expect(said).toEqual([]);
      }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('clears nothing when no simulator, or more than one, carries the name', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const home = yield* fs.makeTempDirectoryScoped({ prefix: 'sim-tmp-' });
        const [heartseed] = EXACTS;
        const dir = yield* seeded(home, heartseed.udid);
        const twin = { udid: 'AAAAAAAA-0000-0000-0000-000000000000', name: heartseed.name };
        for (const list of [listing(OWNERS), listing([...EXACTS, twin]), 'not json'])
          expect(yield* clearing(heartseed.name, home, list)).toBe(0);
        expect(yield* listed(dir)).toEqual([...STALE, ...KEPT].toSorted());
      }),
    ).pipe(Effect.provide(BunServices.layer)),
  );
});
