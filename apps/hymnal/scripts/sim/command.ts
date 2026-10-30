/**
 * `sim.ts`'s commands: each parses its arguments, runs its step of the
 * drive (the `Drive` service, `drive.ts`) and prints one JSON result
 * (`result.ts`). A step that fails prints its tagged error and fails the
 * command, so the process exits non-zero.
 */
import {
  Clock,
  Config,
  ConfigProvider,
  Console,
  Effect,
  Exit,
  FileSystem,
  Option,
  Path,
  Schema,
} from 'effect';
import { Argument, CliError, Command, Flag } from 'effect/cli';

import {
  type BootOptions,
  DIRECTIONS,
  Drive,
  type DriveMembers,
  type Outcome,
  type Place,
  RECORD,
  serve,
} from './drive.ts';
import {
  BadArguments,
  HostFailed,
  type SimError,
  type TargetMissing,
  ToolMissing,
  WarmCheckout,
} from './errors.ts';
import type { PlatformError } from 'effect/PlatformError';
import { Failure, Platform, Success } from './result.ts';

/**
 * The warm checkouts: the clean sources worktrees are made from, on the
 * laptop and on the workbox. No command builds, installs or writes in one.
 */
export const WARM_CHECKOUTS: ReadonlyArray<string> = [
  '/Users/cvr/Developer/personal/manna',
  '/workspaces/bible-tools',
];

const encodeSuccess = Schema.encodeSync(Schema.fromJsonString(Success));
const encodeFailure = Schema.encodeSync(Schema.fromJsonString(Failure));

/** Run `step`, print its result as one JSON line, and fail on its error. */
export const report = <R>(
  command: string,
  step: Effect.Effect<Outcome, SimError | PlatformError, R>,
) =>
  Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    const elapsed = Effect.map(Clock.currentTimeMillis, (now) => now - started);
    return yield* step.pipe(
      Effect.catchTag('PlatformError', (error) =>
        Effect.fail(HostFailed.make({ reason: error.message })),
      ),
      Effect.matchEffect({
        onSuccess: (done) =>
          Effect.flatMap(elapsed, (ms) =>
            Console.log(encodeSuccess({ ok: true, command, ...done, ms })),
          ),
        onFailure: (error) =>
          Effect.flatMap(elapsed, (ms) =>
            Console.log(
              encodeFailure({ ok: false, command, message: error.message, error, ms }),
            ).pipe(Effect.andThen(Effect.fail(error))),
          ),
      }),
    );
  });

/** Run a step of the `Drive` service. */
const drive = <A, E>(step: (drive: DriveMembers) => Effect.Effect<A, E>) =>
  Effect.gen(function* () {
    return yield* step(yield* Drive);
  });

/** The hermesc binary under the `hermes-compiler` package `from` resolves. */
const compilerFrom = (path: Path.Path, from: string) =>
  Effect.try({
    try: () => Bun.resolveSync('hermes-compiler/package.json', from),
    catch: () => ToolMissing.make({ tool: 'hermesc' }),
  }).pipe(Effect.map((pkg) => path.join(path.dirname(pkg), 'hermesc', 'osx-bin', 'hermesc')));

/**
 * The Hermes compiler the dev server builds with: `HERMESC_PATH` when it
 * names a file by an absolute path, else the one react-native depends on.
 * The environment is read on each call, so a changed `HERMESC_PATH` counts.
 */
export const hermesCompiler = Effect.fn('Sim.hermesCompiler')(function* (place: Place) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const given = yield* Effect.suspend(() =>
    Effect.gen(function* () {
      return yield* Config.option(Config.String('HERMESC_PATH'));
    }).pipe(
      Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv()),
      Effect.orElseSucceed(() => Option.none<string>()),
    ),
  );
  if (Option.isSome(given) && path.isAbsolute(given.value)) {
    if (yield* fs.exists(given.value)) return given.value;
  }
  const native = yield* Effect.option(
    fs.realPath(path.join(place.app, 'node_modules', 'react-native')),
  );
  return yield* Option.match(native, {
    onNone: () => compilerFrom(path, place.app),
    onSome: (dir) => compilerFrom(path, dir),
  }).pipe(Effect.catchTag('ToolMissing', () => compilerFrom(path, place.app)));
});

