/**
 * The tools `sim.ts` drives (xcrun, agent-device, agent-browser, xcodebuild),
 * each run to completion through the platform's ChildProcessSpawner, and the
 * readiness wait every start uses.
 */
import { Context, Duration, Effect, Option, Stream } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { type Escaped, hostError, ReadinessTimedOut, ToolFailed, ToolMissing } from './errors.ts';

interface Finished {
  readonly exitCode: number;
  readonly output: string;
}

const text = (stream: Stream.Stream<Uint8Array, PlatformError>) =>
  Stream.mkString(Stream.decodeText(stream));

const isNotFound = (error: PlatformError) =>
  error.reason._tag === 'NotFound' && error.reason.module === 'ChildProcess';

/** Variables a tool's environment takes over the caller's; one set to `undefined` is removed. */
export type Vars = Readonly<Record<string, string | undefined>>; // oxlint-disable-line effect/noNullish -- ChildProcess's extendEnv removes a variable set to undefined from the child's environment

/** `names` removed from a tool's environment. */
export const removed = (names: ReadonlyArray<string>): Vars =>
  // oxlint-disable-next-line effect/noNullish -- ChildProcess's extendEnv removes a variable set to undefined from the child's environment
  Object.fromEntries(names.map((name) => [name, undefined]));

/** Where a tool runs: its working folder, and variables over the caller's environment. */
interface Launch {
  readonly cwd?: string;
  readonly env?: Vars;
}

/** The drivers, which keep their state under HOME: only they run in a drive's child environment. */
const DRIVERS: ReadonlySet<string> = new Set(['agent-device', 'agent-browser']);

/**
 * The environment the drivers run in for the running step (`drive.ts`
 * `driverEnv`): a booted drive's child HOME and socket folder, or none, so
 * they keep the caller's (a legacy session, whose agent sessions live there).
 */
export const DriverEnv = Context.Reference<Option.Option<Vars>>('@manna/sim/DriverEnv', {
  defaultValue: () => Option.none(),
});

/** The variables `tool` runs with over the caller's: the launch's, and the drive's child ones for a driver. */
const envOf = Effect.fnUntraced(function* (tool: string, options: Launch) {
  const drivers = yield* DriverEnv;
  const vars = {
    ...options.env,
    ...Option.getOrElse(
      Option.filter(drivers, () => DRIVERS.has(tool)),
      () => ({}),
    ),
  } satisfies Vars;
  return Option.liftPredicate(vars, (all) => Object.keys(all).length > 0);
});

/**
 * Run `tool` to its end, or for at most `limit`: its exit code and what it
 * printed (stdout, then stderr). A tool still running at `limit` is killed
 * as its scope closes and fails as `ToolFailed` with exit code -1. It runs
 * in `options.cwd`, with `options.env` over the caller's environment, and a
 * driver with the running step's `DriverEnv` over that.
 *
 * The tool runs in this process's group (`detached: false`): the spawner
 * then leaves alone what the tool started to outlive it (the drivers'
 * daemons, `serve`), where it would end a detached tool's whole group.
 */
export const attempt = Effect.fn('Sim.attempt')(function* (
  tool: string,
  args: ReadonlyArray<string>,
  limit: Duration.Duration,
  options: Launch = {},
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const env = yield* envOf(tool, options);
  const run = Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make(tool, [...args], {
          detached: false,
          forceKillAfter: '3 seconds',
          cwd: options.cwd,
          ...Option.match(env, {
            onNone: () => ({}),
            onSome: (vars) => ({ env: vars, extendEnv: true }),
          }),
        }),
      );
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [text(handle.stdout), text(handle.stderr), handle.exitCode],
        { concurrency: 3 },
      );
      const finished: Finished = { exitCode, output: `${stdout}${stderr}` };
      return finished;
    }),
  );
  return yield* run.pipe(
    Effect.mapError(toolError(tool, args)),
    Effect.timeoutOrElse({
      duration: limit,
      orElse: () => Effect.fail(overrun(tool, args, limit)),
    }),
  );
});

