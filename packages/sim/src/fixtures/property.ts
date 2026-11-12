/**
 * The App property's harness: seeded generated apps and explicit edge apps,
 * and the checks each must pass. For every app, `sim`'s parsing takes the
 * app's ports, default port, readiness target and platforms (and the
 * caller's flags over them) and refuses the rest before any Drive call; the
 * live Drive, over a stand-in spawner, filesystem and dev server, asks each
 * tool for exactly the command this file writes out by hand from the app's
 * fields; every file it reads or writes lies under the place's app, state or
 * output; and `clean` refuses a path that leaves the app, or a symlink out of
 * it, before it deletes anything. No step runs a tool or touches a real
 * file: every simulator, `verify-probe-*` among them, lives in the stand-in.
 *
 * Every case's steps run in one process through one `DriveLive`, case after
 * case and the first again at the end, so a value one app left behind shows
 * in the next app's commands.
 */
import * as BunServices from '@effect/platform-bun/BunServices';
import {
  ByteSize,
  Console,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Schema,
  Sink,
  Stream,
} from 'effect';
import { HttpClient, HttpClientError, HttpClientResponse } from 'effect/http';
import * as PlatformError from 'effect/PlatformError';
import { ChildProcessSpawner } from 'effect/process';

import { App, defineApp } from '../app.ts';
import { runSim } from '../command.ts';
import { Drive, type DriveMembers, DriveLive, type Outcome, type Place } from '../drive.ts';
import type { Platform } from '../result.ts';

/** The start's two shell scripts stand in a plan by these names (`scriptless`). */
const START = '<start>';
const BECOME = '<become>';

/** An app, and what this file expects of it, written here rather than taken from the driver. */
export interface Case {
  readonly app: App;
  /** The native folder relative to the app: the workspace's folder, empty when it sits at the top. */
  readonly native: string;
  /** agent-device's selector for the app's readiness target. */
  readonly ready: string;
}

const ROOT = '/nonexistent/loop-probe-x';
const UDID = 'PROBE-UDID';
const RUNTIME = 'com.apple.CoreSimulator.SimRuntime.iOS-27-0';
const PLIST = '/usr/libexec/PlistBuddy';
const MUTED = '--mute-audio,--disable-audio-output';
const BOOTED_AT = '2026-10-21T00:00:00.000Z';
/** The start time `ps` reads for the stand-in server until a `kill` reaches it, and for the command itself. */
const STARTED = 'Wed Oct 21 00:00:00 2026';
/** The stand-in server's pid. */
const SERVER = '4242';
/** How the command's own identity read (`Os.self`) is written down: the test process's pid is no app's value. */
const SELF = 'self';
/** The file of its own a record write goes through, its random name written down as one. */
const OWN = /\/session\.[a-z0-9]+\.writing$/;

/** What `lstat` finds at the drivers' HOME: a private folder. */
const DIRECTORY: FileSystem.File.Info = {
  type: 'Directory',
  mtime: Option.none(),
  atime: Option.none(),
  birthtime: Option.none(),
  dev: 0n,
  ino: Option.none(),
  mode: 0o700,
  nlink: Option.none(),
  uid: Option.none(),
  gid: Option.none(),
  rdev: Option.none(),
  size: ByteSize.bytes(0),
  blksize: Option.none(),
  blocks: Option.none(),
};

/** Words with spaces, quotes, a backslash and a letter past ASCII, and none a real app's. */
const WORDS = [
  'Atlas',
  'Quiet Field',
  `O'Neil "Q"`,
  'Røde Mark',
  'back\\slash',
  'Cedar',
  'North Star 7',
] as const;

/** The same LCG for every run: case `n` is the same app on every run. */
const random = (seed: number) => {
  let state = seed + 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 8;
  };
};

/** A double-quoted selector value, written out here: backslashes and quotes escaped. */
const quote = (value: string) => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

/** `count` apps, each field drawn on its own from case `n`'s seed. */
export const generatedCases = (count: number): ReadonlyArray<Case> =>
  Array.from({ length: count }, (_, n) => {
    const rand = random(n);
    const pick = <A>(items: readonly [A, ...Array<A>]): A =>
      items[rand() % items.length] ?? items[0];
    const word = () => pick(WORDS);
    const width = pick([0, 0, 1, 3, 9]);
    const min = Math.min(1 + (rand() % 65535), 65535 - width);
    const kind = pick(['label', 'id', 'bare'] as const);
    const target = `${word()} ${n}`;
    const native = pick(['ios', 'native app', `apps/x ${n}/ios`, '']);
    const workspace = [native, `${word()} WS${n}.xcworkspace`].filter(Boolean).join('/');
    const cleanable = [`${native || 'native'}/build`, 'dist', `out ${n}`, `it's/x ${n}`];
    const app = defineApp({
      displayName: `the ${word()} ${n}`,
      simulator: `verify-probe-${n}${pick(['', ' Mini', '-b'])}`,
      deviceType: pick(['iPhone 17', 'iPhone 18 Pro', 'iPad (A16)', `Probe Phone ${n}`]),
      bundleId: `${pick(['app', 'org', 'dev-x', 'C0'])}.${pick(['probe', 'x-y', 'Q9'])}${n}${pick(['', '.Tool', '.a-b.c'])}`,
      urlScheme: `${pick(['p', 'Z', 'scheme'])}${n}${pick(['', '+x', '.y', '-z', '+a.b-c'])}`,
      driverSession: pick([`session ${word()} ${n}`, `s-${n}`]),
      ports: { min, max: min + width, default: min + (rand() % (width + 1)) },
      readyTarget: { label: `label=${target}`, id: `id=${target}`, bare: target }[kind],
      platforms: pick<ReadonlyArray<Platform>>([['ios'], ['ios', 'web'], ['web', 'ios']]),
      ios: {
        workspace,
        scheme: `${word()}${n}`,
        app: `${word()} ${n}.app`,
        infoPlist: `${pick(['ios', 'Info Dir', `plist ${n}/inner`])}/Info.plist`,
        logProcess: `${word()}${n}`,
      },
      openPrompt: `label="Open in “${word()} ${n}”?"`,
      cleanPaths: cleanable.slice(0, rand() % (cleanable.length + 1)),
    });
    return {
      app,
      native,
      ready: `${{ label: 'label', id: 'id', bare: 'label' }[kind]}=${quote(target)}`,
    };
  });

