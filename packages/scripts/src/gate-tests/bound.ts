import { Clock, Duration, Effect, Option } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import { type Ended, type Held, HUNG, parseRows, step } from './poll.ts';

/** A gate test task alive past this is a hang: 60 times a part's 1 s budget alone. */
export const TASK_BOUND_MS = 60_000;

/** How often the gate's watchdog reads the process table. */
export const POLL_MS = 1_000;

/** The bun test workers a Heartseed part runs (`--parallel=3`), the most of any unit-test task. */
const WORKERS_PER_TASK = 3;

/**
 * Turbo's concurrency for the gate's tests on `cores` cores: as many tasks
 * as keep their workers within the cores, and at least one.
 */
export const share = (cores: number) => Math.max(1, Math.floor(cores / WORKERS_PER_TASK));

/** The gate's test command on `cores` cores: every workspace's unit tests at the share. */
export const gateTestsCommand = (cores: number): readonly [string, ...string[]] => [
  'node_modules/.bin/turbo',
  'run',
  'test',
  '--output-logs=errors-only',
  '--ui=stream',
  `--concurrency=${share(cores)}`,
];

/** A command the watchdog runs, where, its bound and how often it polls. */
interface Bounded {
  readonly command: readonly [string, ...string[]];
  readonly cwd: string;
  readonly boundMs: number;
  readonly pollMs: number;
}

/**
 * Runs `command` in a process group of its own and reads the process table
 * every `pollMs`. When a descendant but turbo has lived past `boundMs`, the
 * run ends with 124 and names it; else it ends with the command's code. The
 * scope's close ends the group (SIGTERM, then SIGKILL after 3 s), on either
 * end and on interruption.
 */
export const runBounded = (options: Bounded) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner;
      const [program, ...args] = options.command;
      const handle = yield* spawner.spawn(
        ChildProcess.make(program, args, {
          cwd: options.cwd,
          stdout: 'inherit',
          stderr: 'inherit',
          forceKillAfter: '3 seconds',
        }),
      );
      const root = Number(handle.pid);
      const table = spawner.string(
        ChildProcess.make('ps', ['-A', '-o', 'pid=', '-o', 'ppid=', '-o', 'args='], {
          forceKillAfter: '2 seconds',
        }),
      );
      const watch = (
        held: ReadonlyMap<number, Held>,
      ): Effect.Effect<string, Effect.Error<typeof table>> =>
        Effect.gen(function* () {
          yield* Effect.sleep(Duration.millis(options.pollMs));
          const text = yield* table;
          const now = yield* Clock.currentTimeMillis;
          const polled = step(held, parseRows(text), root, now, options.boundMs);
          return yield* Option.match(polled.over, {
            onNone: () => watch(polled.held),
            onSome: Effect.succeed,
          });
        });
      return yield* Effect.raceFirst(
        handle.exitCode.pipe(
          Effect.map((code): Ended => ({ code: Number(code), over: Option.none() })),
        ),
        watch(new Map()).pipe(
          Effect.map((over): Ended => ({ code: HUNG, over: Option.some(over) })),
        ),
      );
    }),
  );
