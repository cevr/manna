/**
 * The drive's steps, one per `sim.ts` command: boot a simulator (or a
 * headless browser) and a dev server, install the build, open a screen,
 * tap, scroll, shoot, read the log, and shut it all down.
 *
 * Separate commands share one drive through its record (`record.ts`),
 * which `boot` writes and `down` files away into the drive's output
 * directory once its server is gone. The dev server belongs to `serve`, a
 * process of its own that `boot` starts and leaves running, its pid and
 * start time recorded: `serve` owns `one dev` in a scope, so stopping it
 * (the stop rule's SIGTERM, `os.ts`) closes the scope and kills the server.
 * `boot` and `down` hold the state (`holder.ts`) while they read, write or
 * signal for it. The drivers run with a HOME under the state folder, so
 * their daemons and sessions belong to the drive.
 */
import {
  Array as Arr,
  Clock,
  Context,
  DateTime,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Result,
  Schema,
  Stream,
} from 'effect';
import { HttpClient } from 'effect/http';
import type { PlatformError } from 'effect/PlatformError';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import type { App } from './app.ts';
import {
  BootRefused,
  HostFailed,
  NoSession,
  Unhealthy,
  NotOnPlatform,
  ScrollStuck,
  SimulatorDown,
  TargetMissing,
  ToolFailed,
} from './errors.ts';
import {
  type Area,
  areaFor,
  type Ask,
  hides,
  moved,
  nodesOf,
  type Pan as ScreenPan,
  panFor,
  readout,
  settled,
  shows,
} from './screen.ts';
import { acquire, release } from './holder.ts';
import { nativeRefusals } from './native-source.ts';
import { either, holds, type Identity, Os, stop } from './os.ts';
import { fileAway, ownedBy, readRecord, recordFile, writeRecord } from './record.ts';
import { type Platform, Session } from './result.ts';
import { admit, contain, executing, type Reach } from './host.ts';
import { attempt, DriverEnv, ready, removed, succeed, type Vars } from './tools.ts';

const short = Duration.seconds(30);
const build = Duration.minutes(45);

/**
 * Where a drive lives: the app's folder, the state folder, the app's sim
 * script, the feature files the journeys sit beside, the warm checkouts a
 * drive refuses to run in, and the app it drives (`config`), whose values
 * every step reads.
 */
export interface Place {
  readonly app: string;
  readonly state: string;
  readonly script: string;
  readonly features: string;
  readonly warm: ReadonlyArray<string>;
  readonly config: App;
}

/** What a step reports: the files it wrote and what it saw. */
export interface Outcome {
  readonly platform: Platform;
  readonly paths: Record<string, string>;
  readonly detail: Detail;
}

/** What a step saw, in short. */
type Detail = Record<string, string | number | boolean>;

const outcome = (platform: Platform, paths: Record<string, string>, detail: Detail): Outcome => ({
  platform,
  paths,
  detail,
});

const SessionJson = Schema.fromJsonString(Session);

const sessionFile = (place: Place) => recordFile(place.state);

/** The booted drive, or `NoSession`; its output folder becomes a root of the step. */
const readSession = Effect.fn('Sim.readSession')(function* (place: Place) {
  const fs = yield* FileSystem.FileSystem;
  const file = sessionFile(place);
  const text = yield* fs.readFileString(file).pipe(Effect.mapError(() => NoSession.make({ file })));
  const session = yield* Schema.decodeEffect(SessionJson)(text).pipe(
    Effect.mapError(() => NoSession.make({ file })),
  );
  yield* admit(session.out);
  return session;
});

const Device = Schema.Struct({ name: Schema.String, udid: Schema.String, state: Schema.String });
const DeviceList = Schema.fromJsonString(
  Schema.Struct({ devices: Schema.Record(Schema.String, Schema.Array(Device)) }),
);
const RuntimeList = Schema.fromJsonString(
  Schema.Struct({
    runtimes: Schema.Array(
      Schema.Struct({ identifier: Schema.String, isAvailable: Schema.Boolean }),
    ),
  }),
);

const decodeTool = <A>(schema: Schema.Codec<A, string>, tool: string, text: string) =>
  Schema.decodeEffect(schema)(text).pipe(
    Effect.mapError((error) =>
      ToolFailed.make({
        tool,
        args: [],
        exitCode: 0,
        output: `unreadable output: ${error.message}`,
      }),
    ),
  );

/** Every simulator device, from `simctl list`. */
const devices = Effect.gen(function* () {
  const text = yield* succeed('xcrun', ['simctl', 'list', 'devices', '-j'], short);
  const list = yield* decodeTool(DeviceList, 'xcrun simctl list devices', text);
  return Object.values(list.devices).flat();
});

const named = (name: string) =>
  Effect.map(devices, (all) => Option.fromNullishOr(all.find((device) => device.name === name)));

/** The newest available iOS runtime. */
const runtime = Effect.gen(function* () {
  const text = yield* succeed('xcrun', ['simctl', 'list', 'runtimes', '-j'], short);
  const list = yield* decodeTool(RuntimeList, 'xcrun simctl list runtimes', text);
  const ios = list.runtimes.filter(
    (entry) => entry.isAvailable && entry.identifier.includes('.iOS-'),
  );
  const newest = Arr.last(ios);
  if (Option.isNone(newest))
    return yield* ToolFailed.make({
      tool: 'xcrun simctl list runtimes',
      args: [],
      exitCode: 0,
      output: 'no available iOS runtime',
    });
  return newest.value.identifier;
});

/** The app's simulator's UDID, created when it is missing. */
const simulator = Effect.fn('Sim.simulator')(function* (app: App) {
  const found = yield* named(app.simulator);
  if (Option.isSome(found)) return found.value.udid;
  const id = yield* runtime;
  const udid = yield* succeed(
    'xcrun',
    ['simctl', 'create', app.simulator, app.deviceType, id],
    short,
  );
  return udid.trim();
});

/** The drive's simulator is booted, or the step fails as `SimulatorDown`. */
const booted = Effect.fn('Sim.booted')(function* (app: App, session: Session) {
  const all = yield* devices;
  const device = all.find((entry) => entry.udid === session.udid);
  const state = device?.state ?? 'missing';
  if (state !== 'Booted') return yield* SimulatorDown.make({ name: app.simulator, state });
  return session.udid;
});

const bootSimulator = Effect.fn('Sim.bootSimulator')(function* (
  app: App,
  port: number,
  seconds: number,
) {
  const udid = yield* simulator(app);
  const all = yield* devices;
  const state = all.find((entry) => entry.udid === udid)?.state ?? 'missing';
  if (state !== 'Booted') yield* succeed('xcrun', ['simctl', 'boot', udid], short);
  yield* succeed('xcrun', ['simctl', 'bootstatus', udid, '-b'], Duration.seconds(seconds));
  yield* succeed(
    'xcrun',
    [
      'simctl',
      'spawn',
      udid,
      'defaults',
      'write',
      app.bundleId,
      'RCT_jsLocation',
      `127.0.0.1:${port}`,
    ],
    short,
  );
  return udid;
});

const answers = (port: number) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.get(`http://127.0.0.1:${port}/`);
    if (response.status >= 500) return yield* Effect.fail(`status ${response.status}`);
    return response.status;
  }).pipe(Effect.timeout('5 seconds'));

/**
 * `serve`: run `one dev` on `port` until this process is stopped, its output
 * into `<out>/server.log`. The server is acquired in this scope and killed
 * when it closes, whether the server exits, the process is interrupted or
 * stopped.
 */
const serveIn = Effect.fn('Sim.serve')(function* (place: Place, port: number, out: string) {
  const fs = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  yield* fs.makeDirectory(out, { recursive: true });
  const args = ['dev', '--port', String(port), '--host', '127.0.0.1'];
  const one = `${place.app}/node_modules/.bin/one`;
  const server = yield* Effect.acquireRelease(
    spawner
      .spawn(
        ChildProcess.make('/bin/sh', ['-c', '"$0" "$@"; exit $?', one, ...args], {
          cwd: place.app,
          forceKillAfter: '5 seconds',
        }),
      )
      .pipe(executing([one])),
    (handle) => Effect.ignore(handle.kill({ killSignal: 'SIGTERM', forceKillAfter: '5 seconds' })),
  );
  const log = `${out}/server.log`;
  const [, , exitCode] = yield* Effect.all(
    [
      Stream.run(server.stdout, fs.sink(log)),
      Stream.run(server.stderr, fs.sink(`${out}/server.err.log`)),
      server.exitCode,
    ],
    { concurrency: 3 },
  );
  return yield* ToolFailed.make({ tool: 'one', args, exitCode, output: `exited; see ${log}` });
}, Effect.scoped);