/** The edges: the lowest and highest ports, one-port and ten-port ranges at each end, and a Heartseed-shaped app. */
export const explicitCases = (base: Case): ReadonlyArray<Case> => [
  ...[
    { min: 1, max: 1, default: 1 },
    { min: 65535, max: 65535, default: 65535 },
    { min: 1, max: 10, default: 1 },
    { min: 65526, max: 65535, default: 65535 },
    { min: 1, max: 10, default: 10 },
  ].map((ports) => ({ ...base, app: defineApp({ ...base.app, ports }) })),
  {
    native: 'ios',
    ready: 'label="Today"',
    app: defineApp({
      displayName: 'Heartseed',
      simulator: 'verify-heartseed',
      deviceType: 'iPhone 17',
      bundleId: 'app.heartseed',
      urlScheme: 'heartseed',
      driverSession: 'verify-heartseed',
      ports: { min: 8280, max: 8289, default: 8280 },
      readyTarget: 'label=Today',
      platforms: ['ios'],
      ios: {
        workspace: 'ios/Heartseed.xcworkspace',
        scheme: 'Heartseed',
        app: 'Heartseed.app',
        infoPlist: 'ios/Heartseed/Info.plist',
        logProcess: 'Heartseed',
      },
      openPrompt: 'label="Open in “Heartseed”?"',
      cleanPaths: ['ios/build', 'ios/Pods', 'dist'],
    }),
  },
];

/** Values outside `App`'s domain, one field at a time: each must be refused. */
export const invalid = (app: App): ReadonlyArray<readonly [string, unknown]> => [
  ['ports min above max', { ...app, ports: { min: 10, max: 9, default: 9 } }],
  ['default below min', { ...app, ports: { min: 10, max: 12, default: 9 } }],
  ['default above max', { ...app, ports: { min: 10, max: 12, default: 13 } }],
  ['port 0', { ...app, ports: { min: 0, max: 2, default: 1 } }],
  ['port 65536', { ...app, ports: { min: 65530, max: 65536, default: 65530 } }],
  ['port 1.5', { ...app, ports: { min: 1.5, max: 3, default: 2 } }],
  ['no platform', { ...app, platforms: [] }],
  ['web only', { ...app, platforms: ['web'] }],
  ['ios twice', { ...app, platforms: ['ios', 'ios'] }],
  ['android', { ...app, platforms: ['ios', 'android'] }],
  ['clean ..', { ...app, cleanPaths: ['../outside'] }],
  ['clean inner ..', { ...app, cleanPaths: ['a/../../b'] }],
  ['clean absolute', { ...app, cleanPaths: ['/etc/x'] }],
  ['clean the app', { ...app, cleanPaths: ['.'] }],
  ['clean empty', { ...app, cleanPaths: [''] }],
  ['bundle id one part', { ...app, bundleId: 'probe' }],
  ['bundle id empty part', { ...app, bundleId: 'app..probe' }],
  ['bundle id slash', { ...app, bundleId: 'app.pro/be' }],
  ['scheme digit first', { ...app, urlScheme: '1probe' }],
  ['scheme space', { ...app, urlScheme: 'pro be' }],
  ['scheme with ://', { ...app, urlScheme: 'probe://' }],
  ['workspace no .xcworkspace', { ...app, ios: { ...app.ios, workspace: 'ios/P.xcodeproj' } }],
  ['workspace ..', { ...app, ios: { ...app.ios, workspace: '../P.xcworkspace' } }],
  ['app no .app', { ...app, ios: { ...app.ios, app: 'Probe' } }],
  ['app in a folder', { ...app, ios: { ...app.ios, app: 'x/Probe.app' } }],
  ['app .app alone', { ...app, ios: { ...app.ios, app: '.app' } }],
  ['plist absolute', { ...app, ios: { ...app.ios, infoPlist: '/etc/Info.plist' } }],
  ['empty display name', { ...app, displayName: '' }],
  ['empty simulator', { ...app, simulator: '' }],
  ['empty session', { ...app, driverSession: '' }],
  ['empty ready target', { ...app, readyTarget: '' }],
  ['empty open prompt', { ...app, openPrompt: '' }],
  ['empty log process', { ...app, ios: { ...app.ios, logProcess: '' } }],
];

/** Clean paths that leave the app, given to `clean` past `App`'s check. */
export const ESCAPES: ReadonlyArray<string> = ['../outside', 'a/../../b', '/etc/x', '', '.', '..'];

interface Answer {
  readonly exitCode: number;
  readonly stdout: string;
}