/**
 * Open `link`. On iOS a first open whose target does not show is tried once
 * more after the app is terminated, which clears a launch that hung on the
 * splash; the result says whether it was retried.
 */
export const openOnce = (
  place: Place,
  link: string,
  expect: Option.Option<string>,
  seconds: number,
) =>
  drive((d) =>
    d.open(place, link, expect, seconds).pipe(
      Effect.map((done): Outcome => ({ ...done, detail: { ...done.detail, retried: false } })),
      Effect.catchTag('TargetMissing', (missing: TargetMissing) => {
        if (missing.platform !== 'ios') return Effect.fail(missing);
        return d
          .open(place, link, expect, seconds, { terminate: true })
          .pipe(
            Effect.map((done): Outcome => ({ ...done, detail: { ...done.detail, retried: true } })),
          );
      }),
    ),
  );

const seconds = (fallback: number) =>
  Flag.Int('timeout').pipe(
    Flag.withDefault(fallback),
    Flag.withDescription('seconds to wait for readiness before failing'),
  );

const target = Argument.String('target').pipe(
  Argument.withDescription('id=<testID>, label=<accessibility label>, or a bare label'),
);

const expectFlag = Flag.String('expect').pipe(
  Flag.optional,
  Flag.withDescription('a target to wait for once the step is done'),
);