/** `serve` over the contained host of `place` and `out`. */
export const serve = (place: Place, port: number, out: string) =>
  contain(place, [out])(serveIn(place, port, out));

/**
 * Start `serve` as a process of its own, left running past this command
 * (`Os.spawn`): its pid and start time, the identity the stop rule needs.
 * It keeps the caller's environment, with `HERMESC_PATH` when given.
 */
const startServer = Effect.fn('Sim.startServer')(function* (
  place: Place,
  port: number,
  out: string,
  hermesc: Option.Option<string>,
) {
  const os = yield* Os;
  const argv = ['bun', place.script, 'serve', '--port', String(port), '--out', out];
  const env = Option.match(hermesc, {
    onNone: (): Vars => ({}),
    onSome: (compiler): Vars => ({ HERMESC_PATH: compiler }),
  });
  return yield* os
    .spawn([...argv, '--state', place.state], { cwd: place.app, env })
    .pipe(executing(['bun', place.script]));
});

/** Nothing answers on `port` yet, or the boot fails before it starts anything. */
const portFree = Effect.fn('Sim.portFree')(function* (place: Place, port: number) {
  const taken = yield* Effect.isSuccess(answers(port));
  if (taken)
    return yield* ToolFailed.make({
      tool: 'one',
      args: ['dev', '--port', String(port)],
      exitCode: -1,
      output: `port ${port} already answers; pick another of ${place.config.ports.min}-${place.config.ports.max}`,
    });
});

/** How many times a just-started server whose record could not be written is stopped. */
const UNRECORDED_STOPS = 3;

/**
 * Stop a just-started server whose record could not be written, by the stop
 * rule; again after a failed host call, at most `UNRECORDED_STOPS` times in
 * all. A server that outlives the stop's SIGKILL is not tried again.
 */
const stopUnrecorded = (owned: Identity) =>
  Effect.ignore(
    stop(owned).pipe(
      Effect.retry({
        times: UNRECORDED_STOPS - 1,
        while: (error) => error._tag !== 'ReadinessTimedOut',
      }),
    ),
  );

/** agent-browser's longest socket path: macOS's `sun_path` holds 104 bytes with its NUL. */
const SOCKET_MAX = 103;

/** A short name that stays the same for `text`: FNV-1a, 64 bits, over its UTF-16 units, as hex. */
const digest = (text: string) => {
  let hash = 0xcb_f2_9c_e4_84_22_23_25n;
  for (let at = 0; at < text.length; at += 1) {
    hash ^= BigInt(text.charCodeAt(at));
    hash = (hash * 0x1_00_00_00_01_b3n) & 0xff_ff_ff_ff_ff_ff_ff_ffn;
  }
  return hash.toString(16).padStart(16, '0');
};

/** agent-browser's socket folder for the drivers' HOME `home`: short, under /tmp, one per HOME. */
const socketFolder = (home: string) => `/tmp/sim-${digest(home)}`;

/** The drivers' child environment for a drive: its HOME, its socket folder, and the variables over the caller's. */
interface Drivers {
  readonly home: string;
  readonly sockets: string;
  readonly vars: Vars;
}

/**
 * The child environment the drivers of the drive in `place` run in. HOME
 * is `<state>/home`, where agent-device keeps its daemon and runner build;
 * agent-browser's sockets go to a short folder under /tmp named for that
 * HOME, so a socket path fits whatever the state folder's length; and
 * neither driver inherits the caller's `XDG_RUNTIME_DIR` or
 * `AGENT_DEVICE_STATE_DIR`. Every other variable is the caller's.
 */
const driversOf = (path: Path.Path, place: Place): Drivers => {
  const home = path.resolve(place.state, 'home');
  const sockets = socketFolder(home);
  return {
    home,
    sockets,
    vars: {
      ...removed(['XDG_RUNTIME_DIR', 'AGENT_DEVICE_STATE_DIR']),
      HOME: home,
      AGENT_BROWSER_SOCKET_DIR: sockets,
    },
  };
};

const utf8Bytes = (text: string) => new TextEncoder().encode(text).byteLength;

const isNotFound = (error: PlatformError) => error.reason._tag === 'NotFound';

/**
 * The drivers' HOME, made through the contained host and kept across drives
 * of the state (agent-device's runner build is its cache): a folder, not a
 * link, that only its owner may read.
 */
const ensureHome = Effect.fn('Sim.ensureHome')(function* (home: string) {
  const fs = yield* FileSystem.FileSystem;
  const found = yield* fs.lstat(home).pipe(
    Effect.asSome,
    Effect.catchIf(isNotFound, () => Effect.succeedNone),
  );
  const isPrivate = (info: FileSystem.File.Info) =>
    info.type === 'Directory' && (info.mode & 0o777) === 0o700;
  if (Option.exists(found, isPrivate)) return;
  if (Option.exists(found, (info) => info.type !== 'Directory'))
    return yield* HostFailed.make({
      reason: `the drivers' HOME ${home} is not a folder (a link, or a file); remove it`,
    });
  yield* fs.makeDirectory(home, { recursive: true, mode: 0o700 });
  yield* fs.chmod(home, 0o700);
});

/**
 * The drivers' environment for a step in `place`: the child one (its HOME
 * made sure of) when the state holds a session this driver booted, else
 * none, so they keep the caller's: no session, one that does not decode, or
 * a legacy one, whose agent sessions live in the caller's HOME.
 */
const driverEnv = Effect.fn('Sim.driverEnv')(function* (place: Place) {
  const path = yield* Path.Path;
  const found = yield* readRecord(place.state);
  const session = Option.flatMap(found, (record) => record.session);
  if (!Option.exists(session, (booted) => Option.isSome(ownedBy(booted))))
    return Option.none<Vars>();
  const drivers = driversOf(path, place);
  yield* ensureHome(drivers.home);
  return Option.some(drivers.vars);
});

