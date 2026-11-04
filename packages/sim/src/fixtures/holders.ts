/* oxlint-disable effect/noNodeBuiltinImport, no-restricted-imports, effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAs, effect/noAsyncFunction, effect/noNewPromise, effect/noRuntimeTypeof, effect/maxCognitiveComplexity, no-await-in-loop -- the scheduler makes each world's folder with node:fs, gates each command's calls on a promise of its own and wakes them one at a time, as separate processes on one host would run, and its FileSystem proxy wraps every member that is a function. */
/**
 * The state holder (`holder.ts`) under a scheduler: each actor is a command
 * of its own (a process with the identity its `Os.self` answers) that
 * acquires the state, runs one to three steps holding it, and releases it.
 * Every FileSystem and `Os` call of an actor waits for the scheduler, which
 * wakes one waiting actor at a time once every other is waiting, so a seed
 * is one exact interleaving. An actor may fail one call typed, or exit
 * abruptly after one takes effect: no finalizer, no later call, its process
 * dead, and in some worlds its pid taken at once by a foreign process.
 *
 * Judged: no actor acquires while another live actor holds (`exclusive`); a
 * fresh actor alone after every other has ended acquires (`stuck`); the
 * holder never signals or spawns (`signal`); every failure is typed
 * (`untyped`).
 */
import * as nfs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as BunServices from '@effect/platform-bun/BunServices';
import { Cause, Effect, Exit, FileSystem, Option } from 'effect';
import * as PlatformError from 'effect/PlatformError';
import { ChildProcessSpawner } from 'effect/process';

import { ToolFailed } from '../errors.ts';
import { acquire, release } from '../holder.ts';
import { Os, type OsMembers } from '../os.ts';

interface Proc {
  readonly pid: number;
  readonly start: string;
  alive: boolean;
}

interface Actor {
  readonly name: string;
  readonly proc: Proc;
  status: 'run' | 'gate' | 'done' | 'dead';
  wake: () => void;
  calls: number;
  failAt: number;
  exitAt: number;
  readonly work: number;
  inside: boolean;
  outcome: string;
}

interface World {
  readonly dir: string;
  readonly label: string;
  readonly rand: () => number;
  readonly procs: Array<Proc>;
  readonly actors: Array<Actor>;
  readonly state: string;
  running: number;
  readonly violations: Array<string>;
  foreignOnExit: boolean;
  next: number;
  starts: number;
}

const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const platformFs: FileSystem.FileSystem = Effect.runSync(
  Effect.gen(function* () {
    return yield* FileSystem.FileSystem;
  }).pipe(Effect.provide(BunServices.layer)),
);

const newProc = (w: World, pid?: number): Proc => {
  w.starts += 1;
  w.next += 1;
  const proc: Proc = {
    pid: pid ?? w.next,
    start: `Tue Nov 3 12:00:00 2026 #${w.starts}`,
    alive: true,
  };
  w.procs.push(proc);
  return proc;
};

const holderOf = (w: World, pid: number) => w.procs.find((p) => p.alive && p.pid === pid);
const violate = (w: World, kind: string, text: string) =>
  void w.violations.push(`${kind}: [${w.label}] ${text}`);

const gate = (w: World, a: Actor) =>
  new Promise<void>((resolve) => {
    w.running -= 1;
    a.status = 'gate';
    a.wake = () => {
      a.status = 'run';
      w.running += 1;
      resolve();
    };
  });

const kill = (w: World, a: Actor) => {
  a.status = 'dead';
  a.proc.alive = false;
  a.outcome = 'exited';
  w.running -= 1;
  if (w.foreignOnExit) newProc(w, a.proc.pid);
};

/** One gated call of `a`: wait for the scheduler, then fail, run, or run and exit. */
const call = <A, E>(
  w: World,
  a: Actor,
  run: () => Effect.Effect<A, E>,
  failure: () => E,
  onRun: () => void = () => {},
): Effect.Effect<A, E> =>
  Effect.andThen(
    Effect.promise(() => gate(w, a)),
    Effect.suspend((): Effect.Effect<A, E> => {
      a.calls += 1;
      if (a.calls === a.failAt) return Effect.fail(failure());
      onRun();
      if (a.calls === a.exitAt)
        return Effect.flatMap(Effect.exit(Effect.suspend(run)), () => {
          kill(w, a);
          return Effect.never;
        });
      return Effect.suspend(run);
    }),
  );

const fault = (method: string) =>
  PlatformError.systemError({
    _tag: 'PermissionDenied',
    module: 'FileSystem',
    method,
    description: 'injected fault',
  });

type Method = (...args: Array<unknown>) => unknown;

const fsFor = (w: World, a: Actor): FileSystem.FileSystem =>
  new Proxy(platformFs, {
    get(target, name) {
      const value: unknown = Reflect.get(target, name);
      if (typeof value !== 'function' || typeof name !== 'string') return value;
      return (...args: Array<unknown>) => {
        const releasing = name === 'symlink' && String(args[1]).endsWith('.done');
        return call(
          w,
          a,
          () =>
            Reflect.apply(value as Method, target, args) as Effect.Effect<
              unknown,
              PlatformError.PlatformError
            >,
          () => fault(name),
          () => {
            if (releasing) a.inside = false;
          },
        );
      };
    },
  });