/** A platform failure of running `tool`, as the drive reports it. */
const toolError =
  (tool: string, args: ReadonlyArray<string>) =>
  (error: PlatformError): ToolMissing | ToolFailed | Escaped => {
    if (isNotFound(error)) return ToolMissing.make({ tool });
    const host = hostError(error);
    if (host._tag === 'Escaped') return host;
    return ToolFailed.make({ tool, args: [...args], exitCode: -1, output: error.message });
  };

const overrun = (tool: string, args: ReadonlyArray<string>, limit: Duration.Duration) =>
  ToolFailed.make({
    tool,
    args: [...args],
    exitCode: -1,
    output: `still running after ${Duration.toSeconds(limit)} s`,
  });

const encoder = new TextEncoder();

/**
 * Run `tool` for one exchange: read the first line it prints (none when it
 * ends its output first), within `limit`; `reply` judges it and gives the
 * answer, which is written to the tool's stdin, closing it. Once the line is
 * read, the judging and the answer run uninterruptibly. On every other way
 * out (a failure of `reply`, the spawner or the read, the limit, an
 * interruption) the tool's stdin is closed unanswered, so a tool that waits
 * for its answer sees its input end. What `reply` decided.
 *
 * An interruption that arrives after the answer is written lands on the
 * caller, so a caller that must keep what the answer let happen runs this
 * uninterruptibly.
 */
export const exchange = <A, E>(
  tool: string,
  args: ReadonlyArray<string>,
  limit: Duration.Duration,
  options: Launch,
  reply: (line: Option.Option<string>) => Effect.Effect<readonly [answer: string, value: A], E>,
) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const env = yield* envOf(tool, options);
    const failed = toolError(tool, args);
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const handle = yield* spawner
          .spawn(
            ChildProcess.make(tool, [...args], {
              detached: false,
              cwd: options.cwd,
              ...Option.match(env, {
                onNone: () => ({}),
                onSome: (vars) => ({ env: vars, extendEnv: true }),
              }),
            }),
          )
          .pipe(Effect.mapError(failed));
        const unanswered = Effect.ignore(Stream.run(Stream.empty, handle.stdin));
        return yield* Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const line = yield* restore(
              Stream.runHead(Stream.splitLines(Stream.decodeText(handle.stdout))).pipe(
                Effect.mapError(failed),
                Effect.timeoutOrElse({
                  duration: limit,
                  orElse: () => Effect.fail(overrun(tool, args, limit)),
                }),
              ),
            );
            const [answer, value] = yield* reply(line);
            yield* Stream.run(Stream.make(encoder.encode(answer)), handle.stdin).pipe(
              Effect.mapError(failed),
            );
            return value;
          }).pipe(Effect.onError(() => unanswered)),
        );
      }),
    );
  });

/** `attempt`, where only exit 0 succeeds: it answers what the tool printed. */
export const succeed = Effect.fn('Sim.succeed')(function* (
  tool: string,
  args: ReadonlyArray<string>,
  limit: Duration.Duration,
  options: Launch = {},
) {
  const finished = yield* attempt(tool, args, limit, options);
  if (finished.exitCode !== 0)
    return yield* ToolFailed.make({
      tool,
      args: [...args],
      exitCode: finished.exitCode,
      output: finished.output.trim().slice(-2000),
    });
  return finished.output;
});

/**
 * Retry `check` every half second until it succeeds; past `seconds` the
 * wait fails as `ReadinessTimedOut`, naming `what`.
 */
export const ready = <A, E, R>(what: string, seconds: number, check: Effect.Effect<A, E, R>) =>
  check.pipe(
    Effect.tapError(() => Effect.sleep('500 millis')),
    Effect.eventually,
    Effect.timeoutOrElse({
      duration: Duration.seconds(seconds),
      orElse: () => Effect.fail(ReadinessTimedOut.make({ what, seconds })),
    }),
  );