/** Run `use` holding the state: released on success, failure and interruption; an abrupt exit leaves a hold found dead. */
const holding = <A, E, R>(place: Place, use: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(acquire(place.state), () => use, release);

interface Target {
  readonly by: 'id' | 'label';
  readonly value: string;
  /** The element's role, when a name alone matches more than one (`link`, `button`). */
  readonly role: Option.Option<string>;
}

/**
 * `id=<testID>` or `label=<accessibility label>`; a bare word is a label.
 * A leading `role=<role> ` narrows it to elements of that role, as
 * `role=link label=100, Great Is Thy Faithfulness`.
 */
export const parseTarget = (text: string): Target => {
  const unquote = (value: string) => value.replace(/^"(.*)"$/s, '$1');
  const narrowed = /^role=(\w+) (.*)$/s.exec(text);
  const role = Option.fromNullishOr(narrowed?.[1]);
  const rest = narrowed?.[2] ?? text;
  if (rest.startsWith('id=')) return { by: 'id', value: unquote(rest.slice(3)), role };
  if (rest.startsWith('label=')) return { by: 'label', value: unquote(rest.slice(6)), role };
  return { by: 'label', value: rest, role };
};

/** A double-quoted selector value, its quotes and backslashes escaped. */
const quoted = (value: string) => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

/** agent-device's selector for the target. */
const iosSelector = (target: Target) =>
  [
    ...Option.toArray(Option.map(target.role, (role) => `role=${role}`)),
    `${target.by}=${quoted(target.value)}`,
  ].join(' ');

/** The HTML elements whose role is implicit, by role: react-native-web renders a link as `<a>`. */
const IMPLICIT = new Map([
  ['link', 'a'],
  ['button', 'button'],
]);

/** The CSS selector react-native-web renders the target as. */
const webSelector = (target: Target) => {
  const named = {
    id: `[data-testid=${quoted(target.value)}]`,
    label: `[aria-label=${quoted(target.value)}]`,
  }[target.by];
  return Option.match(target.role, {
    onNone: () => named,
    onSome: (role) =>
      [`[role="${role}"]`, ...Option.toArray(Option.fromNullishOr(IMPLICIT.get(role)))]
        .map((element) => `${element}${named}`)
        .join(', '),
  });
};

const device = (app: App, args: ReadonlyArray<string>, limit = short) =>
  succeed('agent-device', [...args, '--session', app.driverSession], limit);

/** The driver's app session: the app comes forward, or launches. */
const openApp = (app: App, udid: string, limit = short) =>
  device(app, ['open', app.bundleId, '--platform', 'ios', '--udid', udid], limit);

/**
 * An app step on iOS (`scroll`, `back`). agent-device runs these only in an
 * app session an `open` started, and answers SESSION_NOT_FOUND before one
 * (a drive whose first step is not `sim open` or `sim install`); the step
 * then opens the session and runs once more.
 */
const inApp = (app: App, udid: string, args: ReadonlyArray<string>, limit = short) =>
  device(app, args, limit).pipe(
    Effect.catchTag('ToolFailed', (failed) => {
      if (!failed.output.includes('SESSION_NOT_FOUND')) return Effect.fail(failed);
      return Effect.andThen(openApp(app, udid, limit), device(app, args, limit));
    }),
  );

/** The browser's launch flags: a drive never plays sound through the host's speakers. */
const MUTED = '--mute-audio,--disable-audio-output';
const browser = (app: App, args: ReadonlyArray<string>, limit = short) =>
  succeed('agent-browser', ['--session', app.driverSession, ...args], limit);

/** The driver a step runs on each platform: agent-device on iOS, agent-browser on the web. */
const driver = (app: App, platform: Platform) =>
  ({
    ios: (args: ReadonlyArray<string>, limit = short) => device(app, args, limit),
    web: (args: ReadonlyArray<string>, limit = short) => browser(app, args, limit),
  })[platform];

/** A driver's failed wait for `text`, as `TargetMissing` with what the driver said. */
const missingFrom = (session: Session, text: string) => (failed: ToolFailed) =>
  Effect.fail(
    TargetMissing.make({ target: text, platform: session.platform, driver: failed.output }),
  );

/** The target is on screen within `seconds`, or the step fails as `TargetMissing`. */
const present = Effect.fn('Sim.present')(function* (
  app: App,
  session: Session,
  text: string,
  seconds: number,
) {
  const target = parseTarget(text);
  const missing = missingFrom(session, text);
  const ms = String(Math.round(seconds * 1000));
  if (session.platform === 'ios')
    return yield* device(
      app,
      ['wait', iosSelector(target), ms],
      Duration.seconds(seconds + 10),
    ).pipe(Effect.catchTag('ToolFailed', missing));
  return yield* browser(
    app,
    ['wait', webSelector(target), '--timeout', ms],
    Duration.seconds(seconds + 10),
  ).pipe(Effect.catchTag('ToolFailed', missing));
});

export interface BootOptions {
  readonly platform: Platform;
  readonly port: number;
  readonly out: Option.Option<string>;
  readonly seconds: number;
  /** The Hermes compiler the dev server builds iOS bundles with, as `HERMESC_PATH`. */
  readonly hermesc: Option.Option<string>;
}

const stamp = Effect.map(DateTime.now, (now) => DateTime.formatIso(now));

/**
 * Boot the drive. A web drive whose socket path cannot fit is refused before
 * anything else. Then, holding the state: a record that does not decode, a
 * legacy one, or one whose server still runs refuses the boot with nothing
 * started; a stale one is filed away. Then the simulator, a free port, the
 * drivers' HOME, the server, and its record as the very next step. A start
 * that fails or is interrupted before the server is known by its identity
 * leaves nothing running (`Os.spawn`); from the start to the record this
 * runs uninterruptibly, a record that cannot be written stops the server
 * (`stopUnrecorded`), and any failure or interruption after the record
 * stops the server by the stop rule and, once it is gone, files its record
 * away; a server that will not stop keeps its record for the next `down`.
 */
const boot = Effect.fn('Sim.boot')(function* (place: Place, options: BootOptions) {
  const path = yield* Path.Path;
  const bootedAt = yield* stamp;
  const out = Option.getOrElse(options.out, () =>
    path.join(place.state, bootedAt.replaceAll(':', '-')),
  );
  yield* admit(out);
  const drivers = driversOf(path, place);
  const refuse = (reason: string) => BootRefused.make({ state: place.state, reason });
  const socket = `${drivers.sockets}/${place.config.driverSession}.sock`;
  if (options.platform === 'web' && utf8Bytes(socket) > SOCKET_MAX)
    return yield* refuse(
      `agent-browser's socket ${socket} is ${utf8Bytes(socket)} bytes, past macOS's ${SOCKET_MAX}; shorten the app's driverSession`,
    );
  return yield* holding(
    place,
    Effect.gen(function* () {
      const found = yield* readRecord(place.state);
      if (Option.isSome(found)) {
        const { file, session } = found.value;
        if (Option.isNone(session))
          return yield* refuse(`${file} does not decode; move it away by hand`);
        const owned = ownedBy(session.value);
        if (Option.isNone(owned))
          return yield* refuse(
            `a legacy session (an older sim's) holds it; run sim down, then stop its server (pid ${session.value.serverPid}) by hand`,
          );
        if (yield* holds(owned.value))
          return yield* refuse(
            `a booted drive holds it (sim serve, pid ${owned.value.pid}); run sim down`,
          );
        yield* fileAway(place.state, session.value.out);
      }
      const udid = yield* bootSimulatorFor(place.config, options);
      yield* portFree(place, options.port);
      yield* ensureHome(drivers.home);
      return yield* Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const owned = yield* startServer(place, options.port, out, options.hermesc);
          const session: Session = {
            platform: options.platform,
            out,
            port: options.port,
            serverPid: owned.pid,
            udid,
            bootedAt,
            serverStarted: owned.started,
            home: drivers.home,
          };
          yield* writeRecord(place.state, session).pipe(
            Effect.onError(() => stopUnrecorded(owned)),
          );
          const up = Effect.gen(function* () {
            yield* ready(
              `the dev server on port ${options.port}`,
              options.seconds,
              answers(options.port),
            );
            if (options.platform === 'web')
              yield* browser(
                place.config,
                ['--args', MUTED, 'open', `http://127.0.0.1:${options.port}/`],
                Duration.seconds(options.seconds),
              );
          });
          yield* restore(up.pipe(Effect.provideService(DriverEnv, Option.some(drivers.vars)))).pipe(
            Effect.onError(() =>
              Effect.ignore(Effect.andThen(stop(owned), fileAway(place.state, out))),
            ),
          );
          return outcome(
            options.platform,
            { session: sessionFile(place), out, server: `${out}/server.log`, home: drivers.home },
            {
              udid,
              port: options.port,
              serverPid: owned.pid,
              serverStarted: owned.started,
              hermesc: Option.getOrElse(options.hermesc, () => ''),
            },
          );
        }),
      );
    }),
  );
});

const bootSimulatorFor = (app: App, options: BootOptions) => {
  if (options.platform === 'web') return Effect.succeed('');
  return bootSimulator(app, options.port, options.seconds);
};

/** The plist `install` edits so the app answers its URL scheme's links. */
const plist = (place: Place) => `${place.app}/${place.config.ios.infoPlist}`;

/** The native folder: the one the app's `.xcworkspace` sits in, whose `build/` holds the build. */
const nativeDir = (place: Place) => {
  const workspace = place.config.ios.workspace;
  const cut = workspace.lastIndexOf('/');
  if (cut < 0) return place.app;
  return `${place.app}/${workspace.slice(0, cut)}`;
};

const PLIST_BUDDY = '/usr/libexec/PlistBuddy';

const registerScheme = Effect.fn('Sim.registerScheme')(function* (app: App, file: string) {
  const scheme = app.urlScheme;
  const read = yield* attempt(
    PLIST_BUDDY,
    ['-c', 'Print :CFBundleURLTypes:0:CFBundleURLSchemes:0', file],
    short,
  );
  if (read.exitCode === 0 && read.output.trim() === scheme) return false;
  yield* succeed(
    PLIST_BUDDY,
    [
      '-c',
      'Add :CFBundleURLTypes array',
      '-c',
      'Add :CFBundleURLTypes:0 dict',
      '-c',
      'Add :CFBundleURLTypes:0:CFBundleURLSchemes array',
      '-c',
      `Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string ${scheme}`,
      file,
    ],
    short,
  );
  return true;
});

/**
 * Build the checkout's Debug simulator app; its path. It prebuilds first
 * when the workspace is missing or `prebuild` asks: the native folder's
 * `build/generated` holds the codegen pod install wrote, so a native folder
 * whose `build/` was removed needs one too.
 */