/** What the stand-in host holds for one step: its answers, and what the step asked of it. */
interface World {
  readonly runs: Array<ReadonlyArray<string>>;
  readonly touched: Array<string>;
  serving: boolean;
  /** The answer to a run, given every run of the step so far (this one last). */
  readonly answer: (
    argv: ReadonlyArray<string>,
    runs: ReadonlyArray<ReadonlyArray<string>>,
  ) => Answer;
  readonly session: string;
  readonly exists: boolean;
  readonly real: (path: string) => string;
}

const ok = (stdout = ''): Answer => ({ exitCode: 0, stdout });
const failed: Answer = { exitCode: 1, stdout: '' };

const world = (setup: Partial<World>): World => ({
  runs: [],
  touched: [],
  serving: false,
  answer: () => ok(),
  session: '',
  exists: false,
  real: (path) => path,
  ...setup,
});

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.toType(Schema.Unknown)));

/** The host every step of every case runs on: one spawner, filesystem and dev server, each reading the step's world. */
const standInHost = () => {
  const host = { world: world({}) };
  const touch = (op: string, path: string) =>
    void host.world.touched.push(`${op} ${path.replace(OWN, '/session.<own>.writing')}`);
  const spawner = Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) =>
      Effect.sync(() => {
        const argv: Array<string> = [command._tag];
        if (command._tag === 'StandardCommand')
          argv.splice(0, 1, command.command, ...command.args.map(String));
        const startRead = argv[0] === 'ps' && argv.includes('lstart=');
        if (startRead && argv.at(-1) !== SERVER) argv.splice(-1, 1, SELF);
        host.world.runs.push(argv);
        let answer = host.world.answer(argv, host.world.runs);
        if (argv[0] === '/bin/sh') {
          host.world.serving = true;
          answer = ok(`${SERVER} ${STARTED}\n`);
        }
        if (startRead) {
          const killed = host.world.runs.some((run) => run[0] === 'kill');
          answer = ok(`${STARTED}\n`);
          if (argv.at(-1) === SERVER && killed) answer = failed;
        }
        const stdout = Stream.encodeText(Stream.make(answer.stdout));
        return ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(4242),
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
      }),
    ),
  );
  const files = FileSystem.layerNoop({
    readFileString: (path) =>
      Effect.suspend(() => {
        touch('read', path);
        if (host.world.session === '')
          return Effect.fail(
            PlatformError.systemError({
              _tag: 'NotFound',
              module: 'FileSystem',
              method: 'readFileString',
              pathOrDescriptor: path,
            }),
          );
        return Effect.succeed(host.world.session);
      }),
    writeFileString: (path) => Effect.sync(() => touch('write', path)),
    makeDirectory: (path) => Effect.sync(() => touch('mkdir', path)),
    readDirectory: () => Effect.succeed([]),
    symlink: (_target, path) => Effect.sync(() => touch('symlink', path)),
    link: (from, to) =>
      Effect.sync(() => {
        touch('link-from', from);
        touch('link', to);
      }),
    lstat: () => Effect.succeed(DIRECTORY),
    chmod: (path) => Effect.sync(() => touch('chmod', path)),
    exists: (path) =>
      Effect.sync(() => {
        touch('exists', path);
        return host.world.exists;
      }),
    copy: (from, to) =>
      Effect.sync(() => {
        touch('copy-from', from);
        touch('copy', to);
      }),
    realPath: (path) =>
      Effect.sync(() => {
        touch('real', path);
        return host.world.real(path);
      }),
    remove: (path) => Effect.sync(() => touch('remove', path)),
    rename: (from, to) =>
      Effect.sync(() => {
        touch('rename-from', from);
        touch('rename', to);
      }),
  });
  const server = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) => {
      if (host.world.serving)
        return Effect.succeed(
          HttpClientResponse.fromWeb(request, new Response('', { status: 200 })),
        );
      return Effect.fail(
        new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({ request, description: 'refused' }),
        }),
      );
    }),
  );
  const live = Layer.provideMerge(DriveLive, Layer.mergeAll(spawner, files, server, Path.layer));
  return { host, live };
};

/** One step the live Drive takes for a case, and what it must ask of the host. */
interface Step {
  readonly name: string;
  readonly world: Partial<World>;
  readonly run: (drive: DriveMembers) => Effect.Effect<unknown, unknown>;
  readonly runs: ReadonlyArray<ReadonlyArray<string>>;
  readonly touched: ReadonlyArray<string>;
  /** The error tag (and fields) the step fails with; no fields when it succeeds. */
  readonly fails?: Readonly<Record<string, string>>;
}

export const placeOf = (app: App, n: number): Place => ({
  app: `${ROOT}/apps/app ${n}`,
  state: `${ROOT}/state ${n}`,
  script: `${ROOT}/apps/app ${n}/scripts/sim.ts`,
  features: `${ROOT}/features ${n}`,
  warm: [],
  config: app,
});

const sessionOf = (app: App, place: Place, platform: Platform) =>
  encodeJson({
    platform,
    out: `${place.state}/out`,
    port: app.ports.default,
    serverPid: 4242,
    udid: { ios: UDID, web: '' }[platform],
    bootedAt: BOOTED_AT,
    serverStarted: STARTED,
    home: `${place.state}/home`,
  });

