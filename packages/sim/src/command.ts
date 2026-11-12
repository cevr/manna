/**
 * The `sim` commands an app's sim script runs: each parses its arguments,
 * runs its step of the drive (the `Drive` service, `drive.ts`) and prints
 * one JSON result (`result.ts`). A step that fails prints its tagged error
 * and fails the command, so the process exits non-zero. Every name, default
 * and range the commands show comes from the place's app (`app.ts`).
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
  Predicate,
  Schema,
} from 'effect';
import { Argument, CliError, Command, Flag } from 'effect/cli';

import { type App, checkApp } from './app.ts';
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
import { BadArguments, hostError, type SimError, ToolMissing, WarmCheckout } from './errors.ts';
import { admit, contain } from './host.ts';
import type { PlatformError } from 'effect/PlatformError';
import {
  HOLD_MS,
  HOLD_SETTLE,
  loadJourney,
  openOnce,
  PAN_MS,
  panStart,
  runJourney,
} from './journey.ts';
import type { Platform } from './result.ts';
import { encodeFailure, Success } from './result.ts';

const encodeSuccess = Schema.encodeSync(Schema.fromJsonString(Success));

/** Run `step`; on its error, print the error as one JSON line and fail. */
const refused = <A, R>(command: string, step: Effect.Effect<A, SimError | PlatformError, R>) =>
  step.pipe(
    Effect.catchTag('PlatformError', (error) => Effect.fail(hostError(error))),
    Effect.tapError((error) =>
      Console.log(encodeFailure({ ok: false, command, message: error.message, error, ms: 0 })),
    ),
  );

