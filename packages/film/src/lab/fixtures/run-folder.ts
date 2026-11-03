import { Effect, FileSystem, Option, Schedule, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

const ASK_AGAIN = '50 millis';
const GRACE = '5 seconds';

export const namingFolder = (ps: string, folder: string, self: number): ReadonlyArray<number> =>
  ps.split('\n').flatMap((line) =>
    Option.toArray(
      Option.filter(
        Option.map(Option.fromNullishOr(/^\s*(\d+)\s+(.*)$/.exec(line)), (m) => ({
          pid: Number(m[1]),
          command: m[2] ?? '',
        })),
        (p) => p.pid !== self && p.command.includes(`${folder}/`),
      ).pipe(Option.map((p) => p.pid)),
    ),
  );

const processes = Effect.scoped(
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner;
    const child = yield* spawner.spawn(
      ChildProcess.make('ps', ['-A', '-o', 'pid=', '-o', 'command='], {
        stderr: 'ignore',
        forceKillAfter: '5 seconds',
      }),
    );
    return yield* child.stdout.pipe(Stream.decodeText(), Stream.mkString);
  }),
);

export const namingProcesses = (folder: string) =>
  Effect.map(processes, (ps) => namingFolder(ps, folder, process.pid));

const signal = (pids: ReadonlyArray<number>, sig: NodeJS.Signals) =>
  Effect.forEach(pids, (pid) => Effect.ignore(Effect.try(() => process.kill(pid, sig))), {
    discard: true,
  });

const endProcessesIn = (folder: string) =>
  Effect.gen(function* () {
    const running = namingProcesses(folder);
    const ended = Effect.repeat(running, {
      schedule: Schedule.spaced(ASK_AGAIN),
      until: (pids) => pids.length === 0,
    });
    yield* signal(yield* running, 'SIGTERM');
    const inTime = yield* Effect.timeoutOption(ended, GRACE);
    if (Option.isSome(inTime)) return;
    yield* signal(yield* running, 'SIGKILL');
    yield* ended;
  });

export const runFolder = (prefix: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* Effect.acquireRelease(fs.makeTempDirectory({ prefix }), (folder) =>
      Effect.orDie(Effect.andThen(endProcessesIn(folder), fs.remove(folder, { recursive: true }))),
    );
  });