const buildApp = Effect.fn('Sim.buildApp')(function* (
  place: Place,
  out: string,
  prebuild: boolean,
) {
  const fs = yield* FileSystem.FileSystem;
  const { ios } = place.config;
  const native = nativeDir(place);
  const workspace = `${place.app}/${ios.workspace}`;
  const hasIos = yield* fs.exists(workspace);
  if (prebuild || !hasIos)
    yield* succeed('bun', ['run', '--cwd', place.app, 'prebuild:native'], Duration.minutes(5));
  const registered = yield* registerScheme(place.config, plist(place));
  const args = [
    '-workspace',
    workspace,
    '-scheme',
    ios.scheme,
    '-configuration',
    'Debug',
    '-destination',
    'generic/platform=iOS Simulator',
    '-derivedDataPath',
    `${native}/build/dd`,
    'SKIP_BUNDLING=1',
    'ARCHS=arm64',
    'ONLY_ACTIVE_ARCH=YES',
    'build',
  ];
  const built = yield* attempt('xcodebuild', args, build);
  yield* fs.writeFileString(`${out}/build.log`, built.output);
  if (built.exitCode !== 0)
    return yield* ToolFailed.make({
      tool: 'xcodebuild',
      args,
      exitCode: built.exitCode,
      output: `see ${out}/build.log`,
    });
  return {
    app: `${native}/build/dd/Build/Products/Debug-iphonesimulator/${ios.app}`,
    registered,
  };
});

/**
 * A built app given to `install`, copied into the drive's output with the
 * scheme registered in the copy's own `Info.plist` (an iOS bundle keeps it
 * at its top) and the copy signed again (ad hoc, as a simulator build is):
 * the given app is left as it is.
 */
const copyApp = Effect.fn('Sim.copyApp')(function* (config: App, given: string, out: string) {
  const fs = yield* FileSystem.FileSystem;
  const app = `${out}/${config.ios.app}`;
  yield* fs.makeDirectory(out, { recursive: true });
  yield* fs.copy(given, app, { overwrite: true });
  const registered = yield* registerScheme(config, `${app}/Info.plist`);
  yield* succeed(
    'codesign',
    ['--force', '--sign', '-', '--preserve-metadata=entitlements', app],
    Duration.minutes(2),
  );
  return { app, registered };
});

interface InstallOptions {
  /** A built app to install instead of building this checkout. */
  readonly app: Option.Option<string>;
  /** Run `prebuild:native` (`one prebuild`) before the build. */
  readonly prebuild: boolean;
  /** A target that shows once the app has drawn. */
  readonly expect: string;
  readonly seconds: number;
}

const install = Effect.fn('Sim.install')(function* (place: Place, options: InstallOptions) {
  const { app, expect, seconds } = options;
  const session = yield* readSession(place);
  if (session.platform === 'web')
    return yield* NotOnPlatform.make({ command: 'install', platform: 'web' });
  const config = place.config;
  const udid = yield* booted(config, session);
  const started = yield* Clock.currentTimeMillis;
  const made = yield* Option.match(app, {
    onSome: (given) => Effect.andThen(admit(given), copyApp(config, given, session.out)),
    onNone: () => buildApp(place, session.out, options.prebuild),
  });
  const builtMs = (yield* Clock.currentTimeMillis) - started;
  yield* succeed('xcrun', ['simctl', 'install', udid, made.app], Duration.minutes(2));
  yield* device(
    config,
    ['open', config.bundleId, '--platform', 'ios', '--udid', udid, '--relaunch'],
    Duration.seconds(seconds),
  );
  yield* present(config, session, expect, seconds);
  return outcome(
    'ios',
    { app: made.app, build: `${session.out}/build.log` },
    { udid, buildMs: builtMs, schemeAdded: made.registered, expect },
  );
});

/** A deep link as each platform opens it: `<scheme>://<path>` on iOS, the route on the web. */
const linkFor = (scheme: string, platform: Platform, port: number, link: string) => {
  const route = link.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^\//, '');
  if (platform === 'ios') return `${scheme}://${route}`;
  return `http://127.0.0.1:${port}/${route}`;
};

/**
 * iOS asks, as the app's `openPrompt`, before it gives a link in the app's
 * scheme to the app; a reader taps Open, so the drive does too. An earlier
 * link left unanswered stacks its own prompt under this one, so each prompt
 * up to three is answered; no prompt within 3 s (the app already has the
 * link) is not a failure. How many were answered.
 */
const confirmOpen = Effect.fn('Sim.confirmOpen')(function* (app: App, session: Session) {
  let answered = 0;
  while (answered < 3) {
    const asked = yield* attempt(
      'agent-device',
      ['wait', app.openPrompt, '3000', '--session', app.driverSession],
      short,
    );
    if (asked.exitCode !== 0) return answered;
    yield* present(app, session, 'label=Open', 5);
    yield* device(app, ['press', 'label="Open"', '--settle']);
    answered += 1;
  }
  return answered;
});

/**
 * How `open` opens: `terminate` stops the app first (iOS), so it launches
 * afresh, and gives it the link only once its `readyTarget` shows: a link
 * handed to an app whose JavaScript is still loading is dropped, and the app
 * draws its first screen.
 */
interface OpenOptions {
  readonly terminate?: boolean;
}

const open = Effect.fn('Sim.open')(function* (
  place: Place,
  link: string,
  expect: Option.Option<string>,
  seconds: number,
  options: OpenOptions = {},
) {
  const app = place.config;
  const session = yield* readSession(place);
  const url = linkFor(app.urlScheme, session.platform, session.port, link);
  let prompts = 0;
  if (session.platform === 'ios') {
    const udid = yield* booted(app, session);
    if (options.terminate === true)
      yield* Effect.ignore(succeed('xcrun', ['simctl', 'terminate', udid, app.bundleId], short));
    yield* openApp(app, udid, Duration.seconds(seconds));
    if (options.terminate === true) yield* present(app, session, app.readyTarget, seconds);
    yield* succeed('xcrun', ['simctl', 'openurl', udid, url], short);
    prompts = yield* confirmOpen(app, session);
  } else yield* browser(app, ['open', url], Duration.seconds(seconds));
  if (Option.isSome(expect)) yield* present(app, session, expect.value, seconds);
  return outcome(
    session.platform,
    {},
    { url, prompts, expect: Option.getOrElse(expect, () => '') },
  );
});

const tap = Effect.fn('Sim.tap')(function* (place: Place, text: string, seconds: number) {
  const app = place.config;
  const session = yield* readSession(place);
  if (session.platform === 'ios') yield* booted(app, session);
  yield* present(app, session, text, seconds);
  const target = parseTarget(text);
  if (session.platform === 'ios') yield* device(app, ['press', iosSelector(target), '--settle']);
  else yield* browser(app, ['click', webSelector(target)]);
  return outcome(session.platform, {}, { target: text });
});

/** Type `value` into a text field, replacing what it held. */
const fill = Effect.fn('Sim.fill')(function* (
  place: Place,
  text: string,
  value: string,
  seconds: number,
) {
  const app = place.config;
  const session = yield* readSession(place);
  if (session.platform === 'ios') yield* booted(app, session);
  yield* present(app, session, text, seconds);
  const target = parseTarget(text);
  if (session.platform === 'ios')
    yield* device(app, ['fill', iosSelector(target), value, '--settle']);
  else yield* browser(app, ['fill', webSelector(target), value]);
  return outcome(session.platform, {}, { target: text, value });
});

/**
 * Go back as a reader does: the header's back button on iOS (the app's own
 * stack), the browser's Back on the web.
 */
const back = Effect.fn('Sim.back')(function* (place: Place) {
  const app = place.config;
  const session = yield* readSession(place);
  if (session.platform === 'ios') {
    const udid = yield* booted(app, session);
    yield* inApp(app, udid, ['back', '--in-app', '--settle']);
  } else yield* browser(app, ['back']);
  return outcome(session.platform, {}, {});
});

export const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
type Direction = (typeof DIRECTIONS)[number];

/** A step in each direction, as `scrollBy(x, y)` takes it. */
const STEP: Record<Direction, readonly [number, number]> = {
  up: [0, -600],
  down: [0, 600],
  left: [-600, 0],
  right: [600, 0],
};

/**
 * The page script that scrolls the screen one step: react-native-web's
 * ScrollView is a div of its own, so the window never scrolls; the tallest
 * element that can scroll is the screen's.
 */
const scrollScript = (direction: Direction) => {
  const [x, y] = STEP[direction];
  return [
    '(() => {',
    "  const all = [...document.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight || e.scrollWidth > e.clientWidth)",
    '    .filter((e) => /auto|scroll/.test(getComputedStyle(e).overflowY + getComputedStyle(e).overflowX));',
    '  const screen = all.sort((a, b) => b.clientHeight - a.clientHeight)[0] ?? document.scrollingElement;',
    `  screen.scrollBy(${x}, ${y});`,
    '  return screen.scrollTop;',
    '})()',
  ].join('\n');
};

