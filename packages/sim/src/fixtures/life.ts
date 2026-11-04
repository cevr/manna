/* oxlint-disable effect/noNodeBuiltinImport, no-restricted-imports, effect/noGlobals, effect/noNullish, effect/noTernary, effect/noTryCatch, effect/noAs, effect/noAsyncFunction, effect/noNewPromise, effect/noRuntimeTypeof, no-await-in-loop -- the model judges the drive by reading its record and state folder with node:fs, beside every FileSystem the drive is given, and runs its commands as promises one after another, as separate processes would. */
/**
 * The drive's lifecycle as a model: `runSim` over a fresh `DriveLive` for
 * each command, on a real scratch tree, with a fake `Os` whose process table
 * outlives every command. Each command is a process of its own (the identity
 * `Os.self` answers), alive while it runs. A fault lands at one host call (a
 * FileSystem call but `readLink`, a tool, a dev-server request, an `Os`
 * call): `fail` fails it typed, `interrupt` interrupts the command while it
 * runs (its answer arrives only where the drive is uninterruptible), and
 * `exit` lets it take effect and ends the command abruptly: no finalizer
 * runs, no later call of it returns, and its process is dead, so the next
 * command is a fresh process over the same files and processes.
 *
 * Judged on every host call and between commands:
 *   authority  a signal reaches only a live server a boot of the same state
 *              spawned, which the signalling command spawned or read in a
 *              record; never a command, a foreign process, pid <= 1;
 *   reread     the host call before each signal read that process's start;
 *   exclusive  no two commands running at once signal one process, and no
 *              write, rename or copy replaces an existing `*.json`;
 *   found      every live server is named, by pid and start time, by its
 *              state's `session.json`, but inside its boot's spawn-to-record
 *              window (from the spawn until the record names it, while the
 *              booting command runs; an abrupt exit there leaves it exempt);
 *   orphan     the same, between commands;
 *   seam       no `kill` or start-time `ps` reaches the tools: every signal
 *              and identity read goes through `Os`;
 *   model      a command neither faulted nor overlapped ends as the
 *              reference model says, from the state its record was in;
 *   untyped    a command fails typed, or is interrupted only when asked.
 * `converge` downs each state until its record is gone, then boots and downs
 * it once more: every server is stopped (`leak`), and no holder or record is
 * stuck (`stuck`).
 */
import * as nfs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as BunServices from '@effect/platform-bun/BunServices';
import {
  Cause,
  Clock,
  Console,
  Duration,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Sink,
  Stream,
} from 'effect';
import { HttpClient, HttpClientError, HttpClientResponse } from 'effect/http';
import * as PlatformError from 'effect/PlatformError';
import { ChildProcessSpawner } from 'effect/process';

import { runSim } from '../command.ts';
import { DriveLive, type Place } from '../drive.ts';
import { ToolFailed } from '../errors.ts';
import { Os, type OsMembers } from '../os.ts';
import { APP } from './contain.ts';

export type StateKey = 'a' | 'b';
type Kind = 'server' | 'command' | 'foreign';

export interface Proc {
  readonly n: number;
  readonly pid: number;
  readonly start: string;
  alive: boolean;
  readonly kind: Kind;
  readonly state?: StateKey;
  readonly port?: number;
  /** The booting command's serial, for a server. */
  readonly boot?: number;
  /** Open from the spawn until the record names the server, while its booting command runs. */
  window: boolean;
  /** The booting command exited abruptly inside the window. */
  exempt: boolean;
  readonly signalledBy: Array<number>;
}

export type How = 'fail' | 'interrupt' | 'exit';

/** One host call, as the model sees it. */
export interface Call {
  readonly kind: 'fs' | 'tool' | 'http' | 'os';
  readonly name: string;
  readonly path: string;
}

/** Where a fault or a pause lands: the n-th host call, or the n-th call `pick` answers true for. */
export type At = number | { readonly pick: (call: Call) => boolean; readonly n: number };

export interface Plan {
  readonly fault?: { readonly at: At; readonly how: How };
  /** A second fault, inside the recovery of the first: the n-th host call after it. */
  readonly second?: { readonly at: number; readonly how: 'fail' | 'exit' };
  readonly pause?: { readonly at: At; readonly run: () => Promise<unknown> };
  /** The command's process takes this pid (a dead command's), when no live process holds it. */
  readonly pid?: number;
}

export type Outcome = 'ok' | 'fail' | 'interrupted' | 'exited';

export interface Cmd {
  readonly kind: 'boot' | 'down' | 'clean' | 'tap';
  readonly s: StateKey;
  readonly platform?: 'ios' | 'web';
  readonly port?: number;
  readonly out?: string;
}

interface Ev {
  readonly type: 'read' | 'signal' | 'call';
  readonly pid?: number;
  readonly found?: number;
}