const osFor = (w: World, a: Actor): OsMembers => {
  const failure = () =>
    ToolFailed.make({ tool: 'ps', args: [], exitCode: 1, output: 'injected fault' });
  return {
    self: call(w, a, () => Effect.succeed({ pid: a.proc.pid, started: a.proc.start }), failure),
    started: (pid) =>
      call(
        w,
        a,
        () => Effect.succeed(Option.map(Option.fromUndefinedOr(holderOf(w, pid)), (p) => p.start)),
        failure,
      ),
    signal: (pid) =>
      Effect.sync(() => {
        violate(w, 'signal', `${a.name} signalled ${pid} through Os`);
        return false;
      }),
    spawn: () =>
      Effect.suspend(() => {
        violate(w, 'signal', `${a.name} spawned through Os`);
        return Effect.fail(failure());
      }),
  };
};

const newActor = (w: World, name: string, faults: boolean, pid?: number): Actor => {
  const r = w.rand();
  const at = 1 + Math.floor(w.rand() * 14);
  return {
    name,
    proc: newProc(w, pid),
    status: 'run',
    wake: () => {},
    calls: 0,
    failAt: faults && r < 0.15 ? at : 0,
    exitAt: faults && r >= 0.15 && r < 0.4 ? at : 0,
    work: 1 + Math.floor(w.rand() * 3),
    inside: false,
    outcome: 'running',
  };
};

const workFault = () =>
  PlatformError.systemError({
    _tag: 'Unknown',
    module: 'FileSystem',
    method: 'work',
    description: 'injected fault',
  });

/** The model `Os` reaches no tool, so no spawn is ever asked for. */
const noSpawns = ChildProcessSpawner.make(() => Effect.die('the holder spawned a tool'));

const start = (w: World, a: Actor) => {
  w.actors.push(a);
  w.running += 1;
  const program = Effect.gen(function* () {
    const held = yield* acquire(w.state);
    const other = w.actors.find((b) => b !== a && b.inside && b.proc.alive);
    if (other !== undefined)
      violate(w, 'exclusive', `${a.name} acquired while ${other.name} holds`);
    a.inside = true;
    for (let i = 0; i < a.work; i += 1) yield* call(w, a, () => Effect.void, workFault);
    yield* release(held);
    a.inside = false;
  }).pipe(
    Effect.provideService(FileSystem.FileSystem, fsFor(w, a)),
    Effect.provideService(Os, osFor(w, a)),
    Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, noSpawns),
  );
  void Effect.runPromiseExit(program).then((exit) => {
    if (a.status === 'dead') return;
    a.status = 'done';
    a.inside = false;
    a.proc.alive = false;
    w.running -= 1;
    if (Exit.isSuccess(exit)) {
      a.outcome = 'held';
      return;
    }
    if (Cause.hasDies(exit.cause)) {
      a.outcome = 'defect';
      violate(w, 'untyped', `${a.name}: defect ${String(Cause.squash(exit.cause)).slice(0, 160)}`);
      return;
    }
    const error = Cause.squash(exit.cause) as { readonly _tag?: unknown } | undefined;
    a.outcome = error?._tag === 'StateBusy' ? 'busy' : `failed ${String(error?._tag)}`;
  });
};

/**
 * Wait until no actor runs: each is waiting at a call or has ended. A
 * woken actor's call is real file work, which a loaded host can make slow,
 * so the wait counts no turns and has no time limit of its own: an actor
 * that never reaches its next call holds the test past bun's time limit.
 */
const settle = async (w: World) => {
  while (w.running > 0) await new Promise((resolve) => setImmediate(resolve));
};

/** A schedule's opening: wake `name` that many times (or until it ends), in order. */
export type Script = ReadonlyArray<readonly [string, number | 'done']>;

/** Wake actors one at a time until every one has ended: the script's steps first, then seeded picks. */
const schedule = async (w: World, script: Script = []) => {
  let last: Actor | undefined;
  const steps = script.map(([name, count]) => [name, count] as [string, number | 'done']);
  for (let guard = 0; guard < 5000; guard += 1) {
    await settle(w);
    const waiting = w.actors.filter((a) => a.status === 'gate');
    if (waiting.length === 0) return;
    let pick: Actor | undefined;
    for (let head = steps[0]; head !== undefined && pick === undefined; head = steps[0]) {
      const [name, count] = head;
      const a = waiting.find((b) => b.name === name);
      if (a === undefined) {
        steps.shift();
        continue;
      }
      if (count === 'done') pick = a;
      else if (count > 0) {
        pick = a;
        steps[0] = [name, count - 1];
        if (count === 1) steps.shift();
      } else steps.shift();
    }
    if (pick === undefined) {
      if (last !== undefined && last.status === 'gate' && w.rand() < 0.6) pick = last;
      else pick = waiting[Math.floor(w.rand() * waiting.length)];
    }
    if (pick === undefined) return;
    last = pick;
    pick.wake();
  }
  violate(w, 'untyped', 'the scheduler ran 5000 steps');
};

