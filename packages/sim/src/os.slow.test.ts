/**
 * The live `Os` (`os.ts`) against real processes this test starts itself,
 * each a `/bin/sleep`: `spawn` answers the child's own pid and start time;
 * `started` reads the same start time again, whatever the caller's `TZ` and
 * locale; the stop rule leaves a process alive under a wrong recorded start
 * and ends it under the right one; `self` answers this test's own process;
 * a command that spawns (`fixtures/spawner.ts`) ends while its sleep runs
 * on, the sleep holding no file but `/dev/null` on fds 0-2, in a process
 * group other than the test's; and the gap
 * from the start-time read to the signal it allows, over many stops, is
 * printed. Every tool runs through a spawner that records it, and
 * every `kill` it ran named a pid this test's own spawn returned.
 */
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Clock, Console, Duration, Effect, Fiber, FileSystem, Option, Path, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { type Identity, Os, stop } from './os.ts';
import { attempt, ready, type Vars } from './tools.ts';

/** The timeout of a test that spawns `sh`, `ps` and `kill`: a loaded machine's spawns are slow (effect/requireSpawnBudget). */
const SPAWNS_MS = 120_000;

/** How many stops the read-to-signal gap is measured over. */
const RUNS = 20;

/** What the sleeper runs: long enough to outlive the test's reads, short enough to end itself if a test fails. */
const SLEEPER = ['/bin/sleep', '30'];

/** Caller environments the start-time read must not depend on. */
const CALLERS: ReadonlyArray<Vars> = [
  { TZ: 'UTC' },
  { TZ: 'Pacific/Auckland' },
  { LC_ALL: 'C' },
  { LC_ALL: 'fr_FR.UTF-8' },
];

/** A start time no process on this host has. */
const WRONG = 'Thu Jan 1 00:00:00 1970';

/** The tools a test ran, and the pids its own spawns returned. */
interface Seen {
  readonly lines: Array<ReadonlyArray<string>>;
  readonly spawned: Set<number>;
}

const seen = (): Seen => ({ lines: [], spawned: new Set() });

/**
 * A spawner over `base` that records each tool it runs in `into`, and runs
 * it as if the caller's environment held `caller`, under the launch's own
 * variables.
 */
const recording = (
  base: ChildProcessSpawner.ChildProcessSpawner['Service'],
  into: Seen,
  caller: Vars = {},
) =>
  ChildProcessSpawner.make((command) => {
    if (command._tag !== 'StandardCommand') return base.spawn(command);
    into.lines.push([command.command, ...command.args].map(String));
    return base.spawn(
      ChildProcess.make(command.command, [...command.args], {
        ...command.options,
        env: { ...caller, ...command.options.env },
        extendEnv: true,
      }),
    );
  });

/** `self` with its tools run through `recording`. */
const through =
  (into: Seen, caller: Vars = {}) =>
  <A, E, R>(self: Effect.Effect<A, E, R>) =>
    Effect.flatMap(ChildProcessSpawner.ChildProcessSpawner, (base) =>
      Effect.provideService(
        self,
        ChildProcessSpawner.ChildProcessSpawner,
        recording(base, into, caller),
      ),
    );

/** The pids the `kill` runs in `into` named. */
const killed = (into: Seen) =>
  into.lines.filter(([tool]) => tool === 'kill').map((line) => Number(line.at(-1)));

/** A sleeper started through the live `Os`, stopped by the stop rule when the test's scope closes. */
const sleeper = (into: Seen) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const os = yield* Os;
    const cwd = yield* fs.makeTempDirectoryScoped();
    const owned = yield* os.spawn(SLEEPER, { cwd }).pipe(through(into));
    into.spawned.add(owned.pid);
    yield* Effect.addFinalizer(() => Effect.ignore(stop(owned).pipe(through(into))));
    return owned;
  });

/** The process group `pid` belongs to, as `ps` prints it. */
const groupOf = (pid: number) =>
  Effect.map(attempt('ps', ['-o', 'pgid=', '-p', String(pid)], Duration.seconds(30)), (done) =>
    done.output.trim(),
  );