interface Ctx {
  readonly w: World;
  readonly serial: number;
  readonly id: string;
  readonly cmd: Cmd;
  readonly self: Proc;
  readonly plan: Plan;
  readonly events: Array<Ev>;
  readonly spawned: Array<Proc>;
  readonly read: Set<number>;
  readonly counts: Map<At, number>;
  calls: number;
  faulted: boolean;
  afterFault: number;
  secondHit: boolean;
  paused: boolean;
  dead: boolean;
  interruptAsked: boolean;
  sent: Promise<void>;
  reached: () => void;
  settle: (outcome: Outcome) => void;
}

/** A command's end: how it ended, how many host calls it made, and whether its fault was reached. */
export interface Ended {
  readonly outcome: Outcome;
  readonly calls: number;
  readonly faulted: boolean;
  /** The plan's second fault, inside the recovery of the first, was reached. */
  readonly second: boolean;
  readonly tag: string;
}

export interface World {
  readonly base: string;
  readonly app: string;
  readonly script: string;
  readonly features: string;
  readonly states: Record<StateKey, string>;
  readonly procs: Array<Proc>;
  readonly violations: Array<string>;
  readonly running: Map<number, Ctx>;
  readonly rand: () => number;
  next: number;
  clock: number;
  serial: number;
  /** Signals sent through `Os`, in all. */
  signals: number;
}

const lcg = (seed: number) => {
  let state = (seed * 2_654_435_761) >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
};

const write = (file: string, text: string) => {
  nfs.mkdirSync(join(file, '..'), { recursive: true });
  nfs.writeFileSync(file, text);
};

/** A scratch parent for worlds; remove it with `dispose`. */
export const scratch = () => nfs.mkdtempSync(join(tmpdir(), 'sim-life-'));
export const dispose = (dir: string) => nfs.rmSync(dir, { recursive: true, force: true });

/** A world in a scratch folder of its own under `parent`: an app, two state folders (one about 90 bytes deeper), no process. */
export const world = (parent: string, seed: number): World => {
  const base = nfs.mkdtempSync(join(parent, 'w-'));
  const app = `${base}/repo/apps/hymnal`;
  write(`${app}/package.json`, '{"name":"probe"}');
  write(`${app}/node_modules/.bin/one`, 'one');
  write(`${app}/node_modules/hermes-compiler/package.json`, '{"name":"hermes-compiler"}');
  write(`${app}/node_modules/hermes-compiler/hermesc/osx-bin/hermesc`, 'hermesc');
  write(`${app}/scripts/sim.ts`, '');
  write(`${base}/features/probe.journey.json`, '{}');
  const a = `${base}/sa`;
  const b = `${base}/${'d'.repeat(40)}/${'e'.repeat(40)}/sb`;
  nfs.mkdirSync(a, { recursive: true });
  nfs.mkdirSync(b, { recursive: true });
  const rand = lcg(seed);
  return {
    base,
    app,
    script: `${app}/scripts/sim.ts`,
    features: `${base}/features`,
    states: { a, b },
    procs: [],
    violations: [],
    running: new Map(),
    rand,
    next: 4_100_000 + Math.floor(rand() * 1000) * 10,
    clock: 0,
    serial: 0,
    signals: 0,
  };
};

export const newProc = (
  w: World,
  fields: { kind: Kind; pid?: number; state?: StateKey; port?: number; boot?: number },
) => {
  w.clock += 1;
  let pid = fields.pid;
  if (pid === undefined) {
    w.next += 1 + Math.floor(w.rand() * 3);
    pid = w.next;
  }
  const minutes = String(Math.floor(w.clock / 60) % 60).padStart(2, '0');
  const seconds = String(w.clock % 60).padStart(2, '0');
  const proc: Proc = {
    n: w.procs.length,
    kind: fields.kind,
    state: fields.state,
    port: fields.port,
    boot: fields.boot,
    pid,
    start: `Tue Nov 3 12:${minutes}:${seconds} 2026`,
    alive: true,
    window: fields.kind === 'server',
    exempt: false,
    signalledBy: [],
  };
  w.procs.push(proc);
  return proc;
};

const holder = (w: World, pid: number) => w.procs.find((p) => p.alive && p.pid === pid);

const violate = (w: World, kind: string, text: string) =>
  void w.violations.push(`${kind}: ${text}`);

/** What a state's record holds now, as JSON; none when it is absent or not JSON. */
export interface Record_ {
  readonly serverPid?: unknown;
  readonly serverStarted?: unknown;
}

export const record = (w: World, s: StateKey): Record_ | undefined => {
  try {
    return JSON.parse(nfs.readFileSync(`${w.states[s]}/session.json`, 'utf8'));
  } catch {
    return undefined;
  }
};

/** The live server a state's record names by identity, if any. */
export const recorded = (w: World, s: StateKey) => {
  const rec = record(w, s);
  if (rec?.serverStarted === undefined) return undefined;
  return w.procs.find(
    (p) =>
      p.kind === 'server' &&
      p.state === s &&
      p.pid === rec.serverPid &&
      p.start === rec.serverStarted &&
      p.alive,
  );
};