const RAW = ['snapshot', '--json', '--raw'] as const;

/** The screen's nodes now, from agent-device's raw snapshot (iOS). */
const nodesNow = (app: App, udid: string) =>
  Effect.flatMap(inApp(app, udid, RAW), (json) =>
    nodesOf(json).pipe(
      Effect.mapError(() =>
        ToolFailed.make({
          tool: 'agent-device',
          args: [...RAW],
          exitCode: 0,
          output: `not a snapshot: ${json.slice(0, 400)}`,
        }),
      ),
    ),
  );

/**
 * How long a scroll's pan takes, how long before the first look after it,
 * and, while the pan's fling still carries the content, how long between
 * looks and how many looks at most.
 */
const PAN_MS = 600;
const REST = Duration.millis(700);
const LOOK = Duration.millis(250);
const MAX_LOOKS = 12;

/** The most pans a scroll to a target makes before it fails `TargetMissing`. */
const MAX_PASSES = 40;

const panText = (pan: ScreenPan) => `${pan.x},${pan.y} by ${pan.dx},${pan.dy}`;

/**
 * One pan of `area` in `direction`, inside the part of it on screen
 * (`panFor`), then the screen's nodes once the content has come to rest
 * (two looks in a row with it in one place, `settled`, so the next tap lands
 * on still content); it fails `ScrollStuck` when the content stayed where it
 * was while the view still hid more of it that way.
 */
const panArea = Effect.fn('Sim.panArea')(function* (
  app: App,
  udid: string,
  area: Area,
  direction: Direction,
  text: string,
) {
  const pan = panFor(area, direction);
  yield* inApp(app, udid, [
    'gesture',
    'pan',
    ...[pan.x, pan.y, pan.dx, pan.dy, PAN_MS].map(String),
  ]);
  yield* Effect.sleep(REST);
  let after = yield* nodesNow(app, udid);
  for (let look = 0; look < MAX_LOOKS; look += 1) {
    yield* Effect.sleep(LOOK);
    const next = yield* nodesNow(app, udid);
    const still = settled(area, after, next, direction);
    after = next;
    if (still) break;
  }
  const went = moved(area, after, direction);
  if (!went && hides(area, direction))
    return yield* ScrollStuck.make({ target: text, direction, pan: panText(pan) });
  return { after, went, pan };
});

/**
 * Scroll the screen one step on iOS: a pan inside the scroll view that
 * scrolls that way (`areaFor`), so a fixed header or footer around it never
 * takes the finger. With no such view on screen, agent-device's own scroll.
 */
const scrollScreenIos = Effect.fn('Sim.scrollScreenIos')(function* (
  app: App,
  udid: string,
  direction: Direction,
) {
  const area = areaFor(yield* nodesNow(app, udid), direction);
  if (Option.isNone(area)) {
    yield* inApp(app, udid, ['scroll', direction, '--settle']);
    return Option.none<Detail>();
  }
  const { went, pan } = yield* panArea(app, udid, area.value, direction, 'screen');
  return Option.some<Detail>({ moved: went, pan: panText(pan) });
});

/**
 * Scroll on iOS until the target shows (`shows`): a pan at a time, each
 * checked to move the content, at most `MAX_PASSES`. With no scroll view on
 * screen that scrolls that way, agent-device's own `scroll --until`.
 */
const scrollToIos = Effect.fn('Sim.scrollToIos')(function* (
  app: App,
  session: Session,
  udid: string,
  text: string,
  direction: Direction,
) {
  const target = parseTarget(text);
  const missing = (driver: string) =>
    TargetMissing.make({ target: text, platform: session.platform, driver });
  let nodes = yield* nodesNow(app, udid);
  for (let passes = 0; passes <= MAX_PASSES; passes += 1) {
    if (shows(nodes, target)) return Option.some<Detail>({ passes });
    const area = areaFor(nodes, direction);
    if (Option.isNone(area) && passes === 0) {
      yield* inApp(app, udid, ['scroll', direction, '--until', iosSelector(target)]).pipe(
        Effect.catchTag('ToolFailed', missingFrom(session, text)),
      );
      return Option.none<Detail>();
    }
    if (Option.isNone(area)) return yield* missing(`no scroll view scrolls ${direction} now`);
    if (!hides(area.value, direction))
      return yield* missing(`the scroll view's content ends after ${passes} pans ${direction}`);
    nodes = (yield* panArea(app, udid, area.value, direction, text)).after;
  }
  return yield* missing(`not shown after ${MAX_PASSES} pans ${direction}`);
});

/**
 * Scroll the screen one step in `direction` (target `screen`), or until the
 * target shows: on iOS by pans inside the scroll view, each checked to move
 * its content (`detail.moved`; `ScrollStuck` when one moved nothing while the
 * view hid more), on the web by scrolling it into view.
 */
const scroll = Effect.fn('Sim.scroll')(function* (
  place: Place,
  text: string,
  direction: Direction,
  seconds: number,
) {
  const app = place.config;
  const session = yield* readSession(place);
  let seen = Option.none<Detail>();
  if (session.platform === 'ios') {
    const udid = yield* booted(app, session);
    if (text === 'screen') seen = yield* scrollScreenIos(app, udid, direction);
    else
      seen = yield* scrollToIos(app, session, udid, text, direction).pipe(
        Effect.timeoutOrElse({
          duration: Duration.seconds(seconds + 30),
          orElse: () =>
            Effect.fail(
              TargetMissing.make({
                target: text,
                platform: session.platform,
                driver: `not shown within ${seconds + 30} s`,
              }),
            ),
        }),
      );
  } else if (text === 'screen') yield* browser(app, ['eval', scrollScript(direction)]);
  else {
    yield* present(app, session, text, seconds);
    yield* browser(app, ['scrollintoview', webSelector(parseTarget(text))]);
  }
  return outcome(
    session.platform,
    {},
    { target: text, direction, ...Option.getOrElse(seen, () => ({})) },
  );
});

const shot = Effect.fn('Sim.shot')(function* (place: Place, name: Option.Option<string>) {
  const fs = yield* FileSystem.FileSystem;
  const session = yield* readSession(place);
  const dir = `${session.out}/shots`;
  yield* fs.makeDirectory(dir, { recursive: true });
  const taken = yield* fs.readDirectory(dir);
  const file = `${dir}/${Option.getOrElse(name, () => `shot-${taken.length + 1}`)}.png`;
  if (session.platform === 'ios') {
    const udid = yield* booted(place.config, session);
    yield* succeed('xcrun', ['simctl', 'io', udid, 'screenshot', file], short);
  } else yield* browser(place.config, ['screenshot', file]);
  return outcome(session.platform, { shot: file }, {});
});

/** Save the screen's accessibility tree as text under `<out>/snapshots`: what a step left on screen, by role and name. */
const snapshot = Effect.fn('Sim.snapshot')(function* (place: Place, name: Option.Option<string>) {
  const fs = yield* FileSystem.FileSystem;
  const session = yield* readSession(place);
  const dir = `${session.out}/snapshots`;
  yield* fs.makeDirectory(dir, { recursive: true });
  const taken = yield* fs.readDirectory(dir);
  const file = `${dir}/${Option.getOrElse(name, () => `snapshot-${taken.length + 1}`)}.txt`;
  if (session.platform === 'ios') yield* booted(place.config, session);
  const tree = yield* driver(place.config, session.platform)(['snapshot']);
  yield* fs.writeFileString(file, tree);
  return outcome(session.platform, { snapshot: file }, { lines: lines(tree) });
});

const encodeReadout = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/**
 * Read the screen as numbers and the caller's own names (iOS): `readout`
 * of the raw snapshot for `ask`, saved as `<out>/reads/<name>.json`, with
 * the count of nodes and of each asked testID's and name's nodes in
 * `detail` (`id=<asked>`, `label=<asked>`). No app's words reach either.
 */
const read = Effect.fn('Sim.read')(function* (place: Place, name: Option.Option<string>, ask: Ask) {
  const fs = yield* FileSystem.FileSystem;
  const session = yield* readSession(place);
  if (session.platform !== 'ios')
    return yield* NotOnPlatform.make({ command: 'read', platform: session.platform });
  const udid = yield* booted(place.config, session);
  const seen = readout(yield* nodesNow(place.config, udid), ask);
  const dir = `${session.out}/reads`;
  yield* fs.makeDirectory(dir, { recursive: true });
  const taken = yield* fs.readDirectory(dir);
  const file = `${dir}/${Option.getOrElse(name, () => `read-${taken.length + 1}`)}.json`;
  yield* fs.writeFileString(file, `${encodeReadout(seen)}\n`);
  return outcome(
    session.platform,
    { read: file },
    {
      nodes: seen.nodes,
      ...Object.fromEntries(
        Object.entries(seen.ids).map(([asked, found]) => [`id=${asked}`, found.length]),
      ),
      ...Object.fromEntries(
        Object.entries(seen.labels).map(([asked, found]) => [`label=${asked}`, found.length]),
      ),
    },
  );
});

