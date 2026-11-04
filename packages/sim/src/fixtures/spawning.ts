/**
 * The live `Os.spawn` (`os.ts`) under `boot` and `down`, over a model host:
 * a stand-in spawner that plays the processes the start makes, a real
 * scratch state folder, and a stand-in dev server that answers while a
 * model server runs. Nothing executes; model pids lie above 4,000,000.
 *
 * The model plays both starts a drive has used: the start that prints the
 * new process's pid and leaves its start time to a `ps` of its own, and the
 * one that makes the child print its identity and wait for `go` on the
 * start's stdin before it becomes the server (ending itself on any other
 * answer, or when the input ends). A fault lands at one step of the start:
 * a typed failure there, or an interruption of the command sent there.
 *
 * The invariant (`Seen`): after the `boot`, every model process that runs
 * is named by pid and start time in `<state>/session.json`; after the
 * `down` that follows, none runs; and every signal names a process the
 * model started, while it ran.
 */
import * as BunServices from '@effect/platform-bun/BunServices';
import {
  Array as Arr,
  Cause,
  Console,
  Deferred,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Predicate,
  Schema,
  Sink,
  Stream,
} from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/http';
import * as PlatformError from 'effect/PlatformError';
import { ChildProcessSpawner } from 'effect/process';

import { runSim } from '../command.ts';
import { DriveLive, type Place } from '../drive.ts';
import { APP } from './contain.ts';
import { dispose, scratch, world } from './life.ts';

/** The steps of one start, in order. */
export const STEPS = ['spawn', 'read', 'print', 'output', 'answer', 'become'] as const;

/**
 * Where a fault lands in one start:
 * - `spawn`: the spawner's start of the start tool;
 * - `read`: the read of the new process's start time (the child's own, or
 *   the drive's `ps` of it);
 * - `print`: the line that names the new process;
 * - `output`: the drive's read of the start's output, failing before it
 *   has that line, while the child waits;
 * - `answer`: the drive's `go` on the start's stdin;
 * - `become`: the child becoming the server (its `exec`).
 */
export type Step = (typeof STEPS)[number];

export interface Fault {
  readonly step: Step;
  readonly how: 'fail' | 'interrupt';
}

const PORT = 8270;
const SERVER = 4_000_242;
const STARTED = 'Wed Nov 4 06:00:00 2026';
/** The start time `ps` reads for any pid the model did not start: the command's own. */
const OTHER = 'Wed Nov 4 05:00:00 2026';

type Phase = 'starting' | 'waiting' | 'server' | 'ended';

interface Proc {
  readonly pid: number;
  readonly started: string;
  phase: Phase;
}

interface Model {
  readonly fault: Option.Option<Fault>;
  readonly procs: Array<Proc>;
  readonly kills: Array<string>;
  reached: boolean;
  /** The pid-printing start ran, and the drive has not yet read its process's start time. */
  unread: boolean;
  /** Completed where an interruption of the command is sent. */
  readonly interrupt: Deferred.Deferred<void>;
}

const failure = (method: string) =>
  PlatformError.systemError({
    _tag: 'Unknown',
    module: 'ChildProcess',
    method,
    pathOrDescriptor: 'model fault',
  });

/** Whether the fault fails `step`, noting that the step was reached; an interruption is sent there. */
const at = (m: Model, step: Step, how: Fault['how']) =>
  Option.match(
    Option.filter(m.fault, (fault) => fault.step === step),
    {
      onNone: () => false,
      onSome: (fault) => {
        m.reached = true;
        if (fault.how === 'interrupt') Deferred.doneUnsafe(m.interrupt, Effect.void);
        return fault.how === how;
      },
    },
  );

const running = (p: Proc) => p.phase !== 'ended';

/** The running model process at `pid`. */
const runningAt = (m: Model, pid: number) =>
  Arr.findFirst(m.procs, (p) => p.pid === pid && running(p));

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const handle = (
  stdout: Stream.Stream<Uint8Array, PlatformError.PlatformError>,
  exitCode: Effect.Effect<number, PlatformError.PlatformError>,
  stdin: Sink.Sink<void, Uint8Array, never, PlatformError.PlatformError> = Sink.drain,
) =>
  ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(4_000_001),
    exitCode: Effect.map(exitCode, ChildProcessSpawner.ExitCode),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    stdin,
    stdout,
    stderr: Stream.empty,
    all: stdout,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
    unref: Effect.succeed(Effect.void),
  });

