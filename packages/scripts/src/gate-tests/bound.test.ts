import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Clock, Duration, Effect, Fiber, Option, Schedule } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import {
  type Ended,
  type Held,
  type Row,
  HUNG,
  parseRows,
  runBounded,
  share,
  step,
  TASK_BOUND_MS,
} from './bound.ts';

/** A seeded generator of numbers in [0, 1). */
const random = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

type Next = () => number;

const below = (next: Next, n: number) => Math.floor(next() * n);

const pick = <A>(next: Next, from: ReadonlyArray<A>) => Arr.get(from, below(next, from.length));

/**
 * The arguments a process may run under, each marked turbo or not: turbo's
 * `.bin` shim that node runs, its native binary, a daemon and a bare name;
 * and a task's processes, some named like turbo but not turbo.
 */
const ARGS: ReadonlyArray<{ readonly turbo: boolean; readonly make: (n: number) => string }> = [
  { turbo: true, make: (n) => `node /r/node_modules/.bin/turbo run test --n=${n}` },
  { turbo: true, make: (n) => `/r/node_modules/turbo-darwin-arm64/bin/turbo run test --n=${n}` },
  { turbo: true, make: (n) => `/r/node_modules/turbo-linux-64/bin/turbo daemon --n=${n}` },
  { turbo: true, make: (n) => `turbo run test --n=${n}` },
  { turbo: false, make: (n) => `bun test --parallel=3 ./src/part-${n}.test.ts` },
  { turbo: false, make: (n) => `/bin/sh -c bun run test:part-${n}` },
  { turbo: false, make: (n) => `node /r/node_modules/.bin/turbo-something run ${n}` },
  { turbo: false, make: (n) => `/r/bin/turbo-lint --n=${n}` },
  { turbo: false, make: (n) => `bun run turbo-${n}` },
];

/** One process of the model: its parent, arguments, whether it is turbo and whether it lies under the root. */
interface Proc {
  ppid: number;
  args: string;
  turbo: boolean;
  under: boolean;
}

/** A poll's result against the model: `step`'s `over` and the model's, each sorted and joined. */
interface Check {
  readonly at: number;
  readonly got: string;
  readonly want: string;
}

/** The model's world: the table, when each watched process was first seen with its arguments, and `step`'s own state. */
interface World {
  readonly next: Next;
  readonly procs: Map<number, Proc>;
  readonly firstSeen: Map<number, number>;
  readonly checks: Array<Check>;
  pid: number;
  n: number;
  now: number;
  held: ReadonlyMap<number, Held>;
}

const ROOT = 100;
const INIT = 1;

/** Fresh arguments, never run before, so a pid's arguments only repeat when they stay. */
const argsOf = (world: World) => {
  world.n += 1;
  const kind = Option.getOrElse(pick(world.next, ARGS), () => ({
    turbo: false,
    make: (n: number) => `bun ${n}`,
  }));
  return { args: kind.make(world.n), turbo: kind.turbo };
};

/** Every process but init and the root. */
const others = (world: World) =>
  [...world.procs.keys()].filter((each) => each !== INIT && each !== ROOT);

/** A process spawned under init, the root or a live descendant of it. */
const spawn = (world: World) => {
  const parent = Option.getOrElse(
    pick(world.next, [
      INIT,
      ROOT,
      ...others(world).filter((each) => world.procs.get(each)?.under === true),
    ]),
    () => ROOT,
  );
  world.pid += 1;
  world.procs.set(world.pid, { ppid: parent, ...argsOf(world), under: parent !== INIT });
};

/** Marks every process below `parents` as out of the root's tree. */
const orphan = (world: World, parents: ReadonlySet<number>) => {
  const kids = [...world.procs.entries()].filter(([, proc]) => parents.has(proc.ppid));
  for (const [, proc] of kids) proc.under = false;
  if (kids.length > 0) orphan(world, new Set(kids.map(([kid]) => kid)));
};

/** A process that exits: its children go to init, and its whole subtree leaves the root's tree. */
const exit = (world: World) =>
  Option.map(pick(world.next, others(world)), (gone) => {
    world.procs.delete(gone);
    world.firstSeen.delete(gone);
    orphan(world, new Set([gone]));
    for (const proc of world.procs.values()) if (proc.ppid === gone) proc.ppid = INIT;
  });