/** Each step of the drive for case `n`, with the commands and files written out from its fields. */
const stepsOf = (c: Case, n: number): ReadonlyArray<Step> => {
  const { app } = c;
  const place = placeOf(app, n);
  const out = `${place.state}/out`;
  const port = app.ports.default;
  const session = app.driverSession;
  const native = [place.app, c.native].filter(Boolean).join('/');
  const dev = (...args: ReadonlyArray<string>) => ['agent-device', ...args, '--session', session];
  const web = (...args: ReadonlyArray<string>) => ['agent-browser', '--session', session, ...args];
  const list = ['xcrun', 'simctl', 'list', 'devices', '-j'];
  const devices = (named: Option.Option<string>) =>
    ok(
      encodeJson({
        devices: {
          ios: [
            { name: 'verify-hymnal', udid: 'DECOY', state: 'Booted' },
            ...Option.toArray(
              Option.map(named, (state) => ({ name: app.simulator, udid: UDID, state })),
            ),
          ],
        },
      }),
    );
  /** The host as an iOS drive meets it: the app's simulator in `state`, or none. */
  const ios =
    (named: Option.Option<string>, plist: Answer = failed) =>
    (argv: ReadonlyArray<string>, runs: ReadonlyArray<ReadonlyArray<string>>): Answer => {
      const line = argv.join(' ');
      if (line === list.join(' ')) return devices(named);
      if (line === 'xcrun simctl list runtimes -j')
        return ok(encodeJson({ runtimes: [{ identifier: RUNTIME, isAvailable: true }] }));
      if (argv[2] === 'create') return ok(`${UDID}\n`);
      if (argv[0] === PLIST && argv[2]?.startsWith('Print')) return plist;
      if (argv[0] === 'agent-device' && argv[1] === 'wait' && argv[2] === app.openPrompt) {
        const asked = runs.filter((run) => run[2] === app.openPrompt).length;
        if (asked > 1) return failed;
      }
      return ok();
    };
  const booted = Option.some('Booted');
  const iosSession = sessionOf(app, place, 'ios');
  const webSession = sessionOf(app, place, 'web');
  const read = `read ${place.state}/session.json`;
  const serve = [
    '/bin/sh',
    '-c',
    START,
    BECOME,
    'bun',
    place.script,
    'serve',
    '--port',
    String(port),
    '--out',
    out,
    '--state',
    place.state,
  ];
  const bootOptions = (platform: Platform) => ({
    platform,
    port,
    out: Option.some(out),
    seconds: 5,
    hermesc: Option.none<string>(),
  });
  const record = `${place.state}/session.json`;
  const holders = `${place.state}/holders`;
  /** What a step that holds the state touches around `inside`: its generation made, then released. */
  const held = (inside: ReadonlyArray<string>) => [
    `mkdir ${holders}`,
    `symlink ${holders}/000000000001`,
    ...inside,
    `symlink ${holders}/000000000001.done`,
  ];
  const own = `${place.state}/session.<own>.writing`;
  const wrote = held([read, `write ${own}`, `link-from ${own}`, `link ${record}`, `remove ${own}`]);
  const filed = held([
    read,
    `mkdir ${out}`,
    `link-from ${record}`,
    `link ${out}/session.json`,
    `remove ${record}`,
  ]);
  /** What a step that runs the drivers touches first: the session it reads their environment from (their HOME is a private folder already). */
  const driven = [read];
  const selfRead = ['ps', '-o', 'lstart=', '-p', SELF];
  const startRead = ['ps', '-o', 'lstart=', '-p', SERVER];
  const term = ['kill', '-s', 'TERM', SERVER];
  const daemonStop = ['agent-device', 'daemon', 'stop'];
  const defaults = [
    'xcrun',
    'simctl',
    'spawn',
    UDID,
    'defaults',
    'write',
    app.bundleId,
    'RCT_jsLocation',
    `127.0.0.1:${port}`,
  ];
  const opened = dev('open', app.bundleId, '--platform', 'ios', '--udid', UDID);
  const given = `${ROOT}/given ${n}/${app.ios.app}`;
  const copied = `${out}/${app.ios.app}`;
  const built = `${native}/build/dd/Build/Products/Debug-iphonesimulator/${app.ios.app}`;
  const register = (file: string) => [
    PLIST,
    '-c',
    'Add :CFBundleURLTypes array',
    '-c',
    'Add :CFBundleURLTypes:0 dict',
    '-c',
    'Add :CFBundleURLTypes:0:CFBundleURLSchemes array',
    '-c',
    `Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string ${app.urlScheme}`,
    file,
  ];
  const printScheme = (file: string) => [
    PLIST,
    '-c',
    'Print :CFBundleURLTypes:0:CFBundleURLSchemes:0',
    file,
  ];
  const link = `other-scheme://route ${n}/deep`;
  const steps: Array<Step> = [
    {
      name: 'boot ios, creating the simulator',
      world: { answer: ios(Option.none()) },
      run: (d) => d.boot(place, bootOptions('ios')),
      runs: [
        selfRead,
        list,
        ['xcrun', 'simctl', 'list', 'runtimes', '-j'],
        ['xcrun', 'simctl', 'create', app.simulator, app.deviceType, RUNTIME],
        list,
        ['xcrun', 'simctl', 'boot', UDID],
        ['xcrun', 'simctl', 'bootstatus', UDID, '-b'],
        defaults,
        serve,
      ],
      touched: wrote,
    },
    {
      name: 'boot ios on the booted simulator of its name',
      world: { answer: ios(booted) },
      run: (d) => d.boot(place, bootOptions('ios')),
      runs: [selfRead, list, list, ['xcrun', 'simctl', 'bootstatus', UDID, '-b'], defaults, serve],
      touched: wrote,
    },
    {
      name: 'install a given app',
      world: { answer: ios(booted), session: iosSession },
      run: (d) =>
        d.install(place, {
          app: Option.some(given),
          prebuild: false,
          expect: app.readyTarget,
          seconds: 5,
        }),
      runs: [
        list,
        printScheme(`${copied}/Info.plist`),
        register(`${copied}/Info.plist`),
        ['codesign', '--force', '--sign', '-', '--preserve-metadata=entitlements', copied],
        ['xcrun', 'simctl', 'install', UDID, copied],
        [...opened.slice(0, -2), '--relaunch', '--session', session],
        dev('wait', c.ready, '5000'),
      ],
      touched: [...driven, read, `mkdir ${out}`, `copy-from ${given}`, `copy ${copied}`],
    },
    {
      name: 'install a build of the checkout',
      world: { answer: ios(booted, ok(`${app.urlScheme}\n`)), session: iosSession },
      run: (d) =>
        d.install(place, {
          app: Option.none(),
          prebuild: false,
          expect: app.readyTarget,
          seconds: 5,
        }),
      runs: [
        list,
        ['bun', 'run', '--cwd', place.app, 'prebuild:native'],
        printScheme(`${place.app}/${app.ios.infoPlist}`),
        [
          'xcodebuild',
          '-workspace',
          `${place.app}/${app.ios.workspace}`,
          '-scheme',
          app.ios.scheme,
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
        ],
        ['xcrun', 'simctl', 'install', UDID, built],
        [...opened.slice(0, -2), '--relaunch', '--session', session],
        dev('wait', c.ready, '5000'),
      ],
      touched: [
        ...driven,
        read,
        `exists ${place.app}/${app.ios.workspace}`,
        `write ${out}/build.log`,
      ],
    },
    {
      name: 'open a link on ios',
      world: { answer: ios(booted), session: iosSession },
      run: (d) => d.open(place, link, Option.none(), 5),
      runs: [
        list,
        opened,
        ['xcrun', 'simctl', 'openurl', UDID, `${app.urlScheme}://route ${n}/deep`],
        dev('wait', app.openPrompt, '3000'),
        dev('wait', 'label="Open"', '5000'),
        dev('press', 'label="Open"', '--settle'),
        dev('wait', app.openPrompt, '3000'),
      ],
      touched: [...driven, read],
    },
    {
      name: 'relaunch on ios',
      world: { answer: ios(booted), session: iosSession },
      run: (d) => d.relaunch(place),
      runs: [list, ['xcrun', 'simctl', 'terminate', UDID, app.bundleId], opened],
      touched: [...driven, read],
    },
    {
      name: 'read the log on ios',
      world: { answer: ios(booted), session: iosSession },
      run: (d) => d.log(place),
      runs: [
        list,
        [
          'xcrun',
          'simctl',
          'spawn',
          UDID,
          'log',
          'show',
          '--style',
          'compact',
          '--last',
          '<N>s',
          '--predicate',
          `process == ${quote(app.ios.logProcess)}`,
        ],
      ],
      touched: [...driven, read, `write ${out}/app.log`],
    },
    {
      name: 'tap on a simulator that is shut down',
      world: { answer: ios(Option.some('Shutdown')), session: iosSession },
      run: (d) => d.tap(place, 'label=Go', 5),
      runs: [list],
      touched: [...driven, read],
      fails: { _tag: 'SimulatorDown', name: app.simulator, state: 'Shutdown' },
    },
    {
      name: 'down on ios',
      world: { answer: ios(booted), session: iosSession },
      run: (d) => d.down(place),
      runs: [
        selfRead,
        dev('close'),
        ['xcrun', 'simctl', 'shutdown', UDID],
        daemonStop,
        startRead,
        term,
        startRead,
      ],
      touched: filed,
    },
    {
      name: 'clean the build output',
      world: { exists: true },
      run: (d) => d.clean(place, Option.none(), 'ios'),
      runs: [],
      touched: [
        `real ${place.app}`,
        ...app.cleanPaths.flatMap((rel) => [
          `exists ${place.app}/${rel}`,
          `real ${place.app}/${rel}`,
        ]),
        ...app.cleanPaths.map((rel) => `remove ${place.app}/${rel}`),
      ],
    },
  ];
  const escape = ESCAPES[n % ESCAPES.length] ?? '..';
  steps.push({
    name: `clean refuses ${escape}`,
    world: { exists: true },
    run: (d) =>
      d.clean(
        { ...place, config: { ...app, cleanPaths: [...app.cleanPaths, escape] } },
        Option.none(),
        'ios',
      ),
    runs: [],
    touched: [],
    fails: { _tag: 'Unhealthy', check: 'clean-path' },
  });
  for (const first of app.cleanPaths.slice(0, 1))
    steps.push({
      name: 'clean refuses a symlink out of the app',
      world: {
        exists: true,
        real: (path) => {
          if (path === `${place.app}/${first}`) return `${ROOT}/elsewhere`;
          return path;
        },
      },
      run: (d) => d.clean(place, Option.none(), 'ios'),
      runs: [],
      touched: [`real ${place.app}`, `exists ${place.app}/${first}`, `real ${place.app}/${first}`],
      fails: { _tag: 'Unhealthy', check: 'clean-path' },
    });
  if (app.platforms.includes('web'))
    steps.push(
      {
        name: 'boot the web',
        world: {},
        run: (d) => d.boot(place, bootOptions('web')),
        runs: [selfRead, serve, web('--args', MUTED, 'open', `http://127.0.0.1:${port}/`)],
        touched: wrote,
      },
      {
        name: 'open a route on the web',
        world: { session: webSession },
        run: (d) => d.open(place, link, Option.none(), 5),
        runs: [web('open', `http://127.0.0.1:${port}/route ${n}/deep`)],
        touched: [...driven, read],
      },
      {
        name: 'tap on the web',
        world: { session: webSession },
        run: (d) => d.tap(place, 'label=Go', 5),
        runs: [
          web('wait', '[aria-label="Go"]', '--timeout', '5000'),
          web('click', '[aria-label="Go"]'),
        ],
        touched: [...driven, read],
      },
      {
        name: 'down on the web',
        world: { session: webSession, answer: ios(booted) },
        run: (d) => d.down(place),
        runs: [selfRead, web('close'), daemonStop, startRead, term, startRead],
        touched: filed,
      },
    );
  return steps;
};