const answer = (code: number, text = '') =>
  Effect.succeed(handle(Stream.make(encoder.encode(text)), Effect.succeed(code)));

/** The start that makes the child print its identity and wait for `go` before it becomes the server. */
const handshake = (m: Model) =>
  Effect.gen(function* () {
    const child: Proc = { pid: SERVER, started: STARTED, phase: 'starting' };
    m.procs.push(child);
    const decided = Deferred.makeUnsafe<void>();
    const end = (phase: Phase) => {
      if (child.phase === 'starting' || child.phase === 'waiting') child.phase = phase;
      Deferred.doneUnsafe(decided, Effect.void);
    };
    yield* Effect.addFinalizer(() => Effect.sync(() => end('ended')));
    if (at(m, 'read', 'fail') || at(m, 'print', 'fail')) {
      end('ended');
      return handle(Stream.empty, Effect.succeed(0));
    }
    child.phase = 'waiting';
    const printed: Stream.Stream<Uint8Array, PlatformError.PlatformError> = Stream.concat(
      Stream.make(encoder.encode(`${child.pid} ${child.started}\n`)),
      Stream.drain(Stream.fromEffect(Deferred.await(decided))),
    );
    const output = Option.match(
      Option.liftPredicate(failure('stdout'), () => at(m, 'output', 'fail')),
      { onNone: () => printed, onSome: (error) => Stream.fail(error) },
    );
    const input: Array<number> = [];
    const heard = () => {
      if (decoder.decode(new Uint8Array(input)) !== 'go\n') return end('ended');
      if (at(m, 'become', 'fail')) return end('ended');
      return end('server');
    };
    const stdin: Sink.Sink<void, Uint8Array, never, PlatformError.PlatformError> = Sink.unwrap(
      Effect.sync(() => {
        if (at(m, 'answer', 'fail')) return Sink.fail(failure('stdin'));
        return Sink.mapEffect(
          Sink.forEach((chunk: Uint8Array) => Effect.sync(() => input.push(...chunk))),
          () => Effect.sync(heard),
        );
      }),
    );
    return handle(output, Effect.as(Deferred.await(decided), 0), stdin);
  });

/** The start that prints the new process's pid, its start time left to a `ps` of the drive's. */
const background = (m: Model) => {
  m.procs.push({ pid: SERVER, started: STARTED, phase: 'server' });
  m.unread = true;
  if (at(m, 'print', 'fail'))
    return Effect.succeed(handle(Stream.fail(failure('stdout')), Effect.succeed(0)));
  return answer(0, `${SERVER}\n`);
};

/** `ps -o lstart= -p <pid>`: the model process's start time, none past 4,000,000, else the command's own. */
const startRead = (m: Model, pid: number) => {
  if (pid === SERVER && m.unread) {
    m.unread = false;
    if (at(m, 'read', 'fail')) return answer(2);
  }
  return Option.match(runningAt(m, pid), {
    onSome: (proc) => answer(0, `${proc.started}\n`),
    onNone: () => {
      if (pid >= 4_000_000) return answer(1);
      return answer(0, `${OTHER}\n`);
    },
  });
};

/** `kill -s <signal> <pid>`: the model process at `pid` ends; a signal that finds none is a stray. */
const signal = (m: Model, args: ReadonlyArray<string>) => {
  const target = runningAt(m, Number(args.at(-1)));
  m.kills.push(
    Option.match(target, {
      onSome: () => args.join(' '),
      onNone: () => `${args.join(' ')} (no model process)`,
    }),
  );
  return Option.match(target, {
    onSome: (proc) => {
      proc.phase = 'ended';
      return answer(0);
    },
    onNone: () => answer(1),
  });
};

const spawnerFor = (m: Model) =>
  ChildProcessSpawner.make((command) =>
    Effect.suspend(() => {
      if (command._tag !== 'StandardCommand') return answer(0);
      const args = command.args.map(String);
      const name = command.command;
      if (name === '/bin/sh' && (args[1] ?? '').includes('nohup')) {
        if (at(m, 'spawn', 'fail')) return Effect.fail(failure('spawn'));
        if (args.some((arg) => arg.includes('read -r go'))) return handshake(m);
        return background(m);
      }
      if (name === 'ps' && args.includes('lstart=')) return startRead(m, Number(args.at(-1)));
      if (name === 'kill') return signal(m, args);
      return answer(0);
    }),
  );