/** A world in a scratch folder of its own, removed once it is judged. */
const makeWorld = (label: string, seed: number): World => {
  const dir = nfs.mkdtempSync(join(tmpdir(), 'sim-holders-'));
  nfs.mkdirSync(`${dir}/state`, { recursive: true });
  const rand = rng(seed);
  return {
    dir,
    label,
    rand,
    procs: [],
    actors: [],
    state: `${dir}/state`,
    running: 0,
    violations: [],
    foreignOnExit: rand() < 0.5,
    next: 4_300_000 + seed * 64,
    starts: 0,
  };
};

const finish = async (w: World) => {
  const fresh = newActor(w, 'fresh', false);
  start(w, fresh);
  await schedule(w);
  if (fresh.outcome !== 'held')
    violate(w, 'stuck', `the fresh actor, alone, ended ${fresh.outcome}`);
};

/** One world's violations and how each actor ended, by name. */
export interface Judged {
  readonly violations: ReadonlyArray<string>;
  readonly outcomes: Readonly<Record<string, string>>;
}

const judged = (w: World): Judged => {
  nfs.rmSync(w.dir, { recursive: true, force: true });
  return {
    violations: w.violations,
    outcomes: Object.fromEntries(w.actors.map((a) => [a.name, a.outcome])),
  };
};

/** The fixed schedules, by name: each the interleaving a defect of the holder needs. */
export const FIXED = {
  'a stale acquirer lists before two whole holds run': async () => {
    const w = makeWorld('stale acquirer', 900_001);
    w.foreignOnExit = false;
    for (const name of ['A', 'B', 'C', 'D']) start(w, newActor(w, name, false));
    await schedule(w, [
      ['A', 3],
      ['B', 'done'],
      ['C', 'done'],
      ['A', 2],
      ['D', 'done'],
    ]);
    await finish(w);
    return judged(w);
  },
  'two reclaimers of one dead holder': async () => {
    const w = makeWorld('two reclaimers', 900_002);
    w.foreignOnExit = false;
    const dead = newActor(w, 'H', false);
    dead.exitAt = 6;
    start(w, dead);
    await schedule(w, [['H', 'done']]);
    for (const name of ['R1', 'R2']) start(w, newActor(w, name, false));
    await schedule(w, [
      ['R1', 3],
      ['R2', 3],
      ['R1', 'done'],
      ['R2', 'done'],
    ]);
    await finish(w);
    return judged(w);
  },
  'a dead holder whose pid a foreign process took': async () => {
    const w = makeWorld('foreign on the pid', 900_003);
    w.foreignOnExit = true;
    const dead = newActor(w, 'H', false);
    dead.exitAt = 6;
    start(w, dead);
    await schedule(w, [['H', 'done']]);
    await finish(w);
    return judged(w);
  },
  "the next command reuses a dead holder's pid": async () => {
    const w = makeWorld('pid reused', 900_004);
    w.foreignOnExit = false;
    const dead = newActor(w, 'H', false);
    dead.exitAt = 6;
    start(w, dead);
    await schedule(w, [['H', 'done']]);
    start(w, newActor(w, 'N', false, dead.proc.pid));
    await schedule(w, [['N', 'done']]);
    return judged(w);
  },
} as const;

/** A generated world: 3-5 actors at once, then 1-3 more (some on a dead actor's pid), then a fresh one alone. */
export const generated = async (seed: number) => {
  const w = makeWorld(`seed ${seed}`, seed);
  const first = 3 + Math.floor(w.rand() * 3);
  for (let i = 0; i < first; i += 1) start(w, newActor(w, `a${i}`, true));
  await schedule(w);
  const dead = w.actors.filter((a) => a.status === 'dead' && holderOf(w, a.proc.pid) === undefined);
  const second = 1 + Math.floor(w.rand() * 3);
  for (let i = 0; i < second; i += 1) {
    const reused = dead.length > 0 && w.rand() < 0.5 ? dead.shift()?.proc.pid : undefined;
    start(w, newActor(w, `b${i}`, true, reused));
  }
  await schedule(w);
  await finish(w);
  return judged(w);
};

/** The generated worlds `from` to `to` (exclusive): every violation, and how many actors ended each way. */
export const generatedRange = async (from: number, to: number) => {
  const violations: Array<string> = [];
  const ends = { held: 0, busy: 0, exited: 0, failed: 0, defect: 0, running: 0 };
  for (let seed = from; seed < to; seed += 1) {
    const one = await generated(seed);
    violations.push(...one.violations);
    for (const outcome of Object.values(one.outcomes)) {
      const kind = (outcome.split(' ')[0] ?? outcome) as keyof typeof ends;
      ends[kind] += 1;
    }
  }
  return { violations, ends };
};