/** A process that execs: the same pid under new arguments. */
const exec = (world: World) =>
  Option.map(pick(world.next, others(world)), (changed) => {
    Option.map(Option.fromUndefinedOr(world.procs.get(changed)), (proc) =>
      Object.assign(proc, argsOf(world)),
    );
    world.firstSeen.delete(changed);
  });

/** The clock moved by 0-40 s. */
const advance = (world: World) => {
  world.now += below(world.next, 40_001);
};

/** A poll: `step` over the table in a shuffled order, against the processes the model holds past the bound. */
const poll = (world: World, at: number) => {
  const rows: Array<Row> = [...world.procs.entries()]
    .map(([pid, proc]) => ({ row: { pid, ppid: proc.ppid, args: proc.args }, key: world.next() }))
    .toSorted((a, b) => a.key - b.key)
    .map(({ row }) => row);
  const watched = [...world.procs.entries()].filter(([, proc]) => proc.under && !proc.turbo);
  for (const [pid] of watched) if (!world.firstSeen.has(pid)) world.firstSeen.set(pid, world.now);
  const want = watched
    .filter(([pid]) => world.now - (world.firstSeen.get(pid) ?? world.now) > TASK_BOUND_MS)
    .map(([, proc]) => proc.args)
    .toSorted();
  const polled = step(world.held, rows, ROOT, world.now, TASK_BOUND_MS);
  world.held = polled.held;
  const got = Option.match(polled.over, {
    onNone: () => [],
    onSome: (over) => over.split('\n'),
  }).toSorted();
  world.checks.push({ at, got: got.join(' | '), want: want.join(' | ') });
};

/** Each command with the top of its share of a roll in [0, 1). */
const COMMANDS: ReadonlyArray<readonly [number, (world: World, at: number) => unknown]> = [
  [0.3, spawn],
  [0.42, exit],
  [0.52, exec],
  [0.75, advance],
  [1, poll],
];

/**
 * One generated run of 20-60 commands against the reference model, from
 * the root (turbo's shim) under init: spawns, exits, execs, the clock moved
 * and polls. The model holds, for each live descendant of the root but
 * turbo, when a poll first saw it with its current arguments; each poll's
 * check holds `step`'s `over` beside the model's processes past the bound.
 */
const modelRun = (seed: number): ReadonlyArray<Check> => {
  const world: World = {
    next: random(seed),
    procs: new Map([
      [INIT, { ppid: 0, args: 'launchd', turbo: false, under: false }],
      [
        ROOT,
        { ppid: INIT, args: 'node /r/node_modules/.bin/turbo run test', turbo: true, under: false },
      ],
    ]),
    firstSeen: new Map(),
    checks: [],
    pid: ROOT,
    n: 0,
    now: 1_000_000,
    held: new Map(),
  };
  const steps = 20 + below(world.next, 41);
  for (let at = 0; at < steps; at += 1) {
    const roll = world.next();
    Option.map(
      Arr.findFirst(COMMANDS, ([top]) => roll < top),
      ([, command]) => command(world, at),
    );
  }
  return world.checks;
};

/** The process table now, by `ps`. */
const table = Effect.flatMap(ChildProcessSpawner, (spawner) =>
  spawner.string(
    ChildProcess.make('ps', ['-A', '-o', 'pid=', '-o', 'ppid=', '-o', 'args='], {
      forceKillAfter: '2 seconds',
    }),
  ),
).pipe(Effect.map(parseRows));

/** The pids holding `marker` in their arguments, once at least `count` are up, else none after about 1 s. */
const awaitPids = (marker: string, count: number) =>
  table.pipe(
    Effect.map((rows) => rows.filter((row) => row.args.includes(marker)).map((row) => row.pid)),
    Effect.filterOrFail((pids) => pids.length >= count),
    Effect.retry({ times: 100, schedule: Schedule.spaced(Duration.millis(10)) }),
    Effect.orElseSucceed((): ReadonlyArray<number> => []),
  );

/** A run's end, or none after 4 s: code -1, so a run the watchdog never ends fails its case rather than the file. */
const within = <E, R>(run: Effect.Effect<Ended, E, R>) =>
  Effect.timeoutOrElse(run, {
    duration: Duration.seconds(4),
    orElse: () => Effect.succeed<Ended>({ code: -1, over: Option.none() }),
  });

/** Which of `pids` are still in the table. */
const leftOf = (pids: ReadonlyArray<number>) =>
  Effect.map(table, (rows) => {
    const alive = new Set(rows.map((row) => row.pid));
    return pids.filter((each) => alive.has(each));
  });