/** What `record` does: start a video, or stop and save it. */
export const RECORD = ['start', 'stop'] as const;

/**
 * Record the screen: `start` begins `<out>/video/<name>.mp4` (the
 * simulator) or `.webm` (the browser) through the driver, `stop` saves it.
 * The browser starts muted, so its video has no sound.
 */
const record = Effect.fn('Sim.record')(function* (
  place: Place,
  action: (typeof RECORD)[number],
  name: Option.Option<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const session = yield* readSession(place);
  if (session.platform === 'ios') yield* booted(place.config, session);
  const run = driver(place.config, session.platform);
  if (action === 'stop') {
    yield* run(['record', 'stop'], Duration.minutes(2));
    return outcome(session.platform, {}, { action });
  }
  const dir = `${session.out}/video`;
  yield* fs.makeDirectory(dir, { recursive: true });
  const extension = { ios: 'mp4', web: 'webm' }[session.platform];
  const file = `${dir}/${Option.getOrElse(name, () => 'journey')}.${extension}`;
  yield* run(['record', 'start', file]);
  return outcome(session.platform, { video: file }, { action });
});

/** The app log's file name: the simulator's unified log, or the page's console. */
const LOG_NAME: Record<Platform, string> = { ios: 'app', web: 'console' };

const lines = (text: string) => text.split('\n').filter((line) => line.length > 0).length;

const log = Effect.fn('Sim.log')(function* (place: Place) {
  const fs = yield* FileSystem.FileSystem;
  const session = yield* readSession(place);
  const file = `${session.out}/${LOG_NAME[session.platform]}.log`;
  const text = yield* appLog(place.config, session);
  yield* fs.writeFileString(file, text);
  return outcome(
    session.platform,
    { log: file, server: `${session.out}/server.log` },
    { lines: lines(text) },
  );
});

/** The app's log since boot: the simulator's unified log for its process, or the page's console. */
const appLog = Effect.fn('Sim.appLog')(function* (app: App, session: Session) {
  if (session.platform === 'web') return yield* browser(app, ['console']);
  return yield* deviceLog(app, session, 'compact');
});

/** The simulator's unified log for the app's process since boot, in `style` (`compact` lines or `ndjson` records). */
const deviceLog = Effect.fn('Sim.deviceLog')(function* (
  app: App,
  session: Session,
  style: 'compact' | 'ndjson',
) {
  const udid = yield* booted(app, session);
  const now = yield* DateTime.now;
  const start = DateTime.makeUnsafe(session.bootedAt);
  const since = Math.max(1, Math.ceil(Duration.toSeconds(DateTime.distance(start, now))));
  return yield* succeed(
    'xcrun',
    [
      'simctl',
      'spawn',
      udid,
      'log',
      'show',
      '--style',
      style,
      '--last',
      `${since}s`,
      '--predicate',
      `process == ${quoted(app.ios.logProcess)}`,
    ],
    Duration.minutes(2),
  );
});

/**
 * Close the drive's drivers in the environment they ran in: the child one
 * for a session this driver booted (its HOME made sure of first), whose
 * agent-device daemon is then asked to stop (it checks its own pid and start
 * time), or the caller's for a legacy session, whose shared daemon is left
 * alone. Each step is tried; a tool that fails or is missing is passed
 * over, and the first other failure (a HOME that cannot be used, a refused
 * path) is answered once every step has run.
 */
const closeDrivers = Effect.fn('Sim.closeDrivers')(
  function* (place: Place, session: Session, child: Option.Option<Drivers>) {
    const app = place.config;
    if (Option.isSome(child)) yield* ensureHome(child.value.home);
    const closing = {
      ios: [
        attempt('agent-device', ['close', '--session', app.driverSession], short),
        attempt('xcrun', ['simctl', 'shutdown', session.udid], short),
      ],
      web: [attempt('agent-browser', ['--session', app.driverSession, 'close'], short)],
    } satisfies Record<Platform, ReadonlyArray<unknown>>;
    const steps = [
      ...closing[session.platform],
      ...Option.toArray(
        Option.map(child, () => attempt('agent-device', ['daemon', 'stop'], short)),
      ),
    ];
    const results = yield* Effect.forEach(steps, (step) =>
      Effect.result(
        step.pipe(
          Effect.asVoid,
          Effect.catchTags({ ToolFailed: () => Effect.void, ToolMissing: () => Effect.void }),
        ),
      ),
    );
    const refused = Arr.findFirst(results, Result.isFailure);
    if (Option.isSome(refused)) return yield* refused.value.failure;
  },
  (effect, _place, _session, child) =>
    Effect.provideService(
      effect,
      DriverEnv,
      Option.map(child, (drivers) => drivers.vars),
    ),
);

/**
 * Shut the drive down, holding the state: close its drivers, stop its
 * server by the stop rule when the record names it by identity (a legacy or
 * stale one is not signalled), and only once it is gone file the record
 * away. The record stays in the state through every step before, so a
 * failure, an interruption or an abrupt exit leaves it where the next
 * `down` reads it. Drivers that could not be closed are answered after the
 * server this `down` stopped is gone and its record filed.
 */
const down = Effect.fn('Sim.down')(function* (place: Place) {
  const path = yield* Path.Path;
  return yield* holding(
    place,
    Effect.gen(function* () {
      const file = sessionFile(place);
      const found = yield* readRecord(place.state);
      const session = Option.flatMap(found, (record) => record.session);
      if (Option.isNone(session)) return yield* NoSession.make({ file });
      const booted = session.value;
      yield* admit(booted.out);
      const owned = ownedBy(booted);
      const child = Option.map(owned, () => driversOf(path, place));
      const closed = yield* Effect.result(closeDrivers(place, booted, child));
      const stopped = yield* Option.match(owned, {
        onNone: () => Effect.succeed(false),
        onSome: stop,
      });
      const kept = yield* fileAway(place.state, booted.out);
      if (stopped && Result.isFailure(closed)) return yield* closed.failure;
      return outcome(
        booted.platform,
        { session: kept },
        { serverPid: booted.serverPid, port: booted.port, serverStopped: stopped },
      );
    }),
  );
});

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A pan from a point, or from the centre of a target, by `dx` and `dy` points over `ms`. */
interface Pan {
  readonly from: Point | string;
  readonly dx: number;
  readonly dy: number;
  readonly ms: number;
}

/** The target shows within `seconds`, or the step fails as `TargetMissing`. */
const sees = Effect.fn('Sim.sees')(function* (place: Place, text: string, seconds: number) {
  const session = yield* readSession(place);
  if (session.platform === 'ios') yield* booted(place.config, session);
  yield* present(place.config, session, text, seconds);
});

const Rect = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  width: Schema.Finite,
  height: Schema.Finite,
});
const isRect = Schema.is(Rect);
const isJson = Schema.is(Schema.Json);
const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Json));

/** The first rect in a driver's JSON answer, searched depth first. */
const rectIn = (value: Schema.Json): Option.Option<typeof Rect.Type> => {
  if (isRect(value)) return Option.some(value);
  if (!Predicate.isObject(value)) return Option.none();
  for (const inner of Object.values(value).filter(isJson)) {
    const found = rectIn(inner);
    if (Option.isSome(found)) return found;
  }
  return Option.none();
};

/** The centre of the target's rect on screen, in points, read from agent-device. */
const centreOf = Effect.fn('Sim.centreOf')(function* (app: App, session: Session, text: string) {
  yield* present(app, session, text, 10);
  const answer = yield* device(app, ['get', 'attrs', iosSelector(parseTarget(text)), '--json']);
  const rect = Option.flatMap(decodeJson(answer), rectIn);
  if (Option.isNone(rect))
    return yield* TargetMissing.make({
      target: text,
      platform: session.platform,
      driver: `no rect in the driver's answer: ${answer.slice(0, 400)}`,
    });
  const { x, y, width, height } = rect.value;
  return { x: Math.round(x + width / 2), y: Math.round(y + height / 2) } satisfies Point;
});

