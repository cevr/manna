import {
  Array as Arr,
  Config,
  Console,
  Duration,
  Effect,
  FileSystem,
  Option,
  Path,
  Schema,
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/**
 * What every console `simctl launch --console` leaves in a simulator's `data/tmp` is named, a FIFO per stream
 * (`launch_console-<pid>-1`, `-2`). They are never removed, and a launch whose pid was used before fails on the
 * name ("Unable to establish FIFO … Error 17"), so a run clears the old ones first.
 */
const CONSOLE = /^launch_console-\d+-\d+$/;

/** Where CoreSimulator keeps each simulator, by udid, under the home folder. */
const DEVICES = ['Library', 'Developer', 'CoreSimulator', 'Devices'] as const;

/** The variable the wrapper sets, for an iOS run alone, to the time (epoch ms) it started: the child clears the consoles older than it. */
export const CLEAR_BEFORE = 'EXACT_KIT_CLEAR_BEFORE';

/** `simctl list devices --json`: each runtime's devices, by udid and name. */
const DeviceList = Schema.fromJsonString(
  Schema.Struct({
    devices: Schema.Record(
      Schema.String,
      Schema.Array(Schema.Struct({ udid: Schema.String, name: Schema.String })),
    ),
  }),
);

/** The udid of the one simulator `list` (`simctl list devices --json`) names `name`; none when no device, or more than one, has that name. */
const udidNamed = (list: string, name: string): Option.Option<string> =>
  Option.flatMap(Schema.decodeOption(DeviceList)(list), ({ devices }) => {
    const named = Object.values(devices)
      .flat()
      .filter((device) => device.name === name);
    return Option.map(
      Option.filter(Arr.head(named), () => named.length === 1),
      (device) => device.udid,
    );
  });

/** The `data/tmp` folder of the simulator `udid`, under `home`. */
const simulatorTmp = (home: string, udid: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return path.join(home, ...DEVICES, udid, 'data', 'tmp');
  });

/**
 * Removes from `dir` each console FIFO `simctl` left (`CONSOLE`) last changed before `before` (epoch ms), and nothing
 * else: no other name, no folder, nothing at or after `before`. A missing folder holds none. The count removed.
 */
const clearStaleConsoles = (dir: string, before: number) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const names = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []));
    const removed = yield* Effect.forEach(
      names.filter((name) => CONSOLE.test(name)),
      (name) =>
        Effect.gen(function* () {
          const file = path.join(dir, name);
          const info = yield* fs.stat(file);
          const stale =
            info.type !== 'Directory' && Option.exists(info.mtime, (at) => at.getTime() < before);
          if (!stale) return false;
          yield* fs.remove(file);
          return true;
        }).pipe(Effect.orElseSucceed(() => false)),
    );
    return Arr.filter(removed, (gone) => gone).length;
  });

/** The text `simctl list devices --json` prints. */
const listDevices = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* spawner.string(
    ChildProcess.make('xcrun', ['simctl', 'list', 'devices', '--json'], {
      forceKillAfter: Duration.seconds(5),
    }),
  );
});

/**
 * Before an iOS run on the simulator named `simulator` (the app entry's, which the wrapper sets as `EXACT_SIM`):
 * clears the console FIFOs older than `before` from that one simulator's `data/tmp` under `HOME`, and says how many
 * when it cleared any. Never fails the run: a simulator it cannot name once is left as it is, and said so. The
 * count cleared.
 */
export const clearSimulatorConsoles = (simulator: string, before: number) =>
  Effect.gen(function* () {
    const home = yield* Config.String('HOME');
    const udid = udidNamed(yield* listDevices, simulator);
    if (Option.isNone(udid)) {
      yield* Console.error(
        `exact-kit: no one simulator is named ${simulator}, so its launch consoles were left`,
      );
      return 0;
    }
    const dir = yield* simulatorTmp(home, udid.value);
    const count = yield* clearStaleConsoles(dir, before);
    if (count > 0)
      yield* Console.error(`exact-kit: cleared ${count} stale launch_console FIFOs from ${dir}`);
    return count;
  }).pipe(
    Effect.catch((error) =>
      Effect.as(
        Console.error(`exact-kit: the launch consoles of ${simulator} were left: ${String(error)}`),
        0,
      ),
    ),
  );