/** The commands, over the drive's place (the app's folder, the state folder, this script). */
export const simCommand = (place: Place) => {
  const state = Flag.String('state').pipe(
    Flag.withDefault(place.state),
    Flag.withDescription('the folder that keeps the drive session'),
  );
  const at = (dir: string): Place => ({ ...place, state: dir });

  const bootCommand = Command.make(
    'boot',
    {
      platform: Flag.Literals('platform', Platform.literals).pipe(
        Flag.withDefault('ios'),
        Flag.withDescription('ios: the verify-hymnal simulator; web: a headless browser'),
      ),
      port: Flag.Int('port').pipe(
        Flag.withDefault(8270),
        Flag.filter(
          (port) => port >= 8270 && port <= 8279,
          (port) => `port ${port} is outside 8270-8279`,
        ),
        Flag.withDescription('the dev server port, 8270-8279'),
      ),
      out: Flag.String('out').pipe(
        Flag.optional,
        Flag.withDescription('where logs and screenshots go (default tmp/verify-hymnal/<time>)'),
      ),
      timeout: seconds(180),
      state,
    },
    (flags) =>
      report(
        'boot',
        Effect.gen(function* () {
          let hermesc = Option.none<string>();
          if (flags.platform === 'ios') hermesc = Option.some(yield* hermesCompiler(place));
          const options: BootOptions = {
            platform: flags.platform,
            port: flags.port,
            out: flags.out,
            seconds: flags.timeout,
            hermesc,
          };
          return yield* drive((d) => d.boot(at(flags.state), options));
        }),
      ),
  ).pipe(Command.withDescription('Boot the simulator (or the web build) and the dev server'));

  const installCommand = Command.make(
    'install',
    {
      app: Flag.String('app').pipe(
        Flag.optional,
        Flag.withDescription('a built Hymnal.app to install instead of building this checkout'),
      ),
      prebuild: Flag.Boolean('prebuild').pipe(
        Flag.withDefault(false),
        Flag.withDescription('run one prebuild first (ios/ is stale, or its build/ was removed)'),
      ),
      expect: Flag.String('expect').pipe(
        Flag.withDefault('label=Hymns'),
        Flag.withDescription('a target that shows once the app has drawn'),
      ),
      timeout: seconds(180),
      state,
    },
    (flags) =>
      report(
        'install',
        drive((d) =>
          d.install(at(flags.state), {
            app: flags.app,
            prebuild: flags.prebuild,
            expect: flags.expect,
            seconds: flags.timeout,
          }),
        ),
      ),
  ).pipe(Command.withDescription("Build this checkout's app, install it and launch it (iOS)"));

  const openCommand = Command.make(
    'open',
    {
      link: Argument.String('link').pipe(
        Argument.withDescription('hymnal://hymns/100, or the route /hymns/100'),
      ),
      expect: expectFlag,
      timeout: seconds(30),
      state,
    },
    (flags) => report('open', openOnce(at(flags.state), flags.link, flags.expect, flags.timeout)),
  ).pipe(
    Command.withDescription(
      'Open a screen by deep link (iOS) or route (web); a missing target on iOS is retried once',
    ),
  );

  const tapCommand = Command.make('tap', { target, timeout: seconds(10), state }, (flags) =>
    report(
      'tap',
      drive((d) => d.tap(at(flags.state), flags.target, flags.timeout)),
    ),
  ).pipe(Command.withDescription('Tap an element by accessibility id or label'));

  const backCommand = Command.make('back', { state }, (flags) =>
    report(
      'back',
      drive((d) => d.back(at(flags.state))),
    ),
  ).pipe(
    Command.withDescription("Go back: the header's back button (iOS), the browser's Back (web)"),
  );

  const fillCommand = Command.make(
    'fill',
    {
      target,
      value: Argument.String('value').pipe(Argument.withDescription('the text to type')),
      timeout: seconds(10),
      state,
    },
    (flags) =>
      report(
        'fill',
        drive((d) => d.fill(at(flags.state), flags.target, flags.value, flags.timeout)),
      ),
  ).pipe(Command.withDescription('Type into a text field by accessibility id or label'));

  const scrollCommand = Command.make(
    'scroll',
    {
      target: Argument.String('target').pipe(
        Argument.withDescription('screen, or a target to scroll to (id=..., label=...)'),
      ),
      direction: Argument.Literals('direction', DIRECTIONS),
      timeout: seconds(10),
      state,
    },
    (flags) =>
      report(
        'scroll',
        drive((d) => d.scroll(at(flags.state), flags.target, flags.direction, flags.timeout)),
      ),
  ).pipe(Command.withDescription('Scroll the screen, or until a target shows'));

  const shotCommand = Command.make(
    'shot',
    {
      name: Argument.String('name').pipe(
        Argument.optional,
        Argument.withDescription('the file name, without .png'),
      ),
      state,
    },
    (flags) =>
      report(
        'shot',
        drive((d) => d.shot(at(flags.state), flags.name)),
      ),
  ).pipe(Command.withDescription('Save a screenshot under <out>/shots'));

  const snapshotCommand = Command.make(
    'snapshot',
    {
      name: Argument.String('name').pipe(
        Argument.optional,
        Argument.withDescription('the file name, without .txt'),
      ),
      state,
    },
    (flags) =>
      report(
        'snapshot',
        drive((d) => d.snapshot(at(flags.state), flags.name)),
      ),
  ).pipe(Command.withDescription("Save the screen's accessibility tree under <out>/snapshots"));

  const recordCommand = Command.make(
    'record',
    {
      action: Argument.Literals('action', RECORD),
      name: Argument.String('name').pipe(
        Argument.optional,
        Argument.withDescription('the video file name, without its extension (start only)'),
      ),
      state,
    },
    (flags) =>
      report(
        'record',
        drive((d) => d.record(at(flags.state), flags.action, flags.name)),
      ),
  ).pipe(
    Command.withDescription('Start a video of the screen under <out>/video, or stop and save it'),
  );

  const logCommand = Command.make('log', { state }, (flags) =>
    report(
      'log',
      drive((d) => d.log(at(flags.state))),
    ),
  ).pipe(Command.withDescription("Save the app's log since boot"));

  const doctorCommand = Command.make('doctor', { state }, (flags) =>
    report(
      'doctor',
      drive((d) => d.doctor(at(flags.state))),
    ),
  ).pipe(Command.withDescription('Check, read only, that the booted drive is worth driving'));

  const downCommand = Command.make('down', { state }, (flags) =>
    report(
      'down',
      drive((d) => d.down(at(flags.state))),
    ),
  ).pipe(Command.withDescription('Shut down what boot started'));

  const serveCommand = Command.make(
    'serve',
    { port: Flag.Int('port'), out: Flag.String('out'), state },
    (flags) => serve(at(flags.state), flags.port, flags.out),
  ).pipe(Command.withDescription('Run the dev server until stopped (boot starts it)'));

  return Command.make('sim').pipe(
    Command.withDescription('Drive the hymnal on the verify-hymnal simulator or the web'),
    Command.withSubcommands([
      bootCommand,
      installCommand,
      openCommand,
      tapCommand,
      backCommand,
      fillCommand,
      scrollCommand,
      shotCommand,
      snapshotCommand,
      recordCommand,
      logCommand,
      doctorCommand,
      downCommand,
      serveCommand,
    ]),
  );
};