/** Pan as a finger does (iOS): from a point or a target's centre, by `dx` and `dy`. */
const gesture = Effect.fn('Sim.gesture')(function* (place: Place, pan: Pan) {
  const session = yield* readSession(place);
  if (session.platform !== 'ios')
    return yield* NotOnPlatform.make({ command: 'gesture', platform: session.platform });
  const app = place.config;
  const udid = yield* booted(app, session);
  let from = pan.from;
  if (Predicate.isString(from)) from = yield* centreOf(app, session, from);
  const numbers = [from.x, from.y, pan.dx, pan.dy, pan.ms].map(String);
  yield* inApp(app, udid, ['gesture', 'pan', ...numbers]);
  return outcome(
    session.platform,
    {},
    { x: from.x, y: from.y, dx: pan.dx, dy: pan.dy, ms: pan.ms },
  );
});

/**
 * Pinch as two fingers do (iOS), centred on a point or a target's centre:
 * `scale` below 1 closes the fingers (a pinch in), above 1 spreads them.
 * agent-device's `gesture pinch` takes no duration.
 */
const pinch = Effect.fn('Sim.pinch')(function* (place: Place, at: Point | string, scale: number) {
  const session = yield* readSession(place);
  if (session.platform !== 'ios')
    return yield* NotOnPlatform.make({ command: 'gesture', platform: session.platform });
  const app = place.config;
  const udid = yield* booted(app, session);
  let centre = at;
  if (Predicate.isString(centre)) centre = yield* centreOf(app, session, centre);
  yield* inApp(app, udid, ['gesture', 'pinch', String(scale), String(centre.x), String(centre.y)]);
  return outcome(session.platform, {}, { x: centre.x, y: centre.y, scale });
});

/** Press and hold the target for `ms` (iOS), then wait `settle` seconds for what it opens. */
const hold = Effect.fn('Sim.hold')(function* (
  place: Place,
  text: string,
  ms: number,
  settle: number,
) {
  const session = yield* readSession(place);
  if (session.platform !== 'ios')
    return yield* NotOnPlatform.make({ command: 'hold', platform: session.platform });
  const app = place.config;
  yield* booted(app, session);
  yield* present(app, session, text, 10);
  yield* device(app, ['longpress', iosSelector(parseTarget(text)), String(ms)]);
  yield* Effect.sleep(Duration.seconds(settle));
  return outcome(session.platform, {}, { target: text, ms, settle });
});

/** Start the app afresh: terminate and launch it (iOS), or reload the page (web). */
const relaunch = Effect.fn('Sim.relaunch')(function* (place: Place) {
  const app = place.config;
  const session = yield* readSession(place);
  if (session.platform === 'ios') {
    const udid = yield* booted(app, session);
    yield* Effect.ignore(succeed('xcrun', ['simctl', 'terminate', udid, app.bundleId], short));
    yield* openApp(app, udid);
  } else yield* browser(app, ['reload']);
  return outcome(session.platform, {}, {});
});

/** The app's container on the simulator: its installed bundle (`app`) or its data (`data`). */
const containerOf = (app: App, udid: string, kind: 'app' | 'data') =>
  Effect.map(
    succeed('xcrun', ['simctl', 'get_app_container', udid, app.bundleId, kind], short),
    (text) => text.trim(),
  );

/**
 * Install the build already installed afresh (iOS): a copy of it is taken
 * into the drive's output, the app is uninstalled, which drops every file it
 * kept, and the copy is installed and launched until its `readyTarget`
 * shows. Nothing is built.
 */
const freshInstall = Effect.fn('Sim.freshInstall')(function* (place: Place, seconds: number) {
  const session = yield* readSession(place);
  if (session.platform === 'web')
    return yield* NotOnPlatform.make({ command: 'journeys', platform: 'web' });
  const config = place.config;
  const udid = yield* booted(config, session);
  const installed = yield* containerOf(config, udid, 'app');
  yield* admit(installed);
  const made = yield* copyApp(config, installed, `${session.out}/fresh`);
  yield* succeed('xcrun', ['simctl', 'uninstall', udid, config.bundleId], Duration.minutes(2));
  yield* succeed('xcrun', ['simctl', 'install', udid, made.app], Duration.minutes(2));
  yield* device(
    config,
    ['open', config.bundleId, '--platform', 'ios', '--udid', udid, '--relaunch'],
    Duration.seconds(seconds),
  );
  yield* present(config, session, config.readyTarget, seconds);
  return outcome('ios', { app: made.app }, { udid, expect: config.readyTarget });
});

/** A text as an SQL string literal. */
const sqlText = (text: string) => `'${text.replaceAll("'", "''")}'`;

/**
 * Set keys in the app's stored settings (iOS): the app is terminated, then
 * each key's value is written into its store (`App.store`) in one
 * transaction. The app stays stopped; the next launch reads them.
 */
const setStore = Effect.fn('Sim.setStore')(function* (
  place: Place,
  values: ReadonlyArray<readonly [string, string]>,
) {
  const session = yield* readSession(place);
  if (session.platform === 'web')
    return yield* NotOnPlatform.make({ command: 'journeys', platform: 'web' });
  const config = place.config;
  const kept = Option.fromNullishOr(config.store);
  if (Option.isNone(kept))
    return yield* Unhealthy.make({
      check: 'store',
      reason: `${config.displayName} names no store of its settings`,
    });
  const store = kept.value;
  const udid = yield* booted(config, session);
  yield* Effect.ignore(succeed('xcrun', ['simctl', 'terminate', udid, config.bundleId], short));
  const data = yield* containerOf(config, udid, 'data');
  yield* admit(data);
  const file = `${data}/${store.file}`;
  const rows = values.map(
    ([key, value]) =>
      `INSERT OR REPLACE INTO ${store.table} (key, value) VALUES (${sqlText(key)}, ${sqlText(value)});`,
  );
  yield* succeed('sqlite3', [file, ['BEGIN;', ...rows, 'COMMIT;'].join(' ')], short);
  return outcome('ios', { store: file }, { keys: values.map(([key]) => key).join(',') });
});

/** How many times, 500 ms apart, `clean` looks for the stopped server's port to come free. */
const PORT_FREE_LOOKS = 10;