const httpFor = (m: Model) =>
  HttpClient.make((request) =>
    Effect.sync(() => {
      const status = Option.match(
        Arr.findFirst(m.procs, (p) => p.phase === 'server'),
        { onNone: () => 503, onSome: () => 200 },
      );
      return HttpClientResponse.fromWeb(request, new Response('', { status }));
    }),
  );

const quiet: Console.Console = { ...globalThis.console, log: () => {}, error: () => {} };

/** How a command ended: ok, interrupted, `died: …`, or the tag it failed with. */
const endOf = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.match(exit, {
    onSuccess: () => 'ok',
    onFailure: (cause) => {
      if (Cause.hasInterrupts(cause)) return 'interrupted';
      if (Cause.hasDies(cause)) return `died: ${String(Cause.squash(cause)).slice(0, 160)}`;
      const error = Cause.squash(cause);
      if (Predicate.hasProperty(error, '_tag')) return String(error._tag);
      return 'failed';
    },
  });

export interface Seen {
  /** How the boot and the down ended. */
  readonly boot: string;
  readonly down: string;
  /** Whether the fault's step was reached. */
  readonly reached: boolean;
  /** Model processes running after the boot that its state's record does not name. */
  readonly unrecorded: ReadonlyArray<string>;
  /** Model processes running after the down. */
  readonly left: ReadonlyArray<string>;
  /** Signals that named no running model process. */
  readonly strays: ReadonlyArray<string>;
}

const Recorded = Schema.fromJsonString(
  Schema.Struct({ serverPid: Schema.Finite, serverStarted: Schema.optional(Schema.String) }),
);

/** The server `<state>/session.json` names, if a record is there. */
const recorded = (state: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs.readFileString(`${state}/session.json`);
    return yield* Schema.decodeEffect(Recorded)(text);
  }).pipe(Effect.option);

const named = (record: Option.Option<typeof Recorded.Type>, p: Proc) =>
  Option.exists(
    record,
    (session) => session.serverPid === p.pid && session.serverStarted === p.started,
  );

const shown = (p: Proc) => `${p.pid} ${p.phase}`;

/** `boot --platform web` with `fault` at one step of its start, then `down`, over one model host. */
export const bootThenDown = (fault: Option.Option<Fault>) =>
  Effect.acquireUseRelease(
    Effect.sync(scratch),
    (parent) =>
      Effect.gen(function* () {
        const w = world(parent, 1);
        const m: Model = {
          fault,
          procs: [],
          kills: [],
          reached: false,
          unread: false,
          interrupt: Deferred.makeUnsafe<void>(),
        };
        const place: Place = {
          app: w.app,
          state: w.states.a,
          script: w.script,
          features: w.features,
          warm: [],
          config: APP,
        };
        const services = Layer.mergeAll(
          Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawnerFor(m)),
          Layer.succeed(HttpClient.HttpClient, httpFor(m)),
        );
        const command = (args: ReadonlyArray<string>) =>
          runSim(place, [...args, '--state', place.state]).pipe(
            Effect.provide(Layer.provideMerge(DriveLive, services)),
            Effect.provideService(Console.Console, quiet),
          );
        const booting = yield* Effect.forkChild(
          command(['boot', '--platform', 'web', '--port', String(PORT), '--timeout', '1']),
        );
        yield* Effect.forkChild(
          Effect.andThen(Deferred.await(m.interrupt), Fiber.interrupt(booting)),
        );
        const boot = yield* Fiber.await(booting);
        const record = yield* recorded(place.state);
        const unrecorded = m.procs
          .filter(running)
          .filter((p) => !named(record, p))
          .map(shown);
        const down = yield* Effect.exit(command(['down']));
        return {
          boot: endOf(boot),
          down: endOf(down),
          reached: m.reached,
          unrecorded,
          left: m.procs.filter(running).map(shown),
          strays: m.kills.filter((kill) => kill.endsWith('(no model process)')),
        } satisfies Seen;
      }),
    (parent) => Effect.sync(() => dispose(parent)),
  ).pipe(Effect.scoped, Effect.provide(BunServices.layer));