/** Run `step`, print its result as one JSON line, and fail on its error. */
const report = <R>(command: string, step: Effect.Effect<Outcome, SimError | PlatformError, R>) =>
  Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    const elapsed = Effect.map(Clock.currentTimeMillis, (now) => now - started);
    return yield* step.pipe(
      Effect.catchTag('PlatformError', (error) => Effect.fail(hostError(error))),
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

/** The x, in points, an edge pan starts at: inside the screen's left edge. */
const EDGE_X = 3;

/** The widest spread a pinch asks: past it the fingers leave a phone's screen. */
const PINCH_MOST = 4;

/** A whole-number flag above 0, `fallback` when not given. */
const positive = (name: string, fallback: number, description: string) =>
  Flag.Int(name).pipe(
    Flag.withDefault(fallback),
    Flag.filter(
      (value) => value > 0,
      (value) => `--${name} ${value} is not above 0`,
    ),
    Flag.withDescription(description),
  );

/**
 * `down --clean`: stop the drive if one is booted (none is no failure),
 * then delete the build output and check the stopped drive's port is free.
 */
const downClean = (d: DriveMembers, place: Place) =>
  Effect.gen(function* () {
    const stopped = yield* d.down(place).pipe(
      Effect.asSome,
      Effect.catchTag('NoSession', () => Effect.succeedNone),
    );
    const platform = Option.match(stopped, {
      onNone: (): Outcome['platform'] => 'ios',
      onSome: (done) => done.platform,
    });
    const port = Option.flatMap(stopped, (done) =>
      Option.liftPredicate(done.detail['port'], Predicate.isNumber),
    );
    const cleaned = yield* d.clean(place, port, platform);
    const before = Option.getOrElse(stopped, (): Outcome => ({ platform, paths: {}, detail: {} }));
    return {
      platform,
      paths: { ...before.paths, ...cleaned.paths },
      detail: { ...before.detail, ...cleaned.detail, stopped: Option.isSome(stopped) },
    } satisfies Outcome;
  });

/** `down`, and with `--clean` the clean after it. */
const downStep = (d: DriveMembers, place: Place, clean: boolean) =>
  Effect.gen(function* () {
    if (clean) return yield* downClean(d, place);
    return yield* d.down(place);
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
const hermesCompiler = Effect.fn('Sim.hermesCompiler')(function* (place: Place) {
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

/** What each platform the app runs on boots, as `--platform` says it. */
const PLATFORM_HELP: Record<Platform, (simulator: string) => string> = {
  ios: (simulator) => `ios: the ${simulator} simulator`,
  web: () => 'web: a headless browser',
};

/** What `down --clean` says it does, its paths named as a sentence does: `a`, `a and b`, `a, b and c`. */
const cleanHelp = (paths: ReadonlyArray<string>) => {
  const check = 'check the port is free, booted or not';
  if (paths.length === 0) return `then ${check}`;
  if (paths.length === 1) return `then delete ${paths.join('')} for good and ${check}`;
  return `then delete ${paths.slice(0, -1).join(', ')} and ${paths.at(-1)} for good and ${check}`;
};

/** What the drive says it drives: the app, on its simulator, and on the web when it runs there. */
const driveHelp = (app: App) => {
  const where = `Drive ${app.displayName} on the ${app.simulator} simulator`;
  if (app.platforms.includes('web')) return `${where} or the web`;
  return where;
};

/** The commands, over the drive's place (the app's folder, the state folder, the app's script, the app). */
const simCommand = (place: Place) => {
  const app = place.config;
  const { ports } = app;
  const state = Flag.String('state').pipe(
    Flag.withDefault(place.state),
    Flag.withDescription('the folder that keeps the drive session'),
  );
  const at = (dir: string): Place => ({ ...place, state: dir });

  const bootCommand = Command.make(
    'boot',
    {
      platform: Flag.Literals('platform', app.platforms).pipe(
        Flag.withDefault('ios'),
        Flag.withDescription(
          app.platforms.map((platform) => PLATFORM_HELP[platform](app.simulator)).join('; '),
        ),
      ),
      port: Flag.Int('port').pipe(
        Flag.withDefault(ports.default),
        Flag.filter(
          (port) => port >= ports.min && port <= ports.max,
          (port) => `port ${port} is outside ${ports.min}-${ports.max}`,
        ),
        Flag.withDescription(`the dev server port, ${ports.min}-${ports.max}`),
      ),
      out: Flag.String('out').pipe(
        Flag.optional,
        Flag.withDescription(`where logs and screenshots go (default tmp/${app.simulator}/<time>)`),
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
        Flag.withDescription(`a built ${app.ios.app} to install instead of building this checkout`),
      ),
      prebuild: Flag.Boolean('prebuild').pipe(
        Flag.withDefault(false),
        Flag.withDescription('run one prebuild first (ios/ is stale, or its build/ was removed)'),
      ),
      expect: Flag.String('expect').pipe(
        Flag.withDefault(app.readyTarget),
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
        Argument.withDescription(`${app.urlScheme}://<route>, or the route /<route>`),
      ),
      expect: expectFlag,
      timeout: seconds(30),
      relaunch: Flag.Boolean('relaunch').pipe(
        Flag.withDefault(true),
        Flag.withDescription(
          'retry a missing iOS target once after terminating the app; --no-relaunch fails it instead',
        ),
      ),
      state,
    },
    (flags) =>
      report(
        'open',
        openOnce(at(flags.state), flags.link, flags.expect, flags.timeout, flags.relaunch),
      ),
  ).pipe(
    Command.withDescription(
      'Open a screen by deep link (iOS) or route (web); a missing target on iOS is retried once unless --no-relaunch',
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

  const readCommand = Command.make(
    'read',
    {
      name: Argument.String('name').pipe(
        Argument.optional,
        Argument.withDescription('the file name, without .json'),
      ),
      ids: Flag.String('id').pipe(
        Flag.atLeast(0),
        Flag.withDescription('a testID to read; a trailing * reads every id it begins'),
      ),
      labels: Flag.String('label').pipe(
        Flag.atLeast(0),
        Flag.withDescription("a name of the app's own to read, matched whole (never its words)"),
      ),
      state,
    },
    (flags) =>
      report(
        'read',
        drive((d) => d.read(at(flags.state), flags.name, { ids: flags.ids, labels: flags.labels })),
      ),
  ).pipe(
    Command.withDescription(
      "Read the screen as numbers (iOS): each asked testID's and name's nodes, their frames and states, under <out>/reads; their counts in detail",
    ),
  );

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

  const panCommand = Command.make(
    'pan',
    {
      from: Argument.String('from').pipe(
        Argument.filterMap(panStart, (from) => `${from} is no x,y point and no target`),
        Argument.withDescription(
          'x,y in points (10,20), or a target whose centre the pan starts at',
        ),
      ),
      dx: Argument.Int('dx').pipe(Argument.withDescription('points to the right (negative: left)')),
      dy: Argument.Int('dy').pipe(Argument.withDescription('points down (negative: up)')),
      ms: positive('ms', PAN_MS, 'milliseconds the pan takes'),
      state,
    },
    (flags) =>
      report(
        'gesture',
        drive((d) =>
          d.gesture(at(flags.state), {
            from: flags.from,
            dx: flags.dx,
            dy: flags.dy,
            ms: flags.ms,
          }),
        ),
      ),
  ).pipe(Command.withDescription('Pan from a point or a target by dx and dy (iOS)'));

  const edgePanCommand = Command.make(
    'edge-pan',
    {
      y: Flag.Int('y').pipe(
        Flag.withDefault(437),
        Flag.filter(
          (y) => y >= 0,
          (y) => `--y ${y} is above the screen`,
        ),
        Flag.withDescription('the height in points the pan starts at'),
      ),
      dx: Flag.Int('dx').pipe(
        Flag.withDefault(200),
        Flag.withDescription('points to the right the pan travels'),
      ),
      ms: positive('ms', 300, 'milliseconds the pan takes'),
      state,
    },
    (flags) =>
      report(
        'gesture',
        drive((d) =>
          d.gesture(at(flags.state), {
            from: { x: EDGE_X, y: flags.y },
            dx: flags.dx,
            dy: 0,
            ms: flags.ms,
          }),
        ),
      ),
  ).pipe(Command.withDescription("Pan right from the screen's left edge: the back swipe (iOS)"));

  const pinchCommand = Command.make(
    'pinch',
    {
      at: Argument.String('at').pipe(
        Argument.filterMap(panStart, (at) => `${at} is no x,y point and no target`),
        Argument.withDescription('x,y in points (10,20), or a target whose centre the pinch is on'),
      ),
      scale: Argument.Finite('scale').pipe(
        Argument.filter(
          (scale) => scale > 0 && scale <= PINCH_MOST,
          (scale) => `scale ${scale} is not above 0 and at most ${PINCH_MOST}`,
        ),
        Argument.withDescription('below 1 the fingers close (a pinch in), above 1 they spread'),
      ),
      state,
    },
    (flags) =>
      report(
        'gesture',
        drive((d) => d.pinch(at(flags.state), flags.at, flags.scale)),
      ),
  ).pipe(Command.withDescription('Pinch two fingers in or out on a point or a target (iOS)'));

  const gestureCommand = Command.make('gesture').pipe(
    Command.withDescription('Pan or pinch as fingers do (iOS)'),
    Command.withSubcommands([panCommand, edgePanCommand, pinchCommand]),
  );

  const holdCommand = Command.make(
    'hold',
    {
      target,
      ms: positive('ms', HOLD_MS, 'milliseconds the press lasts'),
      settle: Flag.Int('settle').pipe(
        Flag.withDefault(HOLD_SETTLE),
        Flag.filter(
          (settle) => settle >= 0,
          (settle) => `--settle ${settle} is below 0`,
        ),
        Flag.withDescription('seconds to wait after the press for what it opens'),
      ),
      state,
    },
    (flags) =>
      report(
        'hold',
        drive((d) => d.hold(at(flags.state), flags.target, flags.ms, flags.settle)),
      ),
  ).pipe(Command.withDescription('Press and hold a target, then let what it opens settle (iOS)'));

  const relaunchCommand = Command.make('relaunch', { state }, (flags) =>
    report(
      'relaunch',
      drive((d) => d.relaunch(at(flags.state))),
    ),
  ).pipe(Command.withDescription('Start the app afresh, or reload the page on the web'));

  const downCommand = Command.make(
    'down',
    {
      clean: Flag.Boolean('clean').pipe(
        Flag.withDefault(false),
        Flag.withDescription(cleanHelp(app.cleanPaths)),
      ),
      state,
    },
    (flags) =>
      report(
        'down',
        drive((d) => downStep(d, at(flags.state), flags.clean)),
      ),
  ).pipe(Command.withDescription('Shut down what boot started'));

  const journeyCommand = Command.make(
    'journey',
    {
      feature: Argument.String('feature').pipe(
        Argument.withDescription('the feature whose features/<feature>.journey.json runs'),
      ),
      skipVideo: Flag.Boolean('skip-video').pipe(
        Flag.withDefault(false),
        Flag.withDescription('take no video of the journey'),
      ),
      state,
    },
    (flags) => {
      const here = at(flags.state);
      return contain(here)(
        Effect.gen(function* () {
          const { journey, session } = yield* refused('journey', loadJourney(here, flags.feature));
          yield* admit(session.out);
          return yield* runJourney(here, journey, session, !flags.skipVideo);
        }),
      );
    },
  ).pipe(
    Command.withDescription(
      "Run a feature's journey (iOS): one JSON line per step, receipts, stop at the first failure",
    ),
  );

  const serveCommand = Command.make(
    'serve',
    { port: Flag.Int('port'), out: Flag.String('out'), state },
    (flags) => refused('serve', serve(at(flags.state), flags.port, flags.out)),
  ).pipe(Command.withDescription('Run the dev server until stopped (boot starts it)'));

  return Command.make('sim').pipe(
    Command.withDescription(driveHelp(app)),
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
      readCommand,
      recordCommand,
      logCommand,
      doctorCommand,
      gestureCommand,
      holdCommand,
      relaunchCommand,
      journeyCommand,
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
 * Run `sim <args>` so stdout holds one JSON result and nothing else. The
 * place's app is checked first: one outside `App`'s domain is a defect,
 * before any step or tool. A checkout that is warm is refused before the
 * arguments are read. The
 * parser prints its help as it fails, so the run's console lines are held
 * until it ends: arguments that do not parse send the help to stderr and
 * print a `BadArguments` result; any other run prints its lines (a result,
 * or the help `--help` asked for) to stdout. Every host call it makes runs
 * over the contained host of the place (`host.ts`).
 */
export const runSim = (place: Place, args: ReadonlyArray<string>) =>
  contain(place)(runAt(place, args));

/** `runSim` over whatever host it is given. */
const runAt = (place: Place, args: ReadonlyArray<string>) =>
  Console.consoleWith((console) =>
    Effect.gen(function* () {
      yield* Effect.orDie(checkApp(place.config));
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