/** The pids listening on `port`, as lsof lists them; empty when it is free. */
const listenersOn = (port: number) =>
  Effect.map(attempt('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], short), (done) =>
    done.output.trim(),
  );

/**
 * Delete the build output under the app for good (the app's `cleanPaths`),
 * then check the stopped drive's port is free. A path that leaves the app's
 * folder (`..`, an absolute path, the folder itself), or whose real path is
 * not that path under the app's real path (a symlink, here or above it), is
 * refused before anything is deleted, never followed.
 */
const clean = Effect.fn('Sim.clean')(function* (
  place: Place,
  port: Option.Option<number>,
  platform: Platform,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  for (const rel of place.config.cleanPaths) {
    const inside = path.relative(place.app, path.resolve(place.app, rel));
    if (inside === '' || inside === '..' || inside.startsWith('../') || path.isAbsolute(inside))
      return yield* Unhealthy.make({
        check: 'clean-path',
        reason: `${rel} is not a path inside ${place.app}; nothing was deleted`,
      });
  }
  const app = yield* fs.realPath(place.app);
  const doomed: Record<string, string> = {};
  for (const rel of place.config.cleanPaths) {
    const full = path.join(place.app, rel);
    if (!(yield* fs.exists(full))) continue;
    const real = yield* fs.realPath(full);
    if (real !== path.join(app, rel))
      return yield* Unhealthy.make({
        check: 'clean-path',
        reason: `${full} resolves to ${real}, not to ${path.join(app, rel)}; nothing was deleted`,
      });
    doomed[rel] = full;
  }
  yield* Effect.forEach(Object.values(doomed), (full) => fs.remove(full, { recursive: true }));
  if (Option.isSome(port)) {
    let held = yield* listenersOn(port.value);
    for (let look = 1; held !== '' && look < PORT_FREE_LOOKS; look += 1) {
      yield* Effect.sleep(Duration.millis(500));
      held = yield* listenersOn(port.value);
    }
    if (held !== '')
      return yield* Unhealthy.make({
        check: 'port-free',
        reason: `port ${port.value} is still held by ${held.split('\n').join(', ')}`,
      });
  }
  return outcome(platform, doomed, { removed: Object.keys(doomed).length });
});

/** The parent of `pid`, or none once the chain ends. */
const parentOf = (pid: number) =>
  Effect.map(attempt('ps', ['-o', 'ppid=', '-p', String(pid)], short), (done) => {
    const parent = Number.parseInt(done.output.trim(), 10);
    return Option.liftPredicate(parent, (ppid) => done.exitCode === 0 && ppid > 1);
  });

/** `pid` is `ancestor` or runs under it. */
const descends = Effect.fn('Sim.descends')(function* (pid: number, ancestor: number) {
  let at = Option.some(pid);
  while (Option.isSome(at)) {
    if (at.value === ancestor) return true;
    at = yield* parentOf(at.value);
  }
  return false;
});

/** Lines of the dev server's log that report a failed request or build. */
const FAILURE = /\b(error|failed|5\d\d)\b/i;

/**
 * Read-only checks of the booted drive, in order; the first that fails is
 * the result (`Unhealthy` names it). The server's log is its output and its
 * error output both (`server-log`): a page the server fails to render (an
 * SSR error) answers 200 with an error page and is written to its error
 * output alone. On iOS, once the server's log holds,
 * the app's log since boot is read for the native sources its latest
 * process refused (`native-source`): an install older than the served
 * JavaScript. Load above the core count fails nothing, but `timingsHold`
 * says no timing of this drive claims anything.
 */
const doctor = Effect.fn('Sim.doctor')(function* (place: Place) {
  const fs = yield* FileSystem.FileSystem;
  const session = yield* readSession(place);
  const sick = (check: string, reason: string) => Effect.fail(Unhealthy.make({ check, reason }));
  const owned = ownedBy(session);
  if (Option.isNone(owned))
    return yield* sick(
      'server-pid',
      `the session records no start time for sim serve (pid ${session.serverPid}), so the drive cannot tell it is its own; run sim down, then sim boot`,
    );
  if (!(yield* holds(owned.value)))
    return yield* sick(
      'server-pid',
      `sim serve (pid ${session.serverPid}, started ${owned.value.started}) is not running`,
    );
  const listening = yield* attempt(
    'lsof',
    ['-nP', `-iTCP:${session.port}`, '-sTCP:LISTEN', '-t'],
    short,
  );
  const listeners = listening.output
    .split('\n')
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((pid) => !Number.isNaN(pid));
  const ours = yield* Effect.forEach(listeners, (pid) => descends(pid, session.serverPid));
  if (!ours.includes(true))
    return yield* sick(
      'port-owner',
      `port ${session.port} is held by ${listeners.join(', ') || 'nothing'}, not by sim serve (pid ${session.serverPid})`,
    );
  const status = yield* Effect.option(answers(session.port));
  if (Option.isNone(status))
    return yield* sick('server-answers', `http://127.0.0.1:${session.port}/ does not answer`);
  if (session.platform === 'ios') yield* booted(place.config, session);
  const server = `${session.out}/server.log`;
  const serverErrors = `${session.out}/server.err.log`;
  const logs = [
    { file: server, text: yield* fs.readFileString(server) },
    {
      file: serverErrors,
      text: yield* fs
        .readFileString(serverErrors)
        .pipe(Effect.catchIf(isNotFound, () => Effect.succeed(''))),
    },
  ];
  for (const log of logs) {
    const failures = log.text.split('\n').filter((line) => FAILURE.test(line));
    if (failures.length > 0)
      return yield* sick(
        'server-log',
        `${log.file} reports ${failures.length} failures, first: ${failures[0]}`,
      );
  }
  if (session.platform === 'ios') {
    const refusals = nativeRefusals(yield* deviceLog(place.config, session, 'ndjson'));
    const first = (refusals[0] ?? '')
      .split('\n')
      .find((line) => line.includes('; rebuild the app'));
    if (refusals.length > 0)
      return yield* sick(
        'native-source',
        `the app's latest process refused ${refusals.length} native source(s) its build lacks, first: ${first ?? ''}; the installed build is older than the served JavaScript, so run sim install`,
      );
  }
  const head = yield* succeed('git', ['-C', place.app, 'rev-parse', 'HEAD'], short);
  const audio = yield* attempt('pmset', ['-g', 'assertions'], short);
  const audioHolders = audio.output.split('\n').filter((line) => line.includes('audio-out')).length;
  const load = yield* succeed('sysctl', ['-n', 'vm.loadavg'], short);
  const cores = yield* succeed('sysctl', ['-n', 'hw.ncpu'], short);
  const load1 = Number.parseFloat(load.replace(/[{}]/g, '').trim().split(/\s+/)[0] ?? 'NaN');
  const ncpu = Number.parseInt(cores.trim(), 10);
  return outcome(
    session.platform,
    { server },
    {
      head: head.trim(),
      port: session.port,
      serverPid: session.serverPid,
      udid: session.udid,
      audioHolders,
      load: load1,
      cores: ncpu,
      timingsHold: load1 < ncpu,
    },
  );
});

/** What the live drive's steps need from the host: its contained services and the roots they reach. */
type Host =
  | ChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | Path.Path
  | HttpClient.HttpClient
  | Reach;

/** A step with its host requirements already met, and its drivers' environment chosen (`driverEnv`). */
type Hosted<F> = F extends (...args: infer A) => Effect.Effect<infer X, infer E, Host>
  ? (...args: A) => Effect.Effect<X, E | HostFailed | PlatformError>
  : never;

/** The drive's steps, each taking the place first. */
export interface DriveMembers {
  readonly readSession: Hosted<typeof readSession>;
  readonly boot: Hosted<typeof boot>;
  readonly install: Hosted<typeof install>;
  readonly open: Hosted<typeof open>;
  readonly tap: Hosted<typeof tap>;
  readonly fill: Hosted<typeof fill>;
  readonly back: Hosted<typeof back>;
  readonly scroll: Hosted<typeof scroll>;
  readonly shot: Hosted<typeof shot>;
  readonly snapshot: Hosted<typeof snapshot>;
  readonly read: Hosted<typeof read>;
  readonly record: Hosted<typeof record>;
  readonly log: Hosted<typeof log>;
  readonly doctor: Hosted<typeof doctor>;
  readonly down: Hosted<typeof down>;
  readonly sees: Hosted<typeof sees>;
  readonly gesture: Hosted<typeof gesture>;
  readonly pinch: Hosted<typeof pinch>;
  readonly hold: Hosted<typeof hold>;
  readonly relaunch: Hosted<typeof relaunch>;
  readonly freshInstall: Hosted<typeof freshInstall>;
  readonly setStore: Hosted<typeof setStore>;
  readonly clean: Hosted<typeof clean>;
}

export class Drive extends Context.Service<Drive, DriveMembers>()('@manna/sim/Drive') {}

/**
 * The drive on this host: the simulator, the browser and the dev server.
 * It needs only the platform's services; each step runs over the contained
 * host of its place (`host.ts`), never over the platform's own, with its
 * drivers in the environment of the session it drives (`driverEnv`). Its
 * processes are the `Os` (`os.ts`) the step runs with, or else the one the
 * layer was built with.
 */
export const DriveLive = Layer.effect(
  Drive,
  Effect.gen(function* () {
    const platform = yield* Effect.context<Exclude<Host, Reach>>();
    const built = yield* Os;
    const hosted =
      <A extends readonly [Place, ...Array<unknown>], X, E>(
        step: (...args: A) => Effect.Effect<X, E, Host>,
      ) =>
      (...args: A) =>
        Effect.gen(function* () {
          const os = either(yield* Os, built);
          const inPlace = contain(args[0])(step(...args));
          return yield* Effect.provideContext(inPlace, Context.add(platform, Os, os));
        });
    /** A step that runs the drivers: in the environment of the session the state holds. */
    const driving = <A extends readonly [Place, ...Array<unknown>], X, E>(
      step: (...args: A) => Effect.Effect<X, E, Host>,
    ) =>
      hosted((...args: A) =>
        Effect.flatMap(driverEnv(args[0]), (env) =>
          Effect.provideService(step(...args), DriverEnv, env),
        ),
      );
    return Drive.of({
      readSession: hosted(readSession),
      boot: hosted(boot),
      install: driving(install),
      open: driving(open),
      tap: driving(tap),
      fill: driving(fill),
      back: driving(back),
      scroll: driving(scroll),
      shot: driving(shot),
      snapshot: driving(snapshot),
      read: driving(read),
      record: driving(record),
      log: driving(log),
      doctor: hosted(doctor),
      down: hosted(down),
      sees: driving(sees),
      gesture: driving(gesture),
      pinch: driving(pinch),
      hold: driving(hold),
      relaunch: driving(relaunch),
      freshInstall: driving(freshInstall),
      setStore: hosted(setStore),
      clean: hosted(clean),
    });
  }),
);
