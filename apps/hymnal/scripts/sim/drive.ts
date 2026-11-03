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
  Schema,
  Stream,
} from 'effect';
import { HttpClient } from 'effect/http';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import {
  HostFailed,
  NoSession,
  Unhealthy,
  NotOnPlatform,
  SimulatorDown,
  TargetMissing,
  ToolFailed,
} from './errors.ts';
import { type Platform, Session } from './result.ts';
import { attempt, ready, succeed } from './tools.ts';

export const SIMULATOR = 'verify-hymnal';
const DEVICE_TYPE = 'iPhone 18 Pro';
const BUNDLE_ID = 'im.cvr.hymnal';
export const SCHEME = 'hymnal';
const DRIVER_SESSION = 'verify-hymnal';

const short = Duration.seconds(30);
const build = Duration.minutes(45);

export interface Place {
  readonly app: string;
  readonly state: string;
  readonly script: string;
  readonly features: string;
  readonly warm: ReadonlyArray<string>;
}

export interface Outcome {
  readonly platform: Platform;
  readonly paths: Record<string, string>;
  readonly detail: Record<string, string | number | boolean>;
}

const outcome = (
  platform: Platform,
  paths: Record<string, string>,
  detail: Record<string, string | number | boolean>,
): Outcome => ({ platform, paths, detail });

const SessionJson = Schema.fromJsonString(Session);

const sessionFile = (place: Place) => `${place.state}/session.json`;

export const readSession = Effect.fn('Sim.readSession')(function* (place: Place) {
  const fs = yield* FileSystem.FileSystem;
  const file = sessionFile(place);
  const text = yield* fs.readFileString(file).pipe(Effect.mapError(() => NoSession.make({ file })));
  return yield* Schema.decodeEffect(SessionJson)(text).pipe(
    Effect.mapError(() => NoSession.make({ file })),
  );
});