/** `ps`'s raw start time of `pid` as the caller's environment prints it. */
const rawStart = (pid: number) =>
  Effect.map(attempt('ps', ['-o', 'lstart=', '-p', String(pid)], Duration.seconds(30)), (done) =>
    done.output.trim(),
  );

/** The live `Os`, with each signal's gap from the start of the read before it to its own end recorded in `gaps`. */
const timed = (live: (typeof Os)['Service'], gaps: Array<number>): (typeof Os)['Service'] => {
  let readAt = 0;
  return {
    spawn: live.spawn,
    self: live.self,
    started: (pid) =>
      Effect.flatMap(Clock.currentTimeNanos, (now) => {
        readAt = Number(now);
        return live.started(pid);
      }),
    signal: (pid, signal) =>
      Effect.tap(live.signal(pid, signal), () =>
        Effect.map(Clock.currentTimeNanos, (now) => {
          gaps.push((Number(now) - readAt) / 1e6);
        }),
      ),
  };
};

const median = (values: ReadonlyArray<number>) => {
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

const gone = (owned: Identity, now: Option.Option<string>) =>
  Option.match(now, { onNone: () => true, onSome: (start) => start !== owned.started });

/** A sleep no other process on this host runs: its seconds carry this run's millisecond. */
const marked = Effect.map(Clock.currentTimeMillis, (now) => `29.${Number(now) % 1_000_000}`);

/** Whether a process runs whose command line holds `mark`, by one `ps` of every process. */
const runs = (mark: string) =>
  Effect.map(attempt('ps', ['-A', '-o', 'command='], Duration.seconds(30)), (done) =>
    done.output.split('\n').some((line) => line.includes(mark)),
  );

/** Wait, at most `seconds`, until `runs(mark)` answers `wanted`. */
const until = (mark: string, wanted: boolean, seconds: number) =>
  ready(
    `a process with ${mark} to ${String(wanted)}`,
    seconds,
    Effect.filterOrFail(
      runs(mark),
      (now) => now === wanted,
      () => 'not yet',
    ),
  );

/** How long the sleep a spawning command starts runs: far past the bound that command has to end in. */
const OUTLIVES = '20';

/** How long a command that spawned through the live `Os` may take, from its start to its end. */
const ENDS_MS = 8_000;

const decodeIdentity = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Struct({ pid: Schema.Int, started: Schema.String })),
);

/** The open descriptors of `pid` (`lsof`, read only), each with the file it names. */
const descriptors = (pid: number) =>
  Effect.map(
    attempt(
      'lsof',
      ['-nP', '-a', '-p', String(pid), '-d', '0-1023', '-F', 'fn'],
      Duration.seconds(30),
    ),
    (done) => {
      const open: Array<readonly [fd: number, name: string]> = [];
      let fd = -1;
      for (const line of done.output.split('\n')) {
        if (line.startsWith('f')) fd = Number(line.slice(1));
        if (line.startsWith('n')) open.push([fd, line.slice(1)]);
      }
      return open;
    },
  );

/** A folder holding an executable `ps` that runs `body`, for a start's own start-time read. */
const stubPs = (body: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    yield* fs.writeFileString(`${dir}/ps`, `#!/bin/sh\n${body}\n`);
    yield* fs.chmod(`${dir}/ps`, 0o755);
    return { dir, path: `${dir}:/usr/bin:/bin` };
  });

