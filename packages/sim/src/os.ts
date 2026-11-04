/**
 * The host's processes as the drive owns them: the `Os` seam, and the stop
 * rule over it. A process the drive starts is known by its pid and its start
 * time, both read at the start; the drive signals a pid only while the start
 * time read immediately before the signal is the recorded one, so a pid the
 * process left behind, and any process the drive did not start, is never
 * signalled. The live seam reaches `ps`, `kill` and the background start
 * only through the ChildProcessSpawner in scope, the contained host's in a
 * step (`host.ts`).
 */
import { Context, Duration, Effect, Option } from 'effect';
import type { ChildProcessSpawner } from 'effect/process';

import { ReadinessTimedOut, type Escaped, ToolFailed, type ToolMissing } from './errors.ts';
import { attempt, exchange, ready, type Vars } from './tools.ts';

/** A process: its pid and its start time, both read when the drive first saw it. */
export interface Identity {
  readonly pid: number;
  readonly started: string;
}

type Signal = 'SIGTERM' | 'SIGKILL';

type OsError = ToolFailed | ToolMissing | Escaped;
type Spawns = ChildProcessSpawner.ChildProcessSpawner;

/** What the drive asks of the host's processes. */
interface OsMembers {
  /** Start `argv` as a process of its own that outlives the command: its pid and start time. */
  readonly spawn: (
    argv: ReadonlyArray<string>,
    options: { readonly cwd: string; readonly env?: Vars },
  ) => Effect.Effect<Identity, OsError, Spawns>;
  /** The start time of the process that holds `pid` now, as a canonical string; none when no process holds it. */
  readonly started: (pid: number) => Effect.Effect<Option.Option<string>, OsError, Spawns>;
  /** Send `signal` to `pid`: whether a process received it. */
  readonly signal: (pid: number, signal: Signal) => Effect.Effect<boolean, OsError, Spawns>;
  /** The running command's own identity: its pid and its start time. */
  readonly self: Effect.Effect<Identity, OsError, Spawns>;
}

const short = Duration.seconds(30);

/** A pid the drive may name in a signal: an integer of 2 or more, never a group, a broadcast or init. */
export const signalable = (pid: number) => Number.isInteger(pid) && pid >= 2;

/**
 * `ps`'s start time in one form whatever the caller's time zone and locale:
 * `ps` prints it in the C locale in UTC, its runs of spaces made one.
 */
const CANONICAL: Vars = { LC_ALL: 'C', TZ: 'UTC' };

const startedLive = Effect.fn('Sim.Os.started')(function* (pid: number) {
  if (!Number.isInteger(pid) || pid < 1) return Option.none<string>();
  const args = ['-o', 'lstart=', '-p', String(pid)];
  const done = yield* attempt('ps', args, short, { env: CANONICAL });
  const text = done.output.trim().split(/\s+/).join(' ');
  if (done.exitCode === 1 && text === '') return Option.none<string>();
  if (done.exitCode !== 0 || text === '')
    return yield* ToolFailed.make({ tool: 'ps', args, exitCode: done.exitCode, output: text });
  return Option.some(text);
});

const NAMES: Record<Signal, string> = { SIGTERM: 'TERM', SIGKILL: 'KILL' };

const signalLive = Effect.fn('Sim.Os.signal')(function* (pid: number, signal: Signal) {
  if (!signalable(pid)) return false;
  const done = yield* attempt('kill', ['-s', NAMES[signal], String(pid)], short);
  return done.exitCode === 0;
});

/**
 * The start, run as `/bin/sh -c START BECOME argv…`. It starts `BECOME` in
 * the background, with no output of its own, and holds this command's
 * stdin open for it, passing on the one line it reads there (none when the
 * input ends first) and closing the pipe. The child alone holds this
 * command's stdout, so that output ends when the child prints its identity
 * and closes it, or when the child ends.
 */
const START = [
  'exec 4<&0 5>&1 >/dev/null 2>&1',
  `{ IFS= read -r go && printf '%s\\n' "$go"; } <&4 4<&- 5>&- | { exec 4<&- 6<&0; nohup /bin/sh -c "$0" "$@" <&6 6<&- 3>&5 5>&- & } &`,
  'exec 4<&- 5>&-',
  'wait',
].join('\n');

/**
 * The child: it reads its own start time, prints its pid and that time, and
 * becomes `argv` (the same process, so the same pid and start time) only
 * once it reads `go`; when the read fails, the line cannot be printed, or
 * any other answer or the end of input comes, it ends itself, so nothing
 * runs that this command does not know by its identity.
 */
const BECOME = [
  `started=$(LC_ALL=C TZ=UTC ps -o lstart= -p "$$") && [ -n "$started" ] || exit 3`,
  `printf '%s %s\\n' "$$" "$started" >&3 || exit 3`,
  'IFS= read -r go && [ "$go" = go ] || exit 3',
  'exec "$0" "$@" 3>&- </dev/null',
].join('\n');