const writeSession = Effect.fn('Sim.writeSession')(function* (place: Place, session: Session) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(place.state, { recursive: true });
  const text = yield* Schema.encodeEffect(SessionJson)(session).pipe(
    Effect.mapError((error) => HostFailed.make({ reason: error.message })),
  );
  yield* fs.writeFileString(sessionFile(place), text);
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

const devices = Effect.gen(function* () {
  const text = yield* succeed('xcrun', ['simctl', 'list', 'devices', '-j'], short);
  const list = yield* decodeTool(DeviceList, 'xcrun simctl list devices', text);
  return Object.values(list.devices).flat();
});

const named = (name: string) =>
  Effect.map(devices, (all) => Option.fromNullishOr(all.find((device) => device.name === name)));

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

const simulator = Effect.gen(function* () {
  const found = yield* named(SIMULATOR);
  if (Option.isSome(found)) return found.value.udid;
  const id = yield* runtime;
  const udid = yield* succeed('xcrun', ['simctl', 'create', SIMULATOR, DEVICE_TYPE, id], short);
  return udid.trim();
});

const booted = Effect.fn('Sim.booted')(function* (session: Session) {
  const all = yield* devices;
  const device = all.find((entry) => entry.udid === session.udid);
  const state = device?.state ?? 'missing';
  if (state !== 'Booted') return yield* SimulatorDown.make({ name: SIMULATOR, state });
  return session.udid;
});

const bootSimulator = Effect.fn('Sim.bootSimulator')(function* (port: number, seconds: number) {
  const udid = yield* simulator;
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
      BUNDLE_ID,
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

export const serve = Effect.fn('Sim.serve')(function* (place: Place, port: number, out: string) {
  const fs = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  yield* fs.makeDirectory(out, { recursive: true });
  const args = ['dev', '--port', String(port), '--host', '127.0.0.1'];
  const server = yield* Effect.acquireRelease(
    spawner.spawn(
      ChildProcess.make(
        '/bin/sh',
        ['-c', '"$0" "$@"; exit $?', `${place.app}/node_modules/.bin/one`, ...args],
        {
          cwd: place.app,
          forceKillAfter: '5 seconds',
        },
      ),
    ),
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

const startServer = Effect.fn('Sim.startServer')(function* (
  place: Place,
  port: number,
  out: string,
  hermesc: Option.Option<string>,
) {
  const args = [
    place.script,
    'serve',
    '--port',
    String(port),
    '--out',
    out,
    '--state',
    place.state,
  ];
  const background = 'nohup "$0" "$@" >/dev/null 2>&1 & echo $!';
  const command = Option.match(hermesc, {
    onNone: () => ['bun', ...args],
    onSome: (compiler) => ['/usr/bin/env', `HERMESC_PATH=${compiler}`, 'bun', ...args],
  });
  const pid = yield* succeed('/bin/sh', ['-c', background, ...command], short);
  const parsed = Number.parseInt(pid.trim(), 10);
  if (!Number.isInteger(parsed))
    return yield* ToolFailed.make({ tool: '/bin/sh', args, exitCode: 0, output: `no pid: ${pid}` });
  return parsed;
});

const gone = (pid: number) =>
  Effect.gen(function* () {
    const alive = yield* attempt('kill', ['-0', String(pid)], short);
    if (alive.exitCode === 0) return yield* Effect.fail('running');
  });

const stopServer = Effect.fn('Sim.stopServer')(function* (pid: number) {
  yield* attempt('kill', ['-TERM', String(pid)], short);
  yield* ready('the dev server to stop', 15, gone(pid)).pipe(
    Effect.catchTag('ReadinessTimedOut', (error) =>
      Effect.andThen(attempt('kill', ['-KILL', String(pid)], short), Effect.fail(error)),
    ),
  );
});

const serverUp = Effect.fn('Sim.serverUp')(function* (
  place: Place,
  port: number,
  out: string,
  seconds: number,
  hermesc: Option.Option<string>,
) {
  const taken = yield* Effect.isSuccess(answers(port));
  if (taken)
    return yield* ToolFailed.make({
      tool: 'one',
      args: ['dev', '--port', String(port)],
      exitCode: -1,
      output: `port ${port} already answers; pick another of 8270-8279`,
    });
  const pid = yield* startServer(place, port, out, hermesc);
  yield* ready(`the dev server on port ${port}`, seconds, answers(port)).pipe(
    Effect.onError(() => Effect.ignore(stopServer(pid))),
  );
  return pid;
});

interface Target {
  readonly by: 'id' | 'label';
  readonly value: string;
  readonly role: Option.Option<string>;
}

export const parseTarget = (text: string): Target => {
  const unquote = (value: string) => value.replace(/^"(.*)"$/s, '$1');
  const narrowed = /^role=(\w+) (.*)$/s.exec(text);
  const role = Option.fromNullishOr(narrowed?.[1]);
  const rest = narrowed?.[2] ?? text;
  if (rest.startsWith('id=')) return { by: 'id', value: unquote(rest.slice(3)), role };
  if (rest.startsWith('label=')) return { by: 'label', value: unquote(rest.slice(6)), role };
  return { by: 'label', value: rest, role };
};

const quoted = (value: string) => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

const iosSelector = (target: Target) =>
  [
    ...Option.toArray(Option.map(target.role, (role) => `role=${role}`)),
    `${target.by}=${quoted(target.value)}`,
  ].join(' ');

const IMPLICIT = new Map([
  ['link', 'a'],
  ['button', 'button'],
]);

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

const device = (args: ReadonlyArray<string>, limit = short) =>
  succeed('agent-device', [...args, '--session', DRIVER_SESSION], limit);

const openApp = (udid: string, limit = short) =>
  device(['open', BUNDLE_ID, '--platform', 'ios', '--udid', udid], limit);

const inApp = (udid: string, args: ReadonlyArray<string>, limit = short) =>
  device(args, limit).pipe(
    Effect.catchTag('ToolFailed', (failed) => {
      if (!failed.output.includes('SESSION_NOT_FOUND')) return Effect.fail(failed);
      return Effect.andThen(openApp(udid, limit), device(args, limit));
    }),
  );

const MUTED = '--mute-audio,--disable-audio-output';
const browser = (args: ReadonlyArray<string>, limit = short) =>
  succeed('agent-browser', ['--session', DRIVER_SESSION, ...args], limit);

const missingFrom = (session: Session, text: string) => (failed: ToolFailed) =>
  Effect.fail(
    TargetMissing.make({ target: text, platform: session.platform, driver: failed.output }),
  );

const present = Effect.fn('Sim.present')(function* (
  session: Session,
  text: string,
  seconds: number,
) {
  const target = parseTarget(text);
  const missing = missingFrom(session, text);
  const ms = String(Math.round(seconds * 1000));
  if (session.platform === 'ios')
    return yield* device(['wait', iosSelector(target), ms], Duration.seconds(seconds + 10)).pipe(
      Effect.catchTag('ToolFailed', missing),
    );
  return yield* browser(
    ['wait', webSelector(target), '--timeout', ms],
    Duration.seconds(seconds + 10),
  ).pipe(Effect.catchTag('ToolFailed', missing));
});

export interface BootOptions {
  readonly platform: Platform;
  readonly port: number;
  readonly out: Option.Option<string>;
  readonly seconds: number;
  readonly hermesc: Option.Option<string>;
}

const stamp = Effect.map(DateTime.now, (now) => DateTime.formatIso(now));

export const boot = Effect.fn('Sim.boot')(function* (place: Place, options: BootOptions) {
  const path = yield* Path.Path;
  const bootedAt = yield* stamp;
  const out = Option.getOrElse(options.out, () =>
    path.join(place.state, bootedAt.replaceAll(':', '-')),
  );
  const udid = yield* bootSimulatorFor(options);
  const serverPid = yield* serverUp(place, options.port, out, options.seconds, options.hermesc);
  const session: Session = {
    platform: options.platform,
    out,
    port: options.port,
    serverPid,
    udid,
    bootedAt,
  };
  yield* writeSession(place, session);
  if (options.platform === 'web')
    yield* browser(
      ['--args', MUTED, 'open', `http://127.0.0.1:${options.port}/`],
      Duration.seconds(options.seconds),
    );
  return outcome(
    options.platform,
    { session: sessionFile(place), out, server: `${out}/server.log` },
    { udid, port: options.port, serverPid, hermesc: Option.getOrElse(options.hermesc, () => '') },
  );
});

const bootSimulatorFor = (options: BootOptions) => {
  if (options.platform === 'web') return Effect.succeed('');
  return bootSimulator(options.port, options.seconds);
};

const plist = (place: Place) => `${place.app}/ios/Hymnal/Info.plist`;
const PLIST_BUDDY = '/usr/libexec/PlistBuddy';

const registerScheme = Effect.fn('Sim.registerScheme')(function* (file: string) {
  const read = yield* attempt(
    PLIST_BUDDY,
    ['-c', 'Print :CFBundleURLTypes:0:CFBundleURLSchemes:0', file],
    short,
  );
  if (read.exitCode === 0 && read.output.trim() === SCHEME) return false;
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
      `Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string ${SCHEME}`,
      file,
    ],
    short,
  );
  return true;
});

const buildApp = Effect.fn('Sim.buildApp')(function* (
  place: Place,
  out: string,
  prebuild: boolean,
) {
  const fs = yield* FileSystem.FileSystem;
  const ios = `${place.app}/ios`;
  const hasIos = yield* fs.exists(`${ios}/Hymnal.xcworkspace`);
  if (prebuild || !hasIos)
    yield* succeed('bun', ['run', '--cwd', place.app, 'prebuild:native'], Duration.minutes(5));
  const registered = yield* registerScheme(plist(place));
  const args = [
    '-workspace',
    `${ios}/Hymnal.xcworkspace`,
    '-scheme',
    'Hymnal',
    '-configuration',
    'Debug',
    '-destination',
    'generic/platform=iOS Simulator',
    '-derivedDataPath',
    `${ios}/build/dd`,
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
  return { app: `${ios}/build/dd/Build/Products/Debug-iphonesimulator/Hymnal.app`, registered };
});

const copyApp = Effect.fn('Sim.copyApp')(function* (given: string, out: string) {
  const fs = yield* FileSystem.FileSystem;
  const app = `${out}/Hymnal.app`;
  yield* fs.makeDirectory(out, { recursive: true });
  yield* fs.copy(given, app, { overwrite: true });
  const registered = yield* registerScheme(`${app}/Info.plist`);
  yield* succeed(
    'codesign',
    ['--force', '--sign', '-', '--preserve-metadata=entitlements', app],
    Duration.minutes(2),
  );
  return { app, registered };
});

export interface InstallOptions {
  readonly app: Option.Option<string>;
  readonly prebuild: boolean;
  readonly expect: string;
  readonly seconds: number;
}

export const install = Effect.fn('Sim.install')(function* (place: Place, options: InstallOptions) {
  const { app, expect, seconds } = options;
  const session = yield* readSession(place);
  if (session.platform === 'web')
    return yield* NotOnPlatform.make({ command: 'install', platform: 'web' });
  const udid = yield* booted(session);
  const started = yield* Clock.currentTimeMillis;
  const made = yield* Option.match(app, {
    onSome: (given) => copyApp(given, session.out),
    onNone: () => buildApp(place, session.out, options.prebuild),
  });
  const builtMs = (yield* Clock.currentTimeMillis) - started;
  yield* succeed('xcrun', ['simctl', 'install', udid, made.app], Duration.minutes(2));
  yield* device(
    ['open', BUNDLE_ID, '--platform', 'ios', '--udid', udid, '--relaunch'],
    Duration.seconds(seconds),
  );
  yield* present(session, expect, seconds);
  return outcome(
    'ios',
    { app: made.app, build: `${session.out}/build.log` },
    { udid, buildMs: builtMs, schemeAdded: made.registered, expect },
  );
});

export const linkFor = (platform: Platform, port: number, link: string) => {
  const route = link.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^\//, '');
  if (platform === 'ios') return `${SCHEME}://${route}`;
  return `http://127.0.0.1:${port}/${route}`;
};

const OPEN_PROMPT = 'label="Open in “Hymnal”?"';

const confirmOpen = Effect.fn('Sim.confirmOpen')(function* (session: Session) {
  let answered = 0;
  while (answered < 3) {
    const asked = yield* attempt(
      'agent-device',
      ['wait', OPEN_PROMPT, '3000', '--session', DRIVER_SESSION],
      short,
    );
    if (asked.exitCode !== 0) return answered;
    yield* present(session, 'label=Open', 5);
    yield* device(['press', 'label="Open"', '--settle']);
    answered += 1;
  }
  return answered;
});

export interface OpenOptions {
  readonly terminate?: boolean;
}

export const open = Effect.fn('Sim.open')(function* (
  place: Place,
  link: string,
  expect: Option.Option<string>,
  seconds: number,
  options: OpenOptions = {},
) {
  const session = yield* readSession(place);
  const url = linkFor(session.platform, session.port, link);
  let prompts = 0;
  if (session.platform === 'ios') {
    const udid = yield* booted(session);
    if (options.terminate === true)
      yield* Effect.ignore(succeed('xcrun', ['simctl', 'terminate', udid, BUNDLE_ID], short));
    yield* openApp(udid, Duration.seconds(seconds));
    yield* succeed('xcrun', ['simctl', 'openurl', udid, url], short);
    prompts = yield* confirmOpen(session);
  } else yield* browser(['open', url], Duration.seconds(seconds));
  if (Option.isSome(expect)) yield* present(session, expect.value, seconds);
  return outcome(
    session.platform,
    {},
    { url, prompts, expect: Option.getOrElse(expect, () => '') },
  );
});

export const tap = Effect.fn('Sim.tap')(function* (place: Place, text: string, seconds: number) {
  const session = yield* readSession(place);
  if (session.platform === 'ios') yield* booted(session);
  yield* present(session, text, seconds);
  const target = parseTarget(text);
  if (session.platform === 'ios') yield* device(['press', iosSelector(target), '--settle']);
  else yield* browser(['click', webSelector(target)]);
  return outcome(session.platform, {}, { target: text });
});

export const fill = Effect.fn('Sim.fill')(function* (
  place: Place,
  text: string,
  value: string,
  seconds: number,
) {
  const session = yield* readSession(place);
  if (session.platform === 'ios') yield* booted(session);
  yield* present(session, text, seconds);
  const target = parseTarget(text);
  if (session.platform === 'ios') yield* device(['fill', iosSelector(target), value, '--settle']);
  else yield* browser(['fill', webSelector(target), value]);
  return outcome(session.platform, {}, { target: text, value });
});

export const back = Effect.fn('Sim.back')(function* (place: Place) {
  const session = yield* readSession(place);
  if (session.platform === 'ios') {
    const udid = yield* booted(session);
    yield* inApp(udid, ['back', '--in-app', '--settle']);
  } else yield* browser(['back']);
  return outcome(session.platform, {}, {});
});

export const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
export type Direction = (typeof DIRECTIONS)[number];

const STEP: Record<Direction, readonly [number, number]> = {
  up: [0, -600],
  down: [0, 600],
  left: [-600, 0],
  right: [600, 0],
};

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

export const scroll = Effect.fn('Sim.scroll')(function* (
  place: Place,
  text: string,
  direction: Direction,
  seconds: number,
) {
  const session = yield* readSession(place);
  if (session.platform === 'ios') {
    const udid = yield* booted(session);
    if (text === 'screen') yield* inApp(udid, ['scroll', direction, '--settle']);
    else
      yield* inApp(
        udid,
        ['scroll', direction, '--until', iosSelector(parseTarget(text))],
        Duration.seconds(seconds + 30),
      ).pipe(Effect.catchTag('ToolFailed', missingFrom(session, text)));
  } else if (text === 'screen') yield* browser(['eval', scrollScript(direction)]);
  else {
    yield* present(session, text, seconds);
    yield* browser(['scrollintoview', webSelector(parseTarget(text))]);
  }
  return outcome(session.platform, {}, { target: text, direction });
});

export const shot = Effect.fn('Sim.shot')(function* (place: Place, name: Option.Option<string>) {
  const fs = yield* FileSystem.FileSystem;
  const session = yield* readSession(place);
  const dir = `${session.out}/shots`;
  yield* fs.makeDirectory(dir, { recursive: true });
  const taken = yield* fs.readDirectory(dir);
  const file = `${dir}/${Option.getOrElse(name, () => `shot-${taken.length + 1}`)}.png`;
  if (session.platform === 'ios') {
    const udid = yield* booted(session);
    yield* succeed('xcrun', ['simctl', 'io', udid, 'screenshot', file], short);
  } else yield* browser(['screenshot', file]);
  return outcome(session.platform, { shot: file }, {});
});

export const snapshot = Effect.fn('Sim.snapshot')(function* (
  place: Place,
  name: Option.Option<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const session = yield* readSession(place);
  const dir = `${session.out}/snapshots`;
  yield* fs.makeDirectory(dir, { recursive: true });
  const taken = yield* fs.readDirectory(dir);
  const file = `${dir}/${Option.getOrElse(name, () => `snapshot-${taken.length + 1}`)}.txt`;
  if (session.platform === 'ios') yield* booted(session);
  const tree = yield* { ios: device, web: browser }[session.platform](['snapshot']);
  yield* fs.writeFileString(file, tree);
  return outcome(session.platform, { snapshot: file }, { lines: lines(tree) });
});

export const RECORD = ['start', 'stop'] as const;

export const record = Effect.fn('Sim.record')(function* (
  place: Place,
  action: (typeof RECORD)[number],
  name: Option.Option<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const session = yield* readSession(place);
  if (session.platform === 'ios') yield* booted(session);
  const run = { ios: device, web: browser }[session.platform];
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

const LOG_NAME: Record<Platform, string> = { ios: 'app', web: 'console' };

const lines = (text: string) => text.split('\n').filter((line) => line.length > 0).length;

export const log = Effect.fn('Sim.log')(function* (place: Place) {
  const fs = yield* FileSystem.FileSystem;
  const session = yield* readSession(place);
  const file = `${session.out}/${LOG_NAME[session.platform]}.log`;
  const text = yield* appLog(session);
  yield* fs.writeFileString(file, text);
  return outcome(
    session.platform,
    { log: file, server: `${session.out}/server.log` },
    { lines: lines(text) },
  );
});

const appLog = Effect.fn('Sim.appLog')(function* (session: Session) {
  if (session.platform === 'web') return yield* browser(['console']);
  const udid = yield* booted(session);
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
      'compact',
      '--last',
      `${since}s`,
      '--predicate',
      'process == "Hymnal"',
    ],
    Duration.minutes(2),
  );
});

export const down = Effect.fn('Sim.down')(function* (place: Place) {
  const fs = yield* FileSystem.FileSystem;
  const session = yield* readSession(place);
  if (session.platform === 'ios') {
    yield* Effect.ignore(attempt('agent-device', ['close', '--session', DRIVER_SESSION], short));
    yield* Effect.ignore(attempt('xcrun', ['simctl', 'shutdown', session.udid], short));
  } else
    yield* Effect.ignore(attempt('agent-browser', ['--session', DRIVER_SESSION, 'close'], short));
  yield* stopServer(session.serverPid);
  yield* fs.makeDirectory(session.out, { recursive: true });
  const kept = `${session.out}/session.json`;
  yield* fs.rename(sessionFile(place), kept);
  return outcome(
    session.platform,
    { session: kept },
    { serverPid: session.serverPid, port: session.port },
  );
});

export const CLEAN_PATHS: ReadonlyArray<string> = ['ios/build', 'ios/Pods', 'dist'];

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Pan {
  readonly from: Point | string;
  readonly dx: number;
  readonly dy: number;
  readonly ms: number;
}

export const sees = Effect.fn('Sim.sees')(function* (place: Place, text: string, seconds: number) {
  const session = yield* readSession(place);
  if (session.platform === 'ios') yield* booted(session);
  yield* present(session, text, seconds);
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

const rectIn = (value: Schema.Json): Option.Option<typeof Rect.Type> => {
  if (isRect(value)) return Option.some(value);
  if (!Predicate.isObject(value)) return Option.none();
  for (const inner of Object.values(value).filter(isJson)) {
    const found = rectIn(inner);
    if (Option.isSome(found)) return found;
  }
  return Option.none();
};

const centreOf = Effect.fn('Sim.centreOf')(function* (session: Session, text: string) {
  yield* present(session, text, 10);
  const answer = yield* device(['get', 'attrs', iosSelector(parseTarget(text)), '--json']);
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

export const gesture = Effect.fn('Sim.gesture')(function* (place: Place, pan: Pan) {
  const session = yield* readSession(place);
  if (session.platform !== 'ios')
    return yield* NotOnPlatform.make({ command: 'gesture', platform: session.platform });
  const udid = yield* booted(session);
  let from = pan.from;
  if (Predicate.isString(from)) from = yield* centreOf(session, from);
  const numbers = [from.x, from.y, pan.dx, pan.dy, pan.ms].map(String);
  yield* inApp(udid, ['gesture', 'pan', ...numbers]);
  return outcome(
    session.platform,
    {},
    { x: from.x, y: from.y, dx: pan.dx, dy: pan.dy, ms: pan.ms },
  );
});

export const pinch = Effect.fn('Sim.pinch')(function* (
  place: Place,
  at: Point | string,
  scale: number,
) {
  const session = yield* readSession(place);
  if (session.platform !== 'ios')
    return yield* NotOnPlatform.make({ command: 'gesture', platform: session.platform });
  const udid = yield* booted(session);
  let centre = at;
  if (Predicate.isString(centre)) centre = yield* centreOf(session, centre);
  yield* inApp(udid, ['gesture', 'pinch', String(scale), String(centre.x), String(centre.y)]);
  return outcome(session.platform, {}, { x: centre.x, y: centre.y, scale });
});

export const hold = Effect.fn('Sim.hold')(function* (
  place: Place,
  text: string,
  ms: number,
  settle: number,
) {
  const session = yield* readSession(place);
  if (session.platform !== 'ios')
    return yield* NotOnPlatform.make({ command: 'hold', platform: session.platform });
  yield* booted(session);
  yield* present(session, text, 10);
  yield* device(['longpress', iosSelector(parseTarget(text)), String(ms)]);
  yield* Effect.sleep(Duration.seconds(settle));
  return outcome(session.platform, {}, { target: text, ms, settle });
});

export const relaunch = Effect.fn('Sim.relaunch')(function* (place: Place) {
  const session = yield* readSession(place);
  if (session.platform === 'ios') {
    const udid = yield* booted(session);
    yield* Effect.ignore(succeed('xcrun', ['simctl', 'terminate', udid, BUNDLE_ID], short));
    yield* openApp(udid);
  } else yield* browser(['reload']);
  return outcome(session.platform, {}, {});
});

const PORT_FREE_LOOKS = 10;

const listenersOn = (port: number) =>
  Effect.map(attempt('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], short), (done) =>
    done.output.trim(),
  );

export const clean = Effect.fn('Sim.clean')(function* (
  place: Place,
  port: Option.Option<number>,
  platform: Platform,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const app = yield* fs.realPath(place.app);
  const doomed: Record<string, string> = {};
  for (const rel of CLEAN_PATHS) {
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

const parentOf = (pid: number) =>
  Effect.map(attempt('ps', ['-o', 'ppid=', '-p', String(pid)], short), (done) => {
    const parent = Number.parseInt(done.output.trim(), 10);
    return Option.liftPredicate(parent, (ppid) => done.exitCode === 0 && ppid > 1);
  });

const descends = Effect.fn('Sim.descends')(function* (pid: number, ancestor: number) {
  let at = Option.some(pid);
  while (Option.isSome(at)) {
    if (at.value === ancestor) return true;
    at = yield* parentOf(at.value);
  }
  return false;
});

const FAILURE = /\b(error|failed|5\d\d)\b/i;

export const doctor = Effect.fn('Sim.doctor')(function* (place: Place) {
  const fs = yield* FileSystem.FileSystem;
  const session = yield* readSession(place);
  const sick = (check: string, reason: string) => Effect.fail(Unhealthy.make({ check, reason }));
  const alive = yield* attempt('kill', ['-0', String(session.serverPid)], short);
  if (alive.exitCode !== 0)
    return yield* sick('server-pid', `sim serve (pid ${session.serverPid}) is not running`);
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
  if (session.platform === 'ios') yield* booted(session);
  const server = `${session.out}/server.log`;
  const serverText = yield* fs.readFileString(server);
  const failures = serverText.split('\n').filter((line) => FAILURE.test(line));
  if (failures.length > 0)
    return yield* sick(
      'server-log',
      `${server} reports ${failures.length} failures, first: ${failures[0]}`,
    );
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

type Host =
  | ChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | Path.Path
  | HttpClient.HttpClient;

type Hosted<F> = F extends (...args: infer A) => Effect.Effect<infer X, infer E, Host>
  ? (...args: A) => Effect.Effect<X, E>
  : never;

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
  readonly record: Hosted<typeof record>;
  readonly log: Hosted<typeof log>;
  readonly doctor: Hosted<typeof doctor>;
  readonly down: Hosted<typeof down>;
  readonly sees: Hosted<typeof sees>;
  readonly gesture: Hosted<typeof gesture>;
  readonly pinch: Hosted<typeof pinch>;
  readonly hold: Hosted<typeof hold>;
  readonly relaunch: Hosted<typeof relaunch>;
  readonly clean: Hosted<typeof clean>;
}

export class Drive extends Context.Service<Drive, DriveMembers>()('@manna/hymnal-app/sim/Drive') {}

export const DriveLive = Layer.effect(
  Drive,
  Effect.gen(function* () {
    const host = yield* Effect.context<Host>();
    const hosted =
      <A extends ReadonlyArray<unknown>, X, E>(step: (...args: A) => Effect.Effect<X, E, Host>) =>
      (...args: A) =>
        Effect.provideContext(step(...args), host);
    return Drive.of({
      readSession: hosted(readSession),
      boot: hosted(boot),
      install: hosted(install),
      open: hosted(open),
      tap: hosted(tap),
      fill: hosted(fill),
      back: hosted(back),
      scroll: hosted(scroll),
      shot: hosted(shot),
      snapshot: hosted(snapshot),
      record: hosted(record),
      log: hosted(log),
      doctor: hosted(doctor),
      down: hosted(down),
      sees: hosted(sees),
      gesture: hosted(gesture),
      pinch: hosted(pinch),
      hold: hosted(hold),
      relaunch: hosted(relaunch),
      clean: hosted(clean),
    });
  }),
);