/** A parse failure (`ShowHelp` with the parser's errors), as opposed to a `--help` request. */
const badArguments = (error: unknown): error is CliError.ShowHelp =>
  CliError.isCliError(error) && error._tag === 'ShowHelp' && error.errors.length > 0;

/**
 * The warm checkout this checkout is, if it is one: the repository root
 * above the app, matched against each warm checkout with symlinks resolved.
 */
const warmCheckout = Effect.fn('Sim.warmCheckout')(function* (place: Place) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const real = (dir: string) => fs.realPath(dir).pipe(Effect.orElseSucceed(() => dir));
  const root = yield* real(path.resolve(place.app, '..', '..'));
  for (const warm of place.warm) {
    if ((yield* real(warm)) === root) return Option.some(root);
  }
  return Option.none<string>();
});

/**
 * Run `sim <args>` so stdout holds one JSON result and nothing else. A
 * checkout that is warm is refused before the arguments are read. The
 * parser prints its help as it fails, so the run's console lines are held
 * until it ends: arguments that do not parse send the help to stderr and
 * print a `BadArguments` result; any other run prints its lines (a result,
 * or the help `--help` asked for) to stdout.
 */
export const runSim = (place: Place, args: ReadonlyArray<string>) =>
  Console.consoleWith((console) =>
    Effect.gen(function* () {
      const warm = yield* warmCheckout(place);
      if (Option.isSome(warm)) {
        return yield* report(
          args[0] ?? 'sim',
          Effect.fail(WarmCheckout.make({ checkout: warm.value })),
        );
      }
      const lines: Array<string> = [];
      const held: Console.Console = {
        ...console,
        log: (...parts: ReadonlyArray<unknown>) => void lines.push(parts.join(' ')),
      };
      const exit = yield* Command.runWith(simCommand(place), {
        version: '1.0.0',
        renderErrors: false,
      })(args).pipe(
        Effect.catchIf(badArguments, (help) =>
          Effect.fail(
            BadArguments.make({
              command: help.commandPath.join(' '),
              problems: help.errors.map((problem) => problem.message),
            }),
          ),
        ),
        Effect.provideService(Console.Console, held),
        Effect.exit,
      );
      const bad = Option.filter(Exit.findErrorOption(exit), Schema.is(BadArguments));
      if (Option.isNone(bad)) for (const line of lines) console.log(line);
      else {
        const error = bad.value;
        for (const line of lines) console.error(line);
        console.log(
          encodeFailure({
            ok: false,
            command: error.command,
            message: error.message,
            error,
            ms: 0,
          }),
        );
      }
      return yield* exit;
    }),
  );