/** The reference model's view of a state: no record, a legacy one, one whose server runs, or one whose server is gone. */
export type Phase = 'none' | 'legacy' | 'live' | 'stale';

export const phase = (w: World, s: StateKey): Phase => {
  if (!nfs.existsSync(`${w.states[s]}/session.json`)) return 'none';
  const rec = record(w, s);
  if (rec?.serverStarted === undefined) return 'legacy';
  if (recorded(w, s) !== undefined) return 'live';
  return 'stale';
};

/** The state's scratch HOME is there and is not a folder: the drivers cannot run in it. */
export const homeBroken = (w: World, s: StateKey) => {
  const home = `${w.states[s]}/home`;
  return nfs.existsSync(home) && !nfs.lstatSync(home).isDirectory();
};

/**
 * The reference model: how a command neither faulted nor overlapped ends
 * from `before`, with the state's scratch HOME `broken` or not and, for a
 * boot, its port `taken` by a server already, and the phase it leaves; none
 * where the model says nothing (a driver step over a stale or legacy
 * record).
 */
export const predict = (
  cmd: Cmd,
  before: Phase,
  broken: boolean,
  taken: boolean,
): Option.Option<readonly [Outcome, Phase]> => {
  if (cmd.kind === 'boot') {
    if (before === 'live' || before === 'legacy') return Option.some(['fail', before]);
    if (broken || taken) return Option.some(['fail', 'none']);
    return Option.some(['ok', 'live']);
  }
  if (cmd.kind === 'down' || cmd.kind === 'clean') {
    if (before === 'none') return Option.some([cmd.kind === 'down' ? 'fail' : 'ok', 'none']);
    if (broken && before === 'live') return Option.some(['fail', 'none']);
    return Option.some(['ok', 'none']);
  }
  if (before === 'none') return Option.some(['fail', 'none']);
  if (before === 'live') return Option.some([broken ? 'fail' : 'ok', 'live']);
  return Option.none();
};

const names = (rec: Record_ | undefined, p: Proc) =>
  rec?.serverPid === p.pid && rec?.serverStarted === p.start;

/** Every live server is named by its state's record, but inside its window. */
const checkFound = (w: World, kind: 'found' | 'orphan', where: string) => {
  for (const p of w.procs) {
    if (p.kind !== 'server' || !p.alive || p.state === undefined) continue;
    if (names(record(w, p.state), p)) {
      p.window = false;
      continue;
    }
    if (p.window || p.exempt) continue;
    violate(
      w,
      kind,
      `state ${p.state}: server ${p.pid} (boot #${p.boot}) is alive and unrecorded (${where})`,
    );
  }
};

/** Live servers a drive spawned that no window exempts. */
export const live = (w: World) =>
  w.procs.filter((p) => p.kind === 'server' && p.alive && !p.exempt);

const matches = (c: Ctx, at: At, call: Call) => {
  if (typeof at === 'number') return c.calls === at;
  if (!at.pick(call)) return false;
  const k = (c.counts.get(at) ?? 0) + 1;
  c.counts.set(at, k);
  return k === at.n;
};

const die = (c: Ctx) => {
  c.dead = true;
  c.self.alive = false;
  for (const p of c.spawned) if (p.window && p.alive) p.exempt = true;
  c.settle('exited');
};

/** One host call of `c`: counted, paused, faulted, then judged. */
const host = <A, E>(
  c: Ctx,
  call: Call,
  body: () => Effect.Effect<A, E>,
  failure: () => E,
): Effect.Effect<A, E> =>
  Effect.suspend((): Effect.Effect<A, E> => {
    if (c.dead) return Effect.never;
    c.calls += 1;
    if (c.faulted) c.afterFault += 1;
    if (call.kind !== 'os') c.events.push({ type: 'call' });
    let before: Effect.Effect<unknown> = Effect.void;
    const pause = c.plan.pause;
    if (pause !== undefined && !c.paused && matches(c, pause.at, call)) {
      c.paused = true;
      before = Effect.promise(() => pause.run());
    }
    let how: How | undefined;
    const fault = c.plan.fault;
    const second = c.plan.second;
    if (fault !== undefined && !c.faulted && matches(c, fault.at, call)) {
      c.faulted = true;
      how = fault.how;
    } else if (second !== undefined && c.faulted && !c.secondHit && c.afterFault === second.at) {
      c.secondHit = true;
      how = second.how;
    }
    const after = Effect.sync(() => {
      if (!c.dead) checkFound(c.w, 'found', `after ${c.id} ${call.kind} ${call.name} ${call.path}`);
    });
    if (how === 'fail')
      return Effect.andThen(before, Effect.andThen(after, Effect.fail(failure())));
    if (how === 'interrupt')
      return Effect.andThen(
        before,
        Effect.andThen(
          Effect.sync(() => {
            c.interruptAsked = true;
            c.reached();
          }),
          Effect.andThen(
            Effect.promise(() => c.sent),
            Effect.ensuring(Effect.suspend(body), after),
          ),
        ),
      );
    if (how === 'exit')
      return Effect.andThen(
        before,
        Effect.flatMap(Effect.exit(Effect.suspend(body)), () => {
          checkFound(c.w, 'found', `after ${c.id} ${call.kind} ${call.name}, its last`);
          die(c);
          return Effect.never;
        }),
      );
    return Effect.andThen(before, Effect.ensuring(Effect.suspend(body), after));
  });