/** `--last <N>s` holds the seconds since boot, which the clock decides: the plan keeps its shape. */
const timeless = (argv: ReadonlyArray<string>) =>
  argv.map((arg, at) => {
    if (argv[at - 1] === '--last' && /^\d+s$/.test(arg)) return '<N>s';
    return arg;
  });

/**
 * A start (`/bin/sh -c <start> <become> argv…`) with its two scripts named,
 * not spelled: they are the drive's own, run for real in `os.slow.test.ts`,
 * so the plan holds their place and the server's argv after them.
 */
const scriptless = (argv: ReadonlyArray<string>) => {
  if (argv[0] !== '/bin/sh' || argv[1] !== '-c' || argv.length < 4) return argv;
  return [argv[0], argv[1], START, BECOME, ...argv.slice(4)];
};

/** Each path a step read or wrote lies under the place's app or state (its output is under its state). */
const contained = (place: Place, entry: string) => {
  const path = entry.slice(entry.indexOf(' ') + 1);
  if (entry.startsWith('copy-from ')) return path.startsWith(`${ROOT}/given `);
  return [place.app, place.state].some((root) => path === root || path.startsWith(`${root}/`));
};

/** The step's exit as it expects: a success, or a failure whose error holds each expected field. */
const endedAsExpected = (
  exit: Exit.Exit<unknown, unknown>,
  fails: Readonly<Record<string, string>>,
) => {
  const fields = Object.entries(fails);
  if (fields.length === 0) return Exit.isSuccess(exit);
  return Option.match(Exit.findErrorOption(exit), {
    onNone: () => false,
    onSome: (error) =>
      Predicate.isObject(error) && fields.every(([key, value]) => error[key] === value),
  });
};