/** A unique `sleep` duration, so its processes are found by their arguments. */
const markerOf = (tag: number) => `29.${process.pid}${tag}`;

/** A task that idles under `marker`, in a shell that waits on it. */
const idles = (marker: string): readonly [string, ...string[]] => [
  '/bin/sh',
  '-c',
  `sleep ${marker}; true`,
];

/**
 * A run whose task outlives a 200 ms bound: how it ended, how long it took
 * and which of its processes, found by its marker while it ran, are left.
 */
const hangs = Effect.gen(function* () {
  const marker = markerOf(1);
  const started = yield* Clock.currentTimeMillis;
  const run = yield* Effect.forkChild(
    runBounded({ command: idles(marker), cwd: import.meta.dir, boundMs: 200, pollMs: 25 }),
  );
  const pids = yield* awaitPids(marker, 2);
  const ended = yield* within(Fiber.join(run));
  const took = (yield* Clock.currentTimeMillis) - started;
  return { marker, ended, took, left: yield* leftOf(pids) };
});

/** A run interrupted while its task idles: which of its processes are left. */
const interrupts = Effect.gen(function* () {
  const marker = markerOf(2);
  const run = yield* Effect.forkChild(
    runBounded({
      command: idles(marker),
      cwd: import.meta.dir,
      boundMs: TASK_BOUND_MS,
      pollMs: 25,
    }),
  );
  const pids = yield* awaitPids(marker, 2);
  yield* Fiber.interrupt(run);
  return yield* leftOf(pids);
});

// oxlint-disable-next-line effect/noAsyncFunction -- the three real-process runs run together once at module evaluation, so their waits overlap within the task's 1 s budget and no case pays them inside its time limit (film/no-lazy-test-fixture)
const realRuns = await Effect.runPromise(
  Effect.all(
    {
      hung: hangs,
      exited: within(
        runBounded({
          command: ['/bin/sh', '-c', 'sleep 0.1; exit 3'],
          cwd: import.meta.dir,
          boundMs: 200,
          pollMs: 25,
        }),
      ),
      interrupted: interrupts,
    },
    { concurrency: 'unbounded' },
  ).pipe(Effect.provide(BunServices.layer)),
);

describe('the gate tests share', () => {
  it.effect(
    'keeps the tasks within the cores: at least one, three workers each, and no fewer than fit',
    () =>
      Effect.sync(() => {
        const wrong = Array.from({ length: 512 }, (_, at) => at + 1).filter((cores) => {
          const n = share(cores);
          return !(
            Number.isInteger(n) &&
            n >= 1 &&
            n * 3 <= Math.max(cores, 3) &&
            (cores < 3 || (n + 1) * 3 > cores)
          );
        });
        expect(wrong).toEqual([]);
        expect(share(12)).toBe(4);
      }),
  );
});

describe('the gate tests watchdog', () => {
  it.effect(
    'names exactly the processes past the bound since first seen with their arguments, over 300 generated runs',
    () =>
      Effect.sync(() => {
        const runs = Array.from({ length: 300 }, (_, at) => ({
          seed: at + 1,
          checks: modelRun(at + 1),
        }));
        const wrong = runs.flatMap(({ seed, checks }) =>
          checks
            .filter((check) => check.got !== check.want)
            .slice(0, 1)
            .map((check) => ({ seed, ...check })),
        );
        expect(wrong).toEqual([]);
        const polls = runs.flatMap(({ checks }) => checks);
        expect(polls.filter((check) => check.want !== '').length).toBeGreaterThan(100);
        expect(polls.filter((check) => check.want === '').length).toBeGreaterThan(300);
      }),
  );

  it.effect(
    'ends a run whose task outlives the bound with 124, naming it, and leaves none of it',
    () =>
      Effect.sync(() => {
        const { hung } = realRuns;
        expect(hung.ended.code).toBe(HUNG);
        expect(Option.getOrElse(hung.ended.over, () => '')).toContain(`sleep ${hung.marker}`);
        expect(hung.took).toBeLessThan(2_000);
        expect(hung.left).toEqual([]);
      }),
  );

  it.effect('passes on the exit code of a command that ends inside the bound, its child too', () =>
    Effect.sync(() => {
      expect(realRuns.exited).toEqual({ code: 3, over: Option.none() });
    }),
  );

  it.effect('leaves no process of the run when it is interrupted', () =>
    Effect.sync(() => {
      expect(realRuns.interrupted).toEqual([]);
    }),
  );
});
