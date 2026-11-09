import { Clock, Duration, Effect, Option } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

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

/** One process of the table: its pid, its parent's and its arguments. */
export interface Row {
  readonly pid: number;
  readonly ppid: number;
  readonly args: string;
}

/** A watched process: when it was first seen with its current arguments. */
export interface Held {
  readonly since: number;
  readonly args: string;
}

/** One line of `ps -A -o pid= -o ppid= -o args=`: the pid, the parent's pid and the arguments. */
const ROW = /^\s*(\d+)\s+(\d+)\s+(.*\S)\s*$/u;

/** The rows of `ps -A -o pid= -o ppid= -o args=`. */
export const parseRows = (text: string): ReadonlyArray<Row> =>
  text
    .split('\n')
    .flatMap((line) => Option.toArray(Option.fromNullishOr(ROW.exec(line))))
    .map(([, pid = '', ppid = '', args = '']) => ({
      pid: Number(pid),
      ppid: Number(ppid),
      args,
    }));

/** Every process under `root` by parentage, `root` left out. */
const descendants = (rows: ReadonlyArray<Row>, root: number): ReadonlyArray<Row> => {
  const below = (parents: ReadonlySet<number>, seen: ReadonlySet<number>): ReadonlyArray<Row> => {
    const kids = rows.filter((row) => parents.has(row.ppid) && !seen.has(row.pid));
    if (kids.length === 0) return [];
    const pids = new Set(kids.map((row) => row.pid));
    return [...kids, ...below(pids, new Set([...seen, ...pids]))];
  };
  return below(new Set([root]), new Set([root]));
};

/**
 * Whether a process is turbo itself (its program, or the script node runs,
 * is named `turbo`): its native binary, the `.bin` shim and a daemon, never
 * a task whose name only starts with it.
 */
const isTurbo = (args: string) =>
  args
    .split(/\s+/u)
    .slice(0, 2)
    .some((word) => /(^|\/)turbo$/u.test(word));

/** What one poll holds: each watched process by pid, and every one past the bound, by its arguments a line. */
interface Polled {
  readonly held: ReadonlyMap<number, Held>;
  readonly over: Option.Option<string>;
}

/**
 * One poll of the table at `now`: each live descendant of `root` but turbo,
 * kept from `held` while its arguments stay, else seen from now, and every
 * one alive past `boundMs` since it was first seen.
 */
export const step = (
  held: ReadonlyMap<number, Held>,
  rows: ReadonlyArray<Row>,
  root: number,
  now: number,
  boundMs: number,
): Polled => {
  const next = new Map(
    descendants(rows, root)
      .filter((row) => !isTurbo(row.args))
      .map((row): [number, Held] => [
        row.pid,
        Option.fromUndefinedOr(held.get(row.pid)).pipe(
          Option.filter((before) => before.args === row.args),
          Option.getOrElse(() => ({ since: now, args: row.args })),
        ),
      ]),
  );
  const over = [...next.values()].filter((each) => now - each.since > boundMs);
  return {
    held: next,
    over: Option.liftPredicate(over.map((each) => each.args).join('\n'), () => over.length > 0),
  };
};

/** A command the watchdog runs, where, its bound and how often it polls. */
interface Bounded {
  readonly command: readonly [string, ...string[]];
  readonly cwd: string;
  readonly boundMs: number;
  readonly pollMs: number;
}

/** How a bounded run ended: the command's exit code, or 124 and every process past the bound. */
export interface Ended {
  readonly code: number;
  readonly over: Option.Option<string>;
}

/** The exit code of a run the watchdog ended, as `timeout(1)` gives. */
export const HUNG = 124;

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