/** What is wrong with one step's run: its commands, its files, its place, a hymnal value, its exit. */
const judge = (
  step: Step,
  place: Place,
  where: string,
  exit: Exit.Exit<unknown, unknown>,
  seen: Pick<World, 'runs' | 'touched'>,
) => {
  const problems: Array<string> = [];
  const runs = seen.runs.map((argv) => scriptless(timeless(argv)));
  if (encodeJson(runs) !== encodeJson(step.runs))
    problems.push(`${where}: ran ${encodeJson(runs)}, not ${encodeJson(step.runs)}`);
  if (encodeJson(seen.touched) !== encodeJson(step.touched))
    problems.push(`${where}: touched ${encodeJson(seen.touched)}, not ${encodeJson(step.touched)}`);
  const outside = seen.touched.filter((entry) => !contained(place, entry));
  if (outside.length > 0)
    problems.push(`${where}: touched outside its place: ${outside.join('; ')}`);
  if (/hymn/i.test(encodeJson([runs, seen.touched])))
    problems.push(`${where}: a hymnal value reached a tool or a file`);
  const fails = { ...step.fails };
  if (!endedAsExpected(exit, fails))
    problems.push(`${where}: ended as ${String(exit)}, not as ${encodeJson(fails)}`);
  return problems;
};

/** Every case's steps through one live Drive, then the first case's again: the problems found, and how many steps ran. */
export const checkSteps = (cases: ReadonlyArray<Case>) => {
  const { host, live } = standInHost();
  return Effect.gen(function* () {
    const drive = yield* Drive;
    const problems: Array<string> = [];
    let ran = 0;
    const order = [
      ...cases.map((c, n) => [c, n] as const),
      ...cases.slice(0, 1).map((c) => [c, 0] as const),
    ];
    for (const [c, n] of order) {
      const place = placeOf(c.app, n);
      for (const step of stepsOf(c, n)) {
        host.world = world(step.world);
        const exit = yield* Effect.exit(step.run(drive));
        ran += 1;
        problems.push(
          ...judge(step, place, `case ${n} (${c.app.simulator}), ${step.name}`, exit, host.world),
        );
      }
    }
    return { problems, ran };
  }).pipe(Effect.provide(live));
};