describe('the live Os', () => {
  it.scopedLive.layer(BunServices.layer)(
    'spawn answers the child itself: its pid holds a sleep, and its start time reads back the same twice',
    () =>
      Effect.gen(function* () {
        const os = yield* Os;
        const into = seen();
        const owned = yield* sleeper(into);
        expect(Number.isInteger(owned.pid) && owned.pid >= 2).toBe(true);
        expect(owned.started).toMatch(/^\w{3} \w{3} \d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/);
        const comm = yield* attempt(
          'ps',
          ['-o', 'comm=', '-p', String(owned.pid)],
          Duration.seconds(30),
        ).pipe(through(into));
        expect(comm.output.trim()).toEndWith('sleep');
        expect(yield* os.started(owned.pid).pipe(through(into))).toEqual(
          Option.some(owned.started),
        );
        expect(yield* os.started(owned.pid).pipe(through(into))).toEqual(
          Option.some(owned.started),
        );
        expect(killed(into)).toEqual([]);
      }),
    SPAWNS_MS,
  );

  it.scopedLive.layer(BunServices.layer)(
    'started reads one start time whatever the caller’s TZ and locale, though ps itself prints them apart',
    () =>
      Effect.gen(function* () {
        const os = yield* Os;
        const into = seen();
        const owned = yield* sleeper(into);
        const raw: Array<string> = [];
        for (const caller of CALLERS) {
          expect(yield* os.started(owned.pid).pipe(through(into, caller))).toEqual(
            Option.some(owned.started),
          );
          raw.push(yield* rawStart(owned.pid).pipe(through(into, caller)));
        }
        expect(raw[0]).not.toEqual(raw[1]);
        expect(killed(into)).toEqual([]);
      }),
    SPAWNS_MS,
  );

  it.scopedLive.layer(BunServices.layer)(
    'self answers this process: its own pid, and the start time started reads at that pid, the same twice and under any caller',
    () =>
      Effect.gen(function* () {
        const os = yield* Os;
        const into = seen();
        const first = yield* os.self.pipe(through(into));
        // oxlint-disable-next-line no-restricted-properties -- the test compares the seam's answer with the process's own pid
        expect(first.pid).toBe(process.pid);
        expect(yield* os.started(first.pid).pipe(through(into))).toEqual(
          Option.some(first.started),
        );
        expect(yield* os.self.pipe(through(into, { TZ: 'Pacific/Auckland' }))).toEqual(first);
        expect(yield* os.self.pipe(through(into, { LC_ALL: 'fr_FR.UTF-8' }))).toEqual(first);
        expect(killed(into)).toEqual([]);
      }),
    SPAWNS_MS,
  );

  it.scopedLive.layer(BunServices.layer)(
    'the stop rule leaves a process alive under a wrong recorded start, ends it under the right one, and its start time goes',
    () =>
      Effect.gen(function* () {
        const os = yield* Os;
        const into = seen();
        const owned = yield* sleeper(into);
        expect(yield* stop({ pid: owned.pid, started: WRONG }).pipe(through(into))).toBe(false);
        expect(killed(into)).toEqual([]);
        expect(yield* os.started(owned.pid).pipe(through(into))).toEqual(
          Option.some(owned.started),
        );
        expect(yield* stop(owned).pipe(through(into))).toBe(true);
        expect(killed(into)).toEqual([owned.pid]);
        expect(gone(owned, yield* os.started(owned.pid).pipe(through(into)))).toBe(true);
      }),
    SPAWNS_MS,
  );

  it.scopedLive.layer(BunServices.layer)(
    'a spawn whose child cannot read its own start time fails typed, and the child ends itself before it becomes the program',
    () =>
      Effect.gen(function* () {
        const os = yield* Os;
        const into = seen();
        const mark = yield* marked;
        const stub = yield* stubPs('exit 2');
        const exit = yield* Effect.exit(
          os.spawn(['/bin/sleep', mark], { cwd: stub.dir, env: { PATH: stub.path } }),
        );
        expect(exit._tag).toBe('Failure');
        yield* until(mark, false, 10).pipe(through(into));
        expect(killed(into)).toEqual([]);
      }),
    SPAWNS_MS,
  );

  it.scopedLive.layer(BunServices.layer)(
    'a spawn interrupted while its child reads its start time leaves no process: the child sees its input end and ends itself',
    () =>
      Effect.gen(function* () {
        const os = yield* Os;
        const into = seen();
        const mark = yield* marked;
        const stub = yield* stubPs('/bin/sleep 1\nexec /bin/ps "$@"');
        const spawning = yield* Effect.forkChild(
          os.spawn(['/bin/sleep', mark], { cwd: stub.dir, env: { PATH: stub.path } }),
        );
        yield* until(mark, true, 10).pipe(through(into));
        yield* Fiber.interrupt(spawning);
        yield* until(mark, false, 10).pipe(through(into));
        expect(killed(into)).toEqual([]);
      }),
    SPAWNS_MS,
  );

  it.scopedLive.layer(BunServices.layer)(
    'a command that spawns through the live Os ends while its child runs on, and the child shares no file with it: it holds fds 0-2 only, each /dev/null',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const os = yield* Os;
        const into = seen();
        const cwd = yield* fs.makeTempDirectoryScoped();
        const script = path.join(import.meta.dirname, 'fixtures', 'spawner.ts');
        const begun = yield* Clock.currentTimeMillis;
        const done = yield* attempt('bun', [script, cwd, OUTLIVES], Duration.seconds(60)).pipe(
          through(into),
        );
        const took = Number(yield* Clock.currentTimeMillis) - Number(begun);
        expect(done.exitCode).toBe(0);
        const owned = yield* decodeIdentity(done.output.trim());
        into.spawned.add(owned.pid);
        yield* Effect.addFinalizer(() => Effect.ignore(stop(owned).pipe(through(into))));
        expect(took).toBeLessThan(ENDS_MS);
        expect(yield* os.started(owned.pid).pipe(through(into))).toEqual(
          Option.some(owned.started),
        );
        expect(yield* descriptors(owned.pid).pipe(through(into))).toEqual([
          [0, '/dev/null'],
          [1, '/dev/null'],
          [2, '/dev/null'],
        ]);
        expect(killed(into)).toEqual([]);
      }),
    SPAWNS_MS,
  );

  it.scopedLive.layer(BunServices.layer)(
    "a command that spawns through the live Os leaves its child in a process group of its own, so a signal to the command's group (a shell ending the call) never reaches it",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const os = yield* Os;
        const into = seen();
        const cwd = yield* fs.makeTempDirectoryScoped();
        const script = path.join(import.meta.dirname, 'fixtures', 'spawner.ts');
        const done = yield* attempt('bun', [script, cwd, OUTLIVES], Duration.seconds(60)).pipe(
          through(into),
        );
        expect(done.exitCode).toBe(0);
        const owned = yield* decodeIdentity(done.output.trim());
        into.spawned.add(owned.pid);
        yield* Effect.addFinalizer(() => Effect.ignore(stop(owned).pipe(through(into))));
        const self = yield* os.self.pipe(through(into));
        const child = yield* groupOf(owned.pid).pipe(through(into));
        expect(child).not.toBe(yield* groupOf(self.pid).pipe(through(into)));
        expect(child).not.toBe('');
        expect(killed(into)).toEqual([]);
      }),
    SPAWNS_MS,
  );

  it.scopedLive.layer(BunServices.layer)(
    `the gap from the start-time read to the signal, over ${RUNS} stops, each signal to a pid the test spawned`,
    () =>
      Effect.gen(function* () {
        const live = yield* Os;
        const into = seen();
        const gaps: Array<number> = [];
        const os = timed(live, gaps);
        for (let run = 0; run < RUNS; run += 1) {
          const owned = yield* sleeper(into);
          const stopped = yield* stop(owned).pipe(Effect.provideService(Os, os), through(into));
          expect(stopped).toBe(true);
          expect(gone(owned, yield* live.started(owned.pid).pipe(through(into)))).toBe(true);
        }
        expect(gaps.length).toBeGreaterThanOrEqual(RUNS);
        expect(killed(into).every((pid) => into.spawned.has(pid))).toBe(true);
        const max = Math.max(...gaps);
        yield* Console.log(
          `os: read-to-signal gap over ${gaps.length} signals: median ${median(gaps).toFixed(1)} ms, max ${max.toFixed(1)} ms`,
        );
      }),
    SPAWNS_MS,
  );
});