/** FileSystem calls that may replace a file at their last path argument. */
const REPLACING = new Set(['rename', 'copy', 'copyFile']);
const WRITING = new Set(['writeFile', 'writeFileString']);

const platformFs: FileSystem.FileSystem = Effect.runSync(
  Effect.gen(function* () {
    return yield* FileSystem.FileSystem;
  }).pipe(Effect.provide(BunServices.layer)),
);

/** A write that would replace a `*.json` file already there. */
const replaces = (name: string, args: ReadonlyArray<unknown>) => {
  if (REPLACING.has(name)) {
    const to = String(args[1]);
    return to.endsWith('.json') && nfs.existsSync(to) ? Option.some(to) : Option.none();
  }
  if (!WRITING.has(name)) return Option.none();
  const to = String(args[0]);
  const flag = (args[2] as { flag?: string } | undefined)?.flag ?? 'w';
  return to.endsWith('.json') && !flag.includes('x') && nfs.existsSync(to)
    ? Option.some(to)
    : Option.none();
};

type Method = (...args: Array<unknown>) => unknown;

const fsFor = (c: Ctx): FileSystem.FileSystem =>
  new Proxy(platformFs, {
    get(target, name) {
      const value: unknown = Reflect.get(target, name);
      if (typeof value !== 'function' || typeof name !== 'string') return value;
      if (['sink', 'stream', 'watch', 'readLink'].includes(name)) return value;
      return (...args: Array<unknown>) => {
        const path = String(name === 'symlink' ? args[1] : args[0]);
        return host(
          c,
          { kind: 'fs', name, path },
          () => {
            Option.map(replaces(name, args), (to) =>
              violate(c.w, 'exclusive', `${c.id} ${name} replaces ${to}`),
            );
            const result = Reflect.apply(value as Method, target, args) as Effect.Effect<
              unknown,
              PlatformError.PlatformError
            >;
            if (name !== 'readFileString' || !path.endsWith('/session.json')) return result;
            return Effect.tap(
              result as Effect.Effect<string, PlatformError.PlatformError>,
              (text) =>
                Effect.sync(() => {
                  try {
                    c.read.add(JSON.parse(text).serverPid);
                  } catch {}
                }),
            );
          },
          () =>
            PlatformError.systemError({
              _tag: 'PermissionDenied',
              module: 'FileSystem',
              method: name,
              description: 'injected fault',
            }),
        );
      };
    },
  });

const signalled = (c: Ctx, pid: number) => {
  const w = c.w;
  const before = c.events.at(-1);
  const target = holder(w, pid);
  c.events.push({ type: 'signal', pid });
  w.signals += 1;
  if (!Number.isInteger(pid) || pid <= 1) violate(w, 'authority', `${c.id} signals pid ${pid}`);
  if (target === undefined)
    violate(w, 'authority', `${c.id} signals ${pid}, which no process holds`);
  else if (target.kind !== 'server' || target.state !== c.cmd.s)
    violate(w, 'authority', `${c.id} signals ${pid}, a ${target.kind} process`);
  else {
    if (!c.spawned.includes(target) && !c.read.has(target.pid))
      violate(w, 'authority', `${c.id} signals ${pid}, which it neither spawned nor read`);
    for (const other of target.signalledBy) {
      const running = w.running.get(other);
      if (other !== c.serial && running !== undefined && !running.dead)
        violate(
          w,
          'exclusive',
          `${c.id} signals ${pid} while ${running.id}, which signalled it, runs`,
        );
    }
    target.signalledBy.push(c.serial);
  }
  const reread = before?.type === 'read' && before.pid === pid && before.found === target?.n;
  if (!reread) violate(w, 'reread', `${c.id} signals ${pid} with no start-time read just before`);
  if (target === undefined) return false;
  target.alive = false;
  return true;
};