/** A Drive that runs nothing and records each step it is asked for, with its arguments past the place. */
const recorder = (
  calls: Array<{ readonly op: string; readonly args: ReadonlyArray<unknown> }>,
): DriveMembers => {
  const done = (platform: Platform): Outcome => ({ platform, paths: {}, detail: {} });
  const step =
    (op: string) =>
    (...args: ReadonlyArray<unknown>) =>
      Effect.sync(() => {
        calls.push({ op, args: args.slice(1) });
        return done('ios');
      });
  return {
    readSession: () => Effect.die('readSession is not asked for'),
    boot: step('boot'),
    install: step('install'),
    open: step('open'),
    tap: step('tap'),
    fill: step('fill'),
    back: step('back'),
    scroll: step('scroll'),
    shot: step('shot'),
    snapshot: step('snapshot'),
    read: step('read'),
    record: step('record'),
    log: step('log'),
    doctor: step('doctor'),
    down: step('down'),
    clean: step('clean'),
    gesture: step('gesture'),
    pinch: step('pinch'),
    hold: step('hold'),
    relaunch: step('relaunch'),
    sees: (...args) => Effect.sync(() => void calls.push({ op: 'sees', args })),
  };
};

/** `sim <args>` at `place` over the recorder: its exit, the steps it asked for and what it printed. */
const parse = (place: Place, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const calls: Array<{ readonly op: string; readonly args: ReadonlyArray<unknown> }> = [];
    const printed: Array<string> = [];
    const console: Console.Console = {
      ...globalThis.console,
      log: (...line: ReadonlyArray<unknown>) => void printed.push(line.join(' ')),
      error: () => {},
    };
    const exit = yield* Effect.exit(
      runSim(place, args).pipe(
        Effect.provideService(Console.Console, console),
        Effect.provideService(Drive, recorder(calls)),
      ),
    );
    return { exit, calls, printed: printed.join('\n') };
  });

/** The first step's flag `key`, as the command handed it to the Drive. */
const flagOf = (calls: ReadonlyArray<{ readonly args: ReadonlyArray<unknown> }>, key: string) =>
  calls.slice(0, 1).flatMap((call) =>
    call.args
      .slice(0, 1)
      .filter(Predicate.isObject)
      .map((flags) => flags[key]),
  );

/** How `down --clean` names its paths, written out: `a`, `a and b`, `a, b and c`. */
const cleanSentence = (paths: ReadonlyArray<string>) => {
  if (paths.length === 0) return 'then check the port is free';
  const last = paths[paths.length - 1];
  const rest = paths.slice(0, -1);
  if (rest.length === 0) return `then delete ${last} for good`;
  return `then delete ${rest.join(', ')} and ${last} for good`;
};

/**
 * Every case's parsing, at a place whose app folder is `app` (a folder the
 * Hermes compiler resolves from, for an iOS boot): the problems found, and
 * how many port cases ran.
 */
const same = (found: ReadonlyArray<unknown>, value: string | number) =>
  found.length === 1 && found[0] === value;

/** Each port of the range is taken as asked, and each neighbour refused before any step. */
const checkPorts = Effect.fn('AppProperty.checkPorts')(function* (place: Place, where: string) {
  const { min, max } = place.config.ports;
  const problems: Array<string> = [];
  const inside = Array.from({ length: max - min + 1 }, (_, at) => min + at);
  for (const port of [min - 1, ...inside, max + 1]) {
    const { exit, calls } = yield* parse(place, [
      'boot',
      '--platform',
      'ios',
      '--port',
      String(port),
    ]);
    const valid = inside.includes(port);
    const taken = Exit.isSuccess(exit) && same(flagOf(calls, 'port'), port) && calls.length === 1;
    const refused = Exit.isFailure(exit) && calls.length === 0;
    if (valid !== taken || valid === refused) problems.push(`${where}: port ${port} parsed wrong`);
  }
  return { problems, ports: inside.length + 2 };
});

/** An unasked port is the app's default on each of its platforms, and a platform it lacks is refused. */
const checkPlatforms = Effect.fn('AppProperty.checkPlatforms')(function* (
  place: Place,
  where: string,
) {
  const config = place.config;
  const problems: Array<string> = [];
  for (const platform of config.platforms) {
    const { calls } = yield* parse(place, ['boot', '--platform', platform]);
    if (
      !same(flagOf(calls, 'port'), config.ports.default) ||
      !same(flagOf(calls, 'platform'), platform)
    )
      problems.push(`${where}: an unasked port on ${platform} is not ${config.ports.default}`);
  }
  if (!config.platforms.includes('web')) {
    const { exit, calls } = yield* parse(place, ['boot', '--platform', 'web']);
    if (Exit.isSuccess(exit) || calls.length > 0)
      problems.push(`${where}: the web was booted for an iOS-only app`);
  }
  const unasked = yield* parse(place, ['install']);
  if (!same(flagOf(unasked.calls, 'expect'), config.readyTarget))
    problems.push(`${where}: install does not wait for the ready target unasked`);
  const asked = yield* parse(place, ['install', '--expect', 'id=caller']);
  if (!same(flagOf(asked.calls, 'expect'), 'id=caller'))
    problems.push(`${where}: install --expect lost to the app's target`);
  return problems;
});

/** The help names the app, its simulator, platforms, ports, state folder, bundle and clean paths. */
const checkHelp = Effect.fn('AppProperty.checkHelp')(function* (place: Place, where: string) {
  const config = place.config;
  const { min, max } = config.ports;
  const drives = `Drive ${config.displayName} on the ${config.simulator} simulator`;
  const reach = { true: `${drives} or the web`, false: `${drives}\n` }[
    `${config.platforms.includes('web')}`
  ];
  const wanted: ReadonlyArray<readonly [ReadonlyArray<string>, string]> = [
    [['--help'], reach],
    [['boot', '--help'], `ios: the ${config.simulator} simulator`],
    [['boot', '--help'], `(choices: ${config.platforms.join(', ')})`],
    [['boot', '--help'], `the dev server port, ${min}-${max}`],
    [['boot', '--help'], `(default tmp/${config.simulator}/<time>)`],
    [['install', '--help'], `a built ${config.ios.app} to install`],
    [['down', '--help'], cleanSentence(config.cleanPaths)],
  ];
  const problems: Array<string> = [];
  for (const [args, line] of wanted) {
    const { printed } = yield* parse(place, args);
    if (!printed.includes(line))
      problems.push(`${where}: ${args.join(' ')} does not say "${line}"`);
  }
  return problems;
});

