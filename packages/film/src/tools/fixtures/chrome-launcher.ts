import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import {
  Cause,
  Config,
  Console,
  Duration,
  Effect,
  Exit,
  FileSystem,
  Match,
  Option,
  Schedule,
  Schema,
  Scope,
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { launchArgs } from '../browser.ts';
import { openView } from '../chrome.ts';
import { endChrome } from '../chrome-profile.ts';
import { collect } from '../process.ts';

/** The two flag sets a sequence opens views with: the renderer's (the GPU's on macOS), and a software one. */
const FLAGS = { 'open:gpu': launchArgs, 'open:soft': ['--disable-gpu-vsync'] } as const;

/** One step of a sequence, as the test names it. */
const Command = Schema.Literals([
  'open:gpu',
  'open:soft',
  'close',
  'killChrome',
  'killOpen',
  'crashOpen',
  'exit',
  'hold',
]);

/** Each Chrome in `ps`'s listing that this process launched (its parent is this process): its pid and its flags. */
const chromesIn = (listing: string) =>
  listing
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter(
      ([, ppid, ...args]) =>
        ppid === String(process.pid) && args.includes('--remote-debugging-pipe'),
    )
    .map(([pid, , ...args]) => ({
      pid: Number(pid),
      flags: args.filter((arg) => arg.startsWith('--')).join(' '),
    }));

/** The flags of each Chrome this process launched. */
const ours = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const ps = yield* collect(
    spawner,
    ChildProcess.make('ps', ['-axo', 'pid=,ppid=,args='], { forceKillAfter: '5 seconds' }),
  );
  return chromesIn(ps.stdout).map((chrome) => chrome.flags);
});

/**
 * Each Chrome this process launched, read from `ps` synchronously: the
 * event loop takes no turn, so the launcher has not yet read the pipe of a
 * Chrome that just died as closed.
 */
const chromesNow = () =>
  chromesIn(
    // oxlint-disable-next-line effect/noGlobals -- a synchronous ps: the ChildProcess service turns the event loop, and the launcher would read the closed pipe first
    Bun.spawnSync(['ps', '-axo', 'pid=,ppid=,args='], { stdout: 'pipe' }).stdout.toString(),
  );

/** SIGKILL to the process group of each Chrome this process launched (its own children, each a group leader), as a crash would, with no `endChrome`. */
const crash = () =>
  Effect.forEach(
    chromesNow(),
    (chrome) => Effect.ignore(Effect.try(() => process.kill(-chrome.pid, 'SIGKILL'))),
    { discard: true },
  );

/** `kill`, then `ps` read again (no turn of the event loop) until it lists none of this process's Chromes, at most 250 times. */
const killedAtOnce = (kill: Effect.Effect<void>) =>
  Effect.andThen(
    kill,
    Effect.sync(() => {
      let reads = 0;
      while (reads < 250 && chromesNow().length > 0) reads += 1;
    }),
  );

/** A step's report, as the test reads it. */
const Step = Schema.fromJsonString(
  Schema.Struct({
    pid: Schema.Finite,
    command: Schema.String,
    result: Schema.String,
    chromes: Schema.Array(Schema.String),
    profile: Schema.Boolean,
  }),
);

/** What a step reports, a JSON line: its command, how it ended, this process's Chromes after it, and whether its profile folder is there. */
const report = (command: string, result: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const root = yield* Config.String('FILM_CHROME_PROFILES').pipe(Effect.orDie);
    const chromes = yield* ours;
    const profile = yield* fs.exists(`${root}/${process.pid}`);
    yield* Console.log(
      yield* Schema.encodeEffect(Step)({ pid: process.pid, command, result, chromes, profile }),
    );
  });

/** An open's end: `ok`, or the failure's tag. */
const endOf = (opened: Exit.Exit<unknown, { readonly _tag: string }>) =>
  Exit.match(opened, {
    onSuccess: () => 'ok',
    onFailure: (cause) =>
      Option.match(Cause.findErrorOption(cause), {
        onNone: () => String(cause),
        onSome: (error) => error._tag,
      }),
  });

Effect.gen(function* () {
  const steps = yield* Config.String('FILM_LAUNCHER_STEPS').pipe(Effect.orDie);
  const commands = yield* Schema.decodeUnknownEffect(Schema.Array(Command))(steps.split(','));
  const views: Array<Scope.Closeable> = [];
  const open = (flags: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const opened = yield* Effect.exit(
        openView(flags, { width: 320, height: 240 }).pipe(
          Effect.tap((view) => Effect.promise(() => view.navigate('about:blank'))),
          Scope.provide(scope),
        ),
      );
      if (Exit.isSuccess(opened)) views.push(scope);
      return endOf(opened);
    });
  for (const command of commands)
    yield* Match.value(command).pipe(
      Match.when('exit', () => report(command, 'exiting')),
      Match.when('hold', () => Effect.andThen(report(command, 'held'), Effect.never)),
      Match.when('close', () =>
        Effect.andThen(
          Option.match(Option.fromUndefinedOr(views.pop()), {
            onNone: () => Effect.void,
            onSome: (scope) => Scope.close(scope, Exit.void),
          }),
          report(command, 'ok'),
        ),
      ),
      Match.when('killChrome', () =>
        Effect.andThen(
          Effect.sync(endChrome),
          Effect.filterOrFail(ours, (left) => left.length === 0).pipe(
            Effect.retry({ schedule: Schedule.spaced(Duration.millis(50)), times: 100 }),
            Effect.andThen(report(command, 'ok')),
          ),
        ),
      ),
      Match.when('killOpen', () =>
        Effect.andThen(killedAtOnce(Effect.sync(endChrome)), open(FLAGS['open:gpu'])).pipe(
          Effect.flatMap((result) => report(command, result)),
        ),
      ),
      Match.when('crashOpen', () =>
        Effect.andThen(killedAtOnce(Effect.suspend(crash)), open(FLAGS['open:gpu'])).pipe(
          Effect.flatMap((result) => report(command, result)),
        ),
      ),
      Match.orElse((flags) =>
        Effect.flatMap(open(FLAGS[flags]), (result) => report(command, result)),
      ),
    );
}).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