const osFor = (c: Ctx): OsMembers => {
  const call = (name: string): Call => ({ kind: 'os', name, path: '' });
  const failure = (tool: string) => () =>
    ToolFailed.make({ tool, args: [], exitCode: 1, output: 'injected fault' });
  return {
    spawn: (argv) =>
      host(
        c,
        call('spawn'),
        () =>
          Effect.sync(() => {
            const at = argv.indexOf('--port');
            const p = newProc(c.w, {
              kind: 'server',
              state: c.cmd.s,
              port: Number(argv[at + 1]),
              boot: c.serial,
            });
            c.spawned.push(p);
            return { pid: p.pid, started: p.start };
          }),
        failure('/bin/sh'),
      ),
    started: (pid) =>
      host(
        c,
        call('started'),
        () =>
          Effect.sync(() => {
            const p = holder(c.w, pid);
            c.events.push({ type: 'read', pid, found: p?.n });
            return Option.map(Option.fromUndefinedOr(p), (found) => found.start);
          }),
        failure('ps'),
      ),
    signal: (pid) =>
      host(c, call('signal'), () => Effect.sync(() => signalled(c, pid)), failure('kill')),
    self: host(
      c,
      call('self'),
      () => Effect.sync(() => ({ pid: c.self.pid, started: c.self.start })),
      failure('ps'),
    ),
  };
};

const DEVICES = JSON.stringify({
  devices: {
    'com.apple.CoreSimulator.SimRuntime.iOS-26-0': [
      { name: APP.simulator, udid: 'PROBE-UDID', state: 'Booted' },
    ],
  },
});

const toolAnswer = (c: Ctx, command: string, args: ReadonlyArray<string>) => {
  const base = command.split('/').at(-1) ?? command;
  if (base === 'kill' || (base === 'ps' && args.includes('lstart='))) {
    violate(c.w, 'seam', `${c.id} ran ${base} ${args.join(' ')} around the Os seam`);
    return { exitCode: 1, stdout: '' };
  }
  if (base === 'xcrun' && args.join(' ') === 'simctl list devices -j')
    return { exitCode: 0, stdout: DEVICES };
  if (base === 'agent-device' && args[0] === 'wait' && args[1] === APP.openPrompt)
    return { exitCode: 1, stdout: '' };
  if (base === 'lsof') {
    const port = Number((args.find((a) => a.startsWith('-iTCP:')) ?? '').slice('-iTCP:'.length));
    const held = c.w.procs.filter((p) => p.alive && p.port === port).map((p) => p.pid);
    return { exitCode: held.length > 0 ? 0 : 1, stdout: held.map((pid) => `${pid}\n`).join('') };
  }
  return { exitCode: 0, stdout: '' };
};

const handle = (answer: { readonly exitCode: number; readonly stdout: string }) => {
  const stdout = Stream.encodeText(Stream.make(answer.stdout));
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(4_099_998),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(answer.exitCode)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    stdin: Sink.drain,
    stdout,
    stderr: Stream.empty,
    all: stdout,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
    unref: Effect.succeed(Effect.void),
  });
};

const spawnerFor = (c: Ctx) =>
  ChildProcessSpawner.make((command) => {
    const name = command._tag === 'StandardCommand' ? command.command : 'piped';
    const args = command._tag === 'StandardCommand' ? command.args.map(String) : [];
    return host(
      c,
      { kind: 'tool', name, path: args.join(' ') },
      () => Effect.sync(() => handle(toolAnswer(c, name, args))),
      () =>
        PlatformError.systemError({
          _tag: 'PermissionDenied',
          module: 'ChildProcess',
          method: 'spawn',
          description: 'injected fault',
        }),
    );
  });

const httpFor = (c: Ctx) =>
  HttpClient.make((request, url) =>
    host(
      c,
      { kind: 'http', name: 'get', path: String(url) },
      () => {
        const up = c.w.procs.some(
          (p) => p.alive && p.kind === 'server' && p.port === Number(url.port),
        );
        return Effect.succeed(
          HttpClientResponse.fromWeb(request, new Response('', { status: up ? 200 : 503 })),
        );
      },
      () =>
        new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({ request, description: 'injected fault' }),
        }),
    ),
  );

const quiet: Console.Console = { ...globalThis.console, log: () => {}, error: () => {} };

/** How much shorter every sleep of a command is than its real one (waits, retries, time limits). */
const SPEED = 20;

/** The commands' clock: real time, every sleep `SPEED` times shorter. */
const fast = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  Effect.clockWith((real) => {
    const clock: Clock.Clock = {
      currentTimeMillisUnsafe: () => real.currentTimeMillisUnsafe(),
      currentTimeMillis: real.currentTimeMillis,
      currentTimeNanosUnsafe: () => real.currentTimeNanosUnsafe(),
      currentTimeNanos: real.currentTimeNanos,
      monotonicTimeNanosUnsafe: () => real.monotonicTimeNanosUnsafe(),
      monotonicTimeNanos: real.monotonicTimeNanos,
      sleep: (duration) => real.sleep(Duration.millis(Duration.toMillis(duration) / SPEED)),
    };
    return Effect.provideService(program, Clock.Clock, clock);
  });

/**
 * The `--timeout` every boot and driver step is given, in seconds: 10, or
 * half a second of real time at `SPEED`, so a loaded host's slow scratch
 * filesystem does not run out a readiness wait or a tool's time limit that a
 * quiet one meets.
 */