/** The tool and arguments `spawn` runs to start `argv`. */
const startCommand = (argv: ReadonlyArray<string>) =>
  ['/bin/sh', '-c', START, BECOME, ...argv] as const;

/** The identity the child printed: its pid, and its start time in the canonical form (`startedLive`). */
const identified = (line: Option.Option<string>) => {
  const words = Option.getOrElse(line, () => '')
    .trim()
    .split(/\s+/);
  const [first = '', ...rest] = words;
  return Option.liftPredicate(
    { pid: Number(first), started: rest.join(' ') } satisfies Identity,
    (child) => /^\d+$/.test(first) && signalable(child.pid) && child.started !== '',
  );
};

/**
 * Start `argv` as a process of its own that outlives this command. The
 * child becomes `argv` only after its identity is read here and answered;
 * a typed failure or an interruption before the answer leaves its input
 * closed unanswered, and it ends itself, so a failed spawn leaves nothing
 * running and no signal is sent. Interruptions after the answer land on
 * the caller (`exchange`): `boot` runs this uninterruptibly.
 */
const spawnLive = Effect.fn('Sim.Os.spawn')(function* (
  argv: ReadonlyArray<string>,
  options: { readonly cwd: string; readonly env?: Vars },
) {
  const [tool, ...args] = startCommand(argv);
  return yield* exchange(tool, args, short, options, (line) =>
    Option.match(identified(line), {
      onNone: () =>
        Effect.fail(
          ToolFailed.make({
            tool,
            args,
            exitCode: 0,
            output: `${argv.join(' ')} did not start: ${Option.getOrElse(line, () => 'it printed no identity')}`,
          }),
        ),
      onSome: (child) => Effect.succeed(['go\n', child] as const),
    }),
  );
});

const selfLive = Effect.gen(function* () {
  // oxlint-disable-next-line no-restricted-properties -- the live seam is the one place the command reads its own pid
  const pid = process.pid;
  const started = yield* startedLive(pid);
  if (Option.isNone(started))
    return yield* ToolFailed.make({
      tool: 'ps',
      args: ['-o', 'lstart=', '-p', String(pid)],
      exitCode: 1,
      output: `no start time for this command (pid ${pid})`,
    });
  return { pid, started: started.value } satisfies Identity;
}).pipe(Effect.withSpan('Sim.Os.self'));

const live: OsMembers = {
  spawn: spawnLive,
  started: startedLive,
  signal: signalLive,
  self: selfLive,
};

/** The host's processes; the live one by default, a test's own given with `Layer.succeed` or `Effect.provideService`. */
export const Os = Context.Reference<OsMembers>('@manna/sim/Os', { defaultValue: () => live });

/** `given`, unless it is the live default: then `built`, the one a layer was built with. */
export const either = (given: OsMembers, built: OsMembers) =>
  Option.getOrElse(
    Option.liftPredicate(given, (os) => os !== live),
    () => built,
  );

/** Whether the process still holds its pid: its start time read now is the recorded one. */
export const holds = Effect.fn('Sim.holds')(function* (owned: Identity) {
  const os = yield* Os;
  if (!signalable(owned.pid)) return false;
  const now = yield* os.started(owned.pid);
  return Option.contains(now, owned.started);
});

/** How long a stopped process has to go after SIGTERM, and after SIGKILL. */
const TERM_WAIT = 15;
const KILL_WAIT = 5;

/**
 * The stop rule: SIGTERM to the process the drive started, only while it
 * holds its pid; wait for it to go, by its start time, never by its pid
 * alone; SIGKILL past the wait, only while it still holds its pid; then
 * confirm it is gone. Each signal follows its own start-time read with no
 * host call between. Whether it was stopped (false: it was already gone, or
 * another process holds its pid); `ReadinessTimedOut` when it outlives the
 * SIGKILL.
 */
export const stop = Effect.fn('Sim.stop')(function* (owned: Identity) {
  const os = yield* Os;
  if (!(yield* holds(owned))) return false;
  yield* os.signal(owned.pid, 'SIGTERM');
  const what = `sim serve (pid ${owned.pid}) to stop`;
  const gone = Effect.flatMap(holds(owned), (still) => {
    if (still) return Effect.fail('running');
    return Effect.void;
  });
  return yield* ready(what, TERM_WAIT, gone).pipe(
    Effect.as(true),
    Effect.catchTag('ReadinessTimedOut', () =>
      Effect.gen(function* () {
        if (yield* holds(owned)) yield* os.signal(owned.pid, 'SIGKILL');
        yield* ready(what, KILL_WAIT, gone).pipe(
          Effect.mapError(() => ReadinessTimedOut.make({ what, seconds: TERM_WAIT + KILL_WAIT })),
        );
        return true;
      }),
    ),
  );
});