/** Each value outside `App`'s domain is refused by `App`, and by `sim` before any step or line. */
const checkInvalid = Effect.fn('AppProperty.checkInvalid')(function* (place: Place, where: string) {
  const problems: Array<string> = [];
  for (const [name, value] of invalid(place.config)) {
    if (Exit.isSuccess(Schema.decodeUnknownExit(App)(value)))
      problems.push(`${where}: App takes ${name}`);
    const ran = yield* parse(Object.assign({}, place, { config: value }), [
      'boot',
      '--platform',
      'web',
    ]);
    if (!Exit.hasDies(ran.exit) || ran.calls.length > 0 || ran.printed !== '')
      problems.push(`${where}: sim ran with ${name}`);
  }
  return problems;
});

export const checkParsing = (cases: ReadonlyArray<Case>, app: string) =>
  Effect.gen(function* () {
    const problems: Array<string> = [];
    let ports = 0;
    for (const [n, c] of cases.entries()) {
      const place: Place = { ...placeOf(c.app, n), app };
      const where = `case ${n} (${c.app.simulator})`;
      const ranged = yield* checkPorts(place, where);
      ports += ranged.ports;
      problems.push(
        ...ranged.problems,
        ...(yield* checkPlatforms(place, where)),
        ...(yield* checkHelp(place, where)),
        ...(yield* checkInvalid(place, where)),
      );
    }
    return { problems, ports };
  }).pipe(Effect.provide(BunServices.layer));

/** How many cases hold each kind of value: each must hold at least one. */
export const coverage = (cases: ReadonlyArray<Case>) => {
  const count = (test: (c: Case) => boolean) => cases.filter(test).length;
  const strings = (c: Case) => [
    c.app.displayName,
    c.app.simulator,
    c.app.driverSession,
    c.app.readyTarget,
    c.app.openPrompt,
    c.app.ios.workspace,
    c.app.ios.app,
    c.app.ios.infoPlist,
    c.app.ios.logProcess,
    ...c.app.cleanPaths,
  ];
  const distinct = (field: (c: Case) => unknown) =>
    new Set(cases.map((c) => encodeJson(field(c)))).size;
  return {
    displayName: distinct((c) => c.app.displayName),
    simulator: distinct((c) => c.app.simulator),
    deviceType: distinct((c) => c.app.deviceType),
    bundleId: distinct((c) => c.app.bundleId),
    urlScheme: distinct((c) => c.app.urlScheme),
    driverSession: distinct((c) => c.app.driverSession),
    ports: distinct((c) => c.app.ports),
    readyTarget: distinct((c) => c.app.readyTarget),
    workspace: distinct((c) => c.app.ios.workspace),
    scheme: distinct((c) => c.app.ios.scheme),
    bundle: distinct((c) => c.app.ios.app),
    infoPlist: distinct((c) => c.app.ios.infoPlist),
    logProcess: distinct((c) => c.app.ios.logProcess),
    openPrompt: distinct((c) => c.app.openPrompt),
    cleanPaths: distinct((c) => c.app.cleanPaths),
    iosOnly: count((c) => !c.app.platforms.includes('web')),
    iosAndWeb: count((c) => c.app.platforms.includes('web')),
    onePort: count((c) => c.app.ports.min === c.app.ports.max),
    manyPorts: count((c) => c.app.ports.min < c.app.ports.max),
    port1: count((c) => c.app.ports.min === 1),
    port65535: count((c) => c.app.ports.max === 65535),
    defaultAtMin: count(
      (c) => c.app.ports.default === c.app.ports.min && c.app.ports.min < c.app.ports.max,
    ),
    defaultAtMax: count(
      (c) => c.app.ports.default === c.app.ports.max && c.app.ports.min < c.app.ports.max,
    ),
    workspaceAtTop: count((c) => c.native === ''),
    noCleanPaths: count((c) => c.app.cleanPaths.length === 0),
    manyCleanPaths: count((c) => c.app.cleanPaths.length > 1),
    spaces: count((c) => strings(c).some((s) => s.includes(' '))),
    quotes: count((c) => strings(c).some((s) => s.includes('"'))),
    apostrophes: count((c) => strings(c).some((s) => s.includes("'"))),
    backslashes: count((c) => strings(c).some((s) => s.includes('\\'))),
    bundlePunctuation: count(
      (c) => /-/.test(c.app.bundleId) && c.app.bundleId.split('.').length > 2,
    ),
    schemePunctuation: count((c) => /[+.-]/.test(c.app.urlScheme)),
    readyById: count((c) => c.app.readyTarget.startsWith('id=')),
    readyBare: count((c) => !/^(id|label)=/.test(c.app.readyTarget)),
    escapes: Math.min(cases.length, ESCAPES.length),
    symlinkEscapes: count((c) => c.app.cleanPaths.length > 0),
    invalidApps: cases.slice(0, 1).flatMap((c) => invalid(c.app)).length,
  };
};