const TIMEOUT = '10';

const argsOf = (w: World, cmd: Cmd) => {
  const state = w.states[cmd.s];
  if (cmd.kind === 'boot')
    return [
      'boot',
      '--platform',
      cmd.platform ?? 'ios',
      '--port',
      String(cmd.port ?? 8270),
      '--timeout',
      TIMEOUT,
      ...(cmd.out === undefined ? [] : ['--out', cmd.out]),
      '--state',
      state,
    ];
  if (cmd.kind === 'down') return ['down', '--state', state];
  if (cmd.kind === 'clean') return ['down', '--clean', '--state', state];
  return ['tap', 'id=probe', '--timeout', TIMEOUT, '--state', state];
};

/** The tag of a failure's first error, or none. */
const tagOf = (cause: Cause.Cause<unknown>) => {
  const error = Cause.squash(cause) as { readonly _tag?: unknown } | undefined;
  return String(error?._tag ?? '');
};

/** Run one command as a process of its own, over a fresh `DriveLive`: how it ended. */
export const run = (w: World, cmd: Cmd, plan: Plan = {}): Promise<Ended> => {
  w.serial += 1;
  const serial = w.serial;
  const reuse = plan.pid !== undefined && holder(w, plan.pid) === undefined ? plan.pid : undefined;
  const self = newProc(w, { kind: 'command', pid: reuse });
  let send = () => {};
  const c: Ctx = {
    w,
    serial,
    id: `#${serial}:${cmd.kind}${cmd.platform === undefined ? '' : `-${cmd.platform}`}@${cmd.s}`,
    cmd,
    self,
    plan,
    events: [],
    spawned: [],
    read: new Set(),
    counts: new Map(),
    calls: 0,
    faulted: false,
    afterFault: 0,
    secondHit: false,
    paused: false,
    dead: false,
    interruptAsked: false,
    sent: new Promise<void>((resolve) => {
      send = resolve;
    }),
    reached: () => {},
    settle: () => {},
  };
  w.running.set(serial, c);
  const os = osFor(c);
  const place: Place = {
    app: w.app,
    state: w.states[cmd.s],
    script: w.script,
    features: w.features,
    warm: [],
    config: APP,
  };
  const services = Layer.mergeAll(
    Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawnerFor(c)),
    Layer.succeed(HttpClient.HttpClient, httpFor(c)),
    Layer.succeed(FileSystem.FileSystem, fsFor(c)),
    Layer.succeed(Os, os),
  );
  const program = runSim(place, argsOf(w, cmd)).pipe(
    Effect.provideService(Os, os),
    Effect.provide(Layer.provideMerge(DriveLive, services)),
    Effect.provideService(Console.Console, quiet),
    Effect.provide(BunServices.layer),
    fast,
  );
  return new Promise((resolve) => {
    let settled = false;
    let tag = '';
    c.settle = (outcome) => {
      if (settled) return;
      settled = true;
      w.running.delete(serial);
      resolve({ outcome, calls: c.calls, faulted: c.faulted, second: c.secondHit, tag });
    };
    let fiber: Fiber.Fiber<unknown, unknown> | undefined;
    c.reached = () =>
      setTimeout(() => {
        if (fiber !== undefined) Effect.runFork(Fiber.interrupt(fiber));
        setTimeout(send, 0);
      }, 0);
    fiber = Effect.runFork(program);
    fiber.addObserver((exit) => {
      if (c.dead) return;
      self.alive = false;
      for (const p of c.spawned) p.window = false;
      if (Exit.isSuccess(exit)) return c.settle('ok');
      if (Cause.hasDies(exit.cause)) {
        violate(w, 'untyped', `${c.id}: ${String(Cause.squash(exit.cause)).slice(0, 200)}`);
        return c.settle('fail');
      }
      if (Cause.hasInterrupts(exit.cause)) {
        if (!c.interruptAsked) violate(w, 'untyped', `${c.id}: interrupted unasked`);
        return c.settle('interrupted');
      }
      tag = tagOf(exit.cause);
      return c.settle('fail');
    });
  });
};

/** One command alone, judged against the reference model when no fault or pause was reached; then the records judged. */
export const step = async (w: World, cmd: Cmd, plan: Plan = {}) => {
  const before = phase(w, cmd.s);
  const broken = homeBroken(w, cmd.s);
  const port = cmd.port ?? 8270;
  const taken = w.procs.some((p) => p.alive && p.kind === 'server' && p.port === port);
  const ended = await run(w, cmd, plan);
  const disturbed = ended.faulted || plan.pause !== undefined;
  if (!disturbed)
    Option.map(predict(cmd, before, broken, taken), ([outcome, after]) => {
      const now = phase(w, cmd.s);
      if (ended.outcome !== outcome || now !== after)
        violate(
          w,
          'model',
          `#${w.serial} ${cmd.kind}@${cmd.s} from ${before}: got ${ended.outcome} (${ended.tag}) -> ${now}, the model says ${outcome} -> ${after}`,
        );
    });
  checkFound(w, 'orphan', `after #${w.serial}`);
  return ended;
};

/** Two commands at once; at most one of two boots or two downs of one state is ok; then the records judged. */
export const pair = async (w: World, x: Cmd, y: Cmd) => {
  const ended = await Promise.all([run(w, x), run(w, y)]);
  const both = ended.every((one) => one.outcome === 'ok');
  if (both && x.s === y.s && x.kind === y.kind && (x.kind === 'boot' || x.kind === 'down'))
    violate(w, 'model', `two overlapping ${x.kind}s of state ${x.s} both ended ok`);
  checkFound(w, 'orphan', `after the pair ending #${w.serial}`);
  return ended;
};

/** The server a state's record names dies. */
export const crash = (w: World, s: StateKey) => {
  const p = recorded(w, s);
  if (p === undefined) return false;
  p.alive = false;
  return true;
};

/** A foreign process takes the pid of a dead server or command. */
export const reuse = (w: World) => {
  const dead = w.procs.filter(
    (p) => !p.alive && p.kind !== 'foreign' && holder(w, p.pid) === undefined,
  );
  const p = dead[Math.floor(w.rand() * dead.length)];
  if (p === undefined) return false;
  newProc(w, { kind: 'foreign', pid: p.pid });
  return true;
};

/** A legacy session (an older sim's: no start time) of a live foreign process in state `s`. */
export const legacy = (w: World, s: StateKey) => {
  const p = newProc(w, { kind: 'foreign' });
  write(
    `${w.states[s]}/session.json`,
    JSON.stringify({
      platform: 'ios',
      out: `${w.states[s]}/legacy-out`,
      port: 8277,
      serverPid: p.pid,
      udid: 'PROBE-UDID',
      bootedAt: '2026-11-03T12:00:00.000Z',
    }),
  );
  return p;
};

/**
 * Down each state until its record is gone (twice at most), then boot and
 * down it once more on a port of its own: what is left is a leak, and a
 * state its last commands could not hold or clear is stuck.
 */
export const converge = async (w: World) => {
  for (const s of ['a', 'b'] as const) {
    for (let tries = 0; tries < 2 && phase(w, s) !== 'none'; tries += 1)
      await step(w, { kind: 'down', s });
    if (phase(w, s) !== 'none') violate(w, 'stuck', `state ${s}: its record outlives two downs`);
    const booted = await step(w, { kind: 'boot', s, platform: 'ios', port: 8279 });
    const downed = await step(w, { kind: 'down', s });
    if (booted.outcome !== 'ok' || downed.outcome !== 'ok')
      violate(
        w,
        'stuck',
        `state ${s}: a fresh boot and down ended ${booted.outcome} and ${downed.outcome}`,
      );
  }
  for (const p of live(w))
    violate(w, 'leak', `server ${p.pid} of state ${p.state} (boot #${p.boot}) outlives the downs`);
};

/** The n-th call `pick` answers true for. */
export const nth = (pick: (call: Call) => boolean, n: number): At => ({ pick, n });
export const isFileMutation = (call: Call) =>
  call.kind === 'fs' &&
  ['rename', 'link', 'symlink', 'remove', 'writeFile', 'writeFileString'].includes(call.name);
export const isSessionRead = (call: Call) =>
  call.kind === 'fs' && call.name === 'readFileString' && call.path.endsWith('/session.json');
export const isTool = (tool: string, word: string) => (call: Call) =>
  call.kind === 'tool' && call.name.endsWith(tool) && call.path.includes(word);

export const boot = (
  s: StateKey,
  platform: 'ios' | 'web' = 'ios',
  port = 8270,
  out?: string,
): Cmd => ({
  kind: 'boot',
  s,
  platform,
  port,
  out,
});
export const down = (s: StateKey): Cmd => ({ kind: 'down', s });
export const clean = (s: StateKey): Cmd => ({ kind: 'clean', s });
export const tap = (s: StateKey): Cmd => ({ kind: 'tap', s });

/** A sweep's subject: the command faulted at every host call, after its setup. */
export interface Subject {
  readonly name: string;
  readonly setup: (w: World) => Promise<unknown>;
  readonly cmd: Cmd;
}

const after = (setup: (w: World) => Promise<unknown>) => setup;

export const SUBJECTS: ReadonlyArray<Subject> = [
  { name: 'boot ios', setup: async () => {}, cmd: boot('a', 'ios') },
  { name: 'boot web', setup: async () => {}, cmd: boot('a', 'web') },
  {
    name: 'boot over a stale session',
    setup: after(async (w) => {
      await step(w, boot('a', 'web'));
      crash(w, 'a');
    }),
    cmd: boot('a', 'web', 8271),
  },
  { name: 'down ios', setup: (w) => step(w, boot('a', 'ios')), cmd: down('a') },
  { name: 'down web, long state', setup: (w) => step(w, boot('b', 'web')), cmd: down('b') },
  {
    name: 'down over a dead holder',
    setup: after(async (w) => {
      await step(w, boot('a', 'web'));
      await step(w, down('a'), { fault: { at: nth(isFileMutation, 1), how: 'exit' } });
    }),
    cmd: down('a'),
  },
  { name: 'down --clean', setup: (w) => step(w, boot('a', 'ios')), cmd: clean('a') },
  { name: 'tap', setup: (w) => step(w, boot('a', 'web')), cmd: tap('a') },
];

/** One sweep world: `subject` after its setup, `how` at its host call `k`, then convergence. */
export const sweepWorld = async (parent: string, subject: Subject, how: How, k: number) => {
  const w = world(parent, k);
  await subject.setup(w);
  const ended = await step(w, subject.cmd, { fault: { at: k, how } });
  await converge(w);
  return { violations: w.violations, reached: ended.faulted, signals: w.signals };
};

/**
 * A part of a subject's sweep: `how` at its host calls `from` to `to`
 * (inclusive), stopping once a fault lands past its last call; every
 * world's violations, how many worlds reached their fault, and whether the
 * sweep ran past the subject's last call.
 */
export const sweep = async (
  parent: string,
  subject: Subject,
  how: How,
  from: number,
  to: number,
) => {
  const violations: Array<string> = [];
  let worlds = 0;
  let ended = false;
  for (let k = from; k <= to && !ended; k += 1) {
    const one = await sweepWorld(parent, subject, how, k);
    ended = !one.reached;
    if (one.reached) worlds += 1;
    violations.push(...one.violations.map((line) => `[${subject.name}, ${how} at ${k}] ${line}`));
  }
  return { violations, worlds, ended };
};

/**
 * A recovery sweep: `first` at the subject's host call `k`, then `second`
 * at each call of its recovery, until the second lands past it.
 */
export const recoverySweep = async (
  parent: string,
  subject: Subject,
  first: 'fail' | 'interrupt',
  k: number,
  second: 'fail' | 'exit',
  limit = 60,
) => {
  const violations: Array<string> = [];
  let worlds = 0;
  for (let j = 1; j <= limit; j += 1) {
    const w = world(parent, k * 100 + j);
    await subject.setup(w);
    const ended = await step(w, subject.cmd, {
      fault: { at: k, how: first },
      second: { at: j, how: second },
    });
    const hit = ended.second;
    await converge(w);
    worlds += 1;
    violations.push(
      ...w.violations.map(
        (line) => `[${subject.name}, ${first} at ${k}, ${second} at recovery ${j}] ${line}`,
      ),
    );
    if (!hit) break;
  }
  return { violations, worlds };
};

/** A pause at host call `k` of `subject` for `newer`, a command on the same state run to its end there. */
export const pauseWorld = async (parent: string, subject: Subject, newer: Cmd, k: number) => {
  const w = world(parent, 1000 + k);
  await subject.setup(w);
  const ended = await run(w, subject.cmd, { pause: { at: k, run: () => run(w, newer) } });
  checkFound(w, 'orphan', `after the pause at ${k}`);
  await converge(w);
  return { violations: w.violations, reached: ended.calls >= k };
};

/** A generated sequence of 6-11 steps: commands, faults, overlaps, crashes and pid reuse, then convergence. */
export const generated = async (parent: string, seed: number) => {
  const w = world(parent, seed);
  const steps = 6 + Math.floor(w.rand() * 6);
  for (let i = 0; i < steps; i += 1) {
    const r = w.rand();
    const s: StateKey = w.rand() < 0.7 ? 'a' : 'b';
    const platform = w.rand() < 0.5 ? 'ios' : 'web';
    const port = w.rand() < 0.7 ? 8270 : 8271;
    const pick = (): Cmd => {
      const q = w.rand();
      if (q < 0.4) return boot(s, platform, port);
      if (q < 0.75) return down(s);
      if (q < 0.85) return clean(s);
      return tap(s);
    };
    if (r < 0.25) await step(w, pick());
    else if (r < 0.6) {
      const how = (['fail', 'interrupt', 'exit'] as const)[Math.floor(w.rand() * 3)] ?? 'fail';
      const at = 1 + Math.floor(w.rand() * 40);
      const plan: Plan =
        w.rand() < 0.3
          ? {
              fault: { at, how },
              pause: { at: 1 + Math.floor(w.rand() * 40), run: () => run(w, pick()) },
            }
          : { fault: { at, how } };
      await step(w, pick(), plan);
    } else if (r < 0.75) await pair(w, pick(), pick());
    else if (r < 0.85) crash(w, s);
    else reuse(w);
  }
  await converge(w);
  return w.violations.map((line) => `[seed ${seed}] ${line}`);
};
