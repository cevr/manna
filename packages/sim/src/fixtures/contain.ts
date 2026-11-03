/* oxlint-disable effect/noNodeBuiltinImport, no-restricted-imports, effect/noGlobals, effect/noNullish, effect/noTernary, effect/noTryCatch, effect/noRuntimeTypeof, effect/noAs, effect/noAsyncFunction, effect/maxCognitiveComplexity, complexity, no-await-in-loop -- the property's oracle judges the contained host by its own node:fs link walk and tree digest, independent of every FileSystem the drive is given, and its stand-in tools write through links with node:fs as real tools do. */
/**
 * The contained host's property over every host call (`host.ts`): each
 * command runs through `runSim` over `DriveLive`, given only a recording
 * platform FileSystem, a stand-in spawner whose tools do their file work
 * through `node:fs` (following links, as real tools do; nothing runs and no
 * signal is sent) and a stand-in HTTP client, on a real scratch tree.
 *
 * A first run of each command records every path its calls and tools name.
 * Then a link is planted at each component of each of those paths below a
 * root: to an outside copy (`out`), to nowhere outside (`dangling`), by a
 * relative path (`relative`), through a second link (`chain`), to a copy
 * inside the root (`alias`), into another root (`cross`), and made by the
 * prebuild or the build as they run. Each filesystem call and tool argument
 * is judged by the fixture's own link walk, and the tree outside every root
 * is compared before and after: any change is a violation. The liveness
 * layouts (a linked `node_modules`, CocoaPods' header links, a Swift
 * package's linked source, the roots reached through a linked ancestor) must
 * end as the plain layout does.
 */
import { createHash } from 'node:crypto';
import * as nfs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path';

import * as BunServices from '@effect/platform-bun/BunServices';
import { Cause, Clock, Console, Effect, Exit, FileSystem, Layer, Sink, Stream } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/http';
import { ChildProcessSpawner } from 'effect/process';

import type { App } from '../app.ts';
import { runSim } from '../command.ts';
import { DriveLive, type Place } from '../drive.ts';

const APP: App = {
  displayName: 'the hymnal',
  simulator: 'verify-hymnal',
  deviceType: 'iPhone 18 Pro',
  bundleId: 'im.cvr.hymnal',
  urlScheme: 'hymnal',
  driverSession: 'verify-hymnal',
  ports: { min: 8270, max: 8279, default: 8270 },
  readyTarget: 'label=Hymns',
  platforms: ['ios', 'web'],
  ios: {
    workspace: 'ios/Hymnal.xcworkspace',
    scheme: 'Hymnal',
    app: 'Hymnal.app',
    infoPlist: 'ios/Hymnal/Info.plist',
    logProcess: 'Hymnal',
  },
  openPrompt: 'label="Open in “Hymnal”?"',
  cleanPaths: ['ios/build', 'ios/Pods', 'dist'],
};
const FIXED = Date.UTC(2026, 10, 3, 12, 0, 0);
const PRODUCTS = 'Build/Products/Debug-iphonesimulator';

type Variant = 'plain' | 'nm' | 'pods' | 'spm' | 'ancestor';
const LAYOUTS: ReadonlyArray<Variant> = ['plain', 'nm', 'pods', 'spm', 'ancestor'];
type RootKey = 'app' | 'state' | 'out' | 'features' | 'given';
const ROOT_REL: Record<RootKey, string> = {
  app: 'repo/apps/hymnal',
  state: 'state',
  out: 'out',
  features: 'features',
  given: 'given/Hymnal.app',
};
const ROOT_KEYS: ReadonlyArray<RootKey> = ['app', 'state', 'out', 'features', 'given'];
type Session = 'none' | 'ios' | 'web';

interface Layout {
  readonly base: string;
  readonly roots: ReadonlyArray<{
    readonly key: RootKey;
    readonly lexical: string;
    readonly canon: string;
  }>;
  readonly place: Place;
  readonly out: string;
  readonly given: string;
}

const write = (file: string, text: string) => {
  nfs.mkdirSync(dirname(file), { recursive: true });
  nfs.writeFileSync(file, text);
};

const makeLayout = (base: string, variant: Variant, session: Session): Layout => {
  write(`${base}/outside/sentinel.txt`, 'outside');
  const modules = `${base}/repo/node_modules`;
  write(`${modules}/react-native/package.json`, '{"name":"react-native"}');
  write(`${modules}/react-native/React/RCTBridge.h`, 'header');
  write(`${modules}/.bin/one`, 'one');
  write(`${modules}/hermes-compiler/package.json`, '{"name":"hermes-compiler"}');
  write(`${modules}/hermes-compiler/hermesc/osx-bin/hermesc`, 'hermesc');
  const app = `${base}/${ROOT_REL.app}`;
  write(`${app}/package.json`, '{"name":"probe","scripts":{"prebuild:native":"true"}}');
  if (variant === 'nm') nfs.symlinkSync('../../node_modules', `${app}/node_modules`);
  else {
    write(`${app}/node_modules/react-native/package.json`, '{"name":"react-native"}');
    write(`${app}/node_modules/.bin/one`, 'one');
    write(`${app}/node_modules/hermes-compiler/package.json`, '{"name":"hermes-compiler"}');
    write(`${app}/node_modules/hermes-compiler/hermesc/osx-bin/hermesc`, 'hermesc');
  }
  write(`${app}/ios/Hymnal.xcworkspace/contents.xcworkspacedata`, '<Workspace/>');
  write(`${app}/ios/Hymnal/Info.plist`, '<plist/>');
  write(`${app}/ios/Pods/Manifest.lock`, 'pods');
  write(`${app}/Probe/Probe.swift`, 'struct Probe {}');
  write(`${app}/scripts/sim.ts`, '');
  if (variant === 'pods') {
    nfs.mkdirSync(`${app}/ios/Pods/Headers/Public/React-Core`, { recursive: true });
    nfs.symlinkSync(
      `${modules}/react-native/React`,
      `${app}/ios/Pods/Headers/Public/React-Core/React`,
    );
  }
  if (variant === 'spm') {
    nfs.mkdirSync(`${app}/ios/OneSwiftPackages/Probe/Sources`, { recursive: true });
    nfs.symlinkSync(
      `${app}/Probe/Probe.swift`,
      `${app}/ios/OneSwiftPackages/Probe/Sources/Probe.swift`,
    );
  }
  nfs.mkdirSync(`${base}/state`, { recursive: true });
  write(`${base}/out/server.log`, 'ready\n');
  const steps = [
    { name: 'one', action: 'open', link: '/' },
    { name: 'two', action: 'tap', target: 'id=probe' },
  ];
  write(
    `${base}/features/probe.journey.json`,
    JSON.stringify({ feature: 'probe', platform: 'ios', steps }),
  );
  write(`${base}/given/Hymnal.app/Info.plist`, '<plist/>');
  write(`${base}/given/Hymnal.app/Hymnal`, 'binary');
  let spelled = base;
  if (variant === 'ancestor') {
    nfs.symlinkSync(base, `${base}-via`);
    spelled = `${base}-via`;
  }
  const out = `${spelled}/out`;
  if (session !== 'none')
    write(
      `${base}/state/session.json`,
      JSON.stringify({
        platform: session,
        out,
        port: 8270,
        serverPid: 4242,
        udid: session === 'ios' ? 'PROBE-UDID' : '',
        bootedAt: '2026-11-03T12:00:00.000Z',
      }),
    );
  const roots = ROOT_KEYS.map((key) => {
    const lexical = `${spelled}/${ROOT_REL[key]}`;
    return { key, lexical, canon: nfs.realpathSync(lexical) };
  });
  const lexicalOf = (key: RootKey) => `${spelled}/${ROOT_REL[key]}`;
  const place: Place = {
    app: lexicalOf('app'),
    state: lexicalOf('state'),
    script: `${lexicalOf('app')}/scripts/sim.ts`,
    features: lexicalOf('features'),
    warm: [],
    config: APP,
  };
  return { base, roots, place, out, given: lexicalOf('given') };
};

const isLink = (file: string) => {
  try {
    return nfs.lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
};

/** Where a path lands, each link on it followed (the last one too when `follow`). */
const walk = (file: string, follow: boolean, hops = 0): string => {
  if (hops > 40) return '/<link-loop>';
  const parts = normalize(file).split('/').filter(Boolean);
  let at = '/';
  for (const [index, part] of parts.entries()) {
    const next = join(at, part);
    const last = index === parts.length - 1;
    if (isLink(next) && (!last || follow)) {
      const target = nfs.readlinkSync(next);
      at = walk(isAbsolute(target) ? target : join(at, target), true, hops + 1);
    } else at = next;
  }
  return at;
};

const under = (file: string, dir: string) => file === dir || file.startsWith(`${dir}/`);

/** Every root that lexically holds `file`. */
const holdersOf = (layout: Layout, file: string) =>
  layout.roots.filter((root) => under(file, root.lexical) || under(file, root.canon));

/** Whether `raw` lands under the canonical form of every root that holds it. */
const judge = (layout: Layout, raw: string, follow: boolean) => {
  const file = resolve(raw);
  const real = walk(file, follow);
  const held = holdersOf(layout, file);
  if (held.length === 0) return { ok: false, real, why: 'under no root' };
  const left = held.find((root) => !under(real, root.canon));
  return { ok: left === undefined, real, why: left ? `outside ${left.key}` : 'inside' };
};

/** Links beneath a tree that lead out of a root holding it. */
const escapes = (layout: Layout, raw: string): Array<string> => {
  const file = resolve(raw);
  const held = holdersOf(layout, file);
  const found: Array<string> = [];
  const visit = (dir: string) => {
    let names: Array<string> = [];
    try {
      names = nfs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const entry = join(dir, name);
      const info = nfs.lstatSync(entry);
      if (info.isSymbolicLink()) {
        const target = walk(entry, true);
        if (held.length === 0 || held.some((root) => !under(target, root.canon)))
          found.push(`${entry} -> ${target}`);
      } else if (info.isDirectory()) visit(entry);
    }
  };
  visit(walk(file, true));
  return found;
};

/** The tree outside every root: each entry's type, and its link target or content digest. */
const outsideState = (layout: Layout) => {
  const skip = new Set(layout.roots.map((root) => root.canon));
  const realBase = nfs.realpathSync(layout.base);
  const lines: Array<string> = [];
  const visit = (dir: string) => {
    for (const name of nfs.readdirSync(dir).toSorted()) {
      const entry = join(dir, name);
      if (skip.has(entry)) continue;
      const info = nfs.lstatSync(entry);
      const rel = relative(realBase, entry);
      if (info.isSymbolicLink()) lines.push(`l ${rel} ${nfs.readlinkSync(entry)}`);
      else if (info.isDirectory()) {
        lines.push(`d ${rel}`);
        visit(entry);
      } else {
        const digest = createHash('sha256').update(nfs.readFileSync(entry)).digest('hex');
        lines.push(`f ${rel} ${digest.slice(0, 16)}`);
      }
    }
  };
  visit(realBase);
  return lines;
};

const LOOKS = new Set(['exists', 'stat', 'lstat', 'realPath', 'readLink', 'access', 'glob']);
const TWO_PATHS = new Set(['copy', 'copyFile', 'rename']);
const ITSELF = new Set(['remove', 'rename']);

interface Run {
  readonly layout: Layout;
  readonly violations: Array<string>;
  readonly named: Set<string>;
  readonly hooks: { prebuild?: () => void; build?: () => void };
  term: boolean;
  served: boolean;
}

const platformFs = Effect.runSync(
  Effect.gen(function* () {
    return yield* FileSystem.FileSystem;
  }).pipe(Effect.provide(BunServices.layer)),
);

/** The platform FileSystem, each call judged as it is made. */
const recordingFs = (run: Run): FileSystem.FileSystem =>
  new Proxy(platformFs, {
    get(target, name) {
      const value: unknown = Reflect.get(target, name);
      if (typeof value !== 'function' || typeof name !== 'string') return value;
      return (...args: Array<unknown>) => {
        const at = TWO_PATHS.has(name) ? [0, 1] : name === 'symlink' ? [1] : [0];
        for (const index of at) {
          const file = args[index];
          if (typeof file !== 'string') continue;
          run.named.add(resolve(file));
          if (LOOKS.has(name)) continue;
          const verdict = judge(run.layout, file, !ITSELF.has(name));
          if (!verdict.ok)
            run.violations.push(`fs.${name} ${file} -> ${verdict.real} (${verdict.why})`);
          if (name === 'copy')
            for (const escape of escapes(run.layout, file))
              run.violations.push(`fs.copy tree ${file}: ${escape}`);
        }
        return Reflect.apply(value, target, args);
      };
    },
  });

let toolWrites = 0;

/** A stand-in tool's write, marked with a serial so a write through a link to an outside copy always shows. */
const toolWrite = (run: Run, file: string, text: string) => {
  run.named.add(resolve(file));
  nfs.mkdirSync(dirname(file), { recursive: true });
  toolWrites += 1;
  nfs.writeFileSync(file, `${text} #${toolWrites}`);
};

const devices = JSON.stringify({
  devices: {
    'com.apple.CoreSimulator.SimRuntime.iOS-26-0': [
      { name: APP.simulator, udid: 'PROBE-UDID', state: 'Booted', isAvailable: true },
    ],
  },
});
const runtimes = JSON.stringify({
  runtimes: [{ identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-26-0', isAvailable: true }],
});

/** What a stand-in tool does to the files and prints. */
const tool = (run: Run, command: string, args: ReadonlyArray<string>, cwd: string | undefined) => {
  const after = (flag: string) => args[args.indexOf(flag) + 1] ?? '';
  const last = args.at(-1) ?? '';
  const joined = args.join(' ');
  if (command === 'xcrun' && joined === 'simctl list devices -j')
    return { exitCode: 0, stdout: devices };
  if (command === 'xcrun' && joined === 'simctl list runtimes -j')
    return { exitCode: 0, stdout: runtimes };
  if (command === 'xcrun' && args[1] === 'install') {
    nfs.readFileSync(`${last}/Info.plist`);
    return { exitCode: 0, stdout: '' };
  }
  if (args.includes('screenshot') || (args.includes('record') && args.includes('start'))) {
    if (isAbsolute(last)) toolWrite(run, last, 'media');
    return { exitCode: 0, stdout: '' };
  }
  if (command === '/usr/libexec/PlistBuddy') {
    if (joined.includes('Print'))
      return {
        exitCode: 0,
        stdout: nfs.readFileSync(last, 'utf8').includes('scheme') ? APP.urlScheme : '',
      };
    run.named.add(resolve(last));
    nfs.appendFileSync(last, '<scheme/>');
    return { exitCode: 0, stdout: '' };
  }
  if (command === 'xcodebuild') {
    const dd = after('-derivedDataPath');
    toolWrite(run, `${dd}/Build/Intermediates.noindex/${after('-scheme')}.build/x`, 'object');
    toolWrite(run, `${dd}/${PRODUCTS}/${APP.ios.app}/Info.plist`, '<plist/>');
    toolWrite(run, `${dd}/Logs/x`, 'log');
    run.hooks.build?.();
    return { exitCode: 0, stdout: 'BUILD SUCCEEDED\n' };
  }
  if (command === 'codesign') {
    toolWrite(run, `${last}/_CodeSignature/CodeResources`, 'signed');
    return { exitCode: 0, stdout: '' };
  }
  if (command === 'bun' && args.includes('prebuild:native')) {
    const app = args.includes('--cwd') ? after('--cwd') : (cwd ?? '');
    toolWrite(run, `${app}/${APP.ios.workspace}/contents.xcworkspacedata`, '<Workspace/>');
    toolWrite(run, `${app}/ios/Pods/Manifest.lock`, 'pods');
    run.hooks.prebuild?.();
    return { exitCode: 0, stdout: '' };
  }
  if (command === '/bin/sh' && (args[1] ?? '').includes('nohup')) {
    run.served = true;
    return { exitCode: 0, stdout: '4242\n' };
  }
  if (command === 'kill') {
    if (args[0] === '-0') return { exitCode: run.term ? 1 : 0, stdout: '' };
    run.term = true;
    return { exitCode: 0, stdout: '' };
  }
  if (command === 'sysctl')
    return { exitCode: 0, stdout: args.includes('vm.loadavg') ? '{ 1.00 1.00 1.00 }\n' : '12\n' };
  if (command === 'lsof') return { exitCode: 0, stdout: run.term ? '' : '4242\n' };
  if (command === 'git') return { exitCode: 0, stdout: `${'0'.repeat(40)}\n` };
  return { exitCode: 0, stdout: '' };
};

/** Judge a spawn's path arguments (not its programs), its trees and its cwd. */
const judgeSpawn = (
  run: Run,
  command: string,
  args: ReadonlyArray<string>,
  cwd: string | undefined,
) => {
  const programs = new Set<number>();
  if (command === '/bin/sh' && args[0] === '-c') programs.add(2);
  for (const [index, arg] of args.entries())
    if (arg === run.layout.place.script) programs.add(index);
  const trees = new Set<number>();
  if (command === 'xcodebuild') trees.add(args.indexOf('-derivedDataPath') + 1);
  if (command === 'codesign') trees.add(args.length - 1);
  if (command === 'xcrun' && args[1] === 'install') trees.add(args.length - 1);
  for (const [index, arg] of args.entries()) {
    if (programs.has(index) || !isAbsolute(arg)) continue;
    run.named.add(resolve(arg));
    const verdict = judge(run.layout, arg, true);
    if (!verdict.ok)
      run.violations.push(`spawn ${command} ${arg} -> ${verdict.real} (${verdict.why})`);
    if (trees.has(index))
      for (const escape of escapes(run.layout, arg))
        run.violations.push(`spawn ${command} tree ${arg}: ${escape}`);
  }
  if (cwd === undefined) return;
  run.named.add(resolve(cwd));
  const verdict = judge(run.layout, cwd, true);
  if (!verdict.ok)
    run.violations.push(`spawn ${command} cwd ${cwd} -> ${verdict.real} (${verdict.why})`);
};

const standInSpawner = (run: Run) =>
  ChildProcessSpawner.make((command) =>
    Effect.sync(() => {
      const name = command._tag === 'StandardCommand' ? command.command : 'piped';
      const args = command._tag === 'StandardCommand' ? command.args.map(String) : [];
      const cwd = command._tag === 'StandardCommand' ? command.options.cwd : undefined;
      judgeSpawn(run, name, args, cwd);
      let answer = { exitCode: 1, stdout: '' };
      try {
        answer = tool(run, name, args, cwd);
      } catch (error) {
        answer = { exitCode: 1, stdout: String(error) };
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
  );

const standInHttp = (run: Run) =>
  HttpClient.make((request) =>
    Effect.sync(() =>
      HttpClientResponse.fromWeb(request, new Response('', { status: run.served ? 200 : 503 })),
    ),
  );

const quiet: Console.Console = {
  ...globalThis.console,
  log: () => undefined,
  error: () => undefined,
};

/** `program` with the clock held at one instant, so a run and its replanted run name the same folders. */
const fixedClock = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  Effect.clockWith((real) => {
    const clock: Clock.Clock = Object.assign(Object.create(real) as Clock.Clock, {
      currentTimeMillisUnsafe: () => FIXED,
      currentTimeMillis: Effect.succeed(FIXED),
      currentTimeNanosUnsafe: () => BigInt(FIXED) * 1_000_000n,
      currentTimeNanos: Effect.succeed(BigInt(FIXED) * 1_000_000n),
    });
    return Effect.provideService(program, Clock.Clock, clock);
  });

interface Command {
  readonly session: Session;
  readonly args: (layout: Layout) => ReadonlyArray<string>;
  /** The command's name in case ids, with its folders as placeholders. */
  readonly name: string;
}

const commands: Array<Command> = [];
const add = (session: Session, name: string, args: Command['args']) =>
  void commands.push({ session, name: `${session}:${name}`, args });
add('none', 'boot', () => ['boot']);
add('none', 'boot --out <out>', (l) => ['boot', '--out', l.out]);
add('none', 'boot --platform web', () => ['boot', '--platform', 'web']);
add('none', 'boot --platform web --out <out>', (l) => [
  'boot',
  '--platform',
  'web',
  '--out',
  l.out,
]);
add('none', 'boot --out <state>/run', (l) => ['boot', '--out', `${l.place.state}/run`]);
add('none', 'boot --platform web --out <state>/run', (l) => [
  'boot',
  '--platform',
  'web',
  '--out',
  `${l.place.state}/run`,
]);
add('ios', 'install', () => ['install']);
add('ios', 'install --prebuild', () => ['install', '--prebuild']);
add('ios', 'install --app <given>', (l) => ['install', '--app', l.given]);
add('ios', 'journey probe --skip-video', () => ['journey', 'probe', '--skip-video']);
add('ios', 'journey probe', () => ['journey', 'probe']);
for (const session of ['ios', 'web'] as const) {
  for (const args of [
    ['open', '/hymns/100'],
    ['tap', 'id=probe'],
    ['fill', 'id=probe', '100'],
    ['back'],
    ['scroll', 'screen', 'down'],
    ['shot', 'probe'],
    ['snapshot', 'probe'],
    ['record', 'start', 'probe'],
    ['record', 'stop'],
    ['log'],
    ['doctor'],
    ['gesture', 'pan', '10,20', '30', '40'],
    ['gesture', 'edge-pan'],
    ['gesture', 'pinch', '200,450', '0.5'],
    ['hold', 'id=probe', '--settle', '0'],
    ['relaunch'],
    ['down'],
    ['down', '--clean'],
  ])
    add(session, args.join(' '), () => args);
}
add('none', 'serve --port 8270 --out <out>', (l) => ['serve', '--port', '8270', '--out', l.out]);
add('none', 'serve --port 8270 --out <state>/run', (l) => [
  'serve',
  '--port',
  '8270',
  '--out',
  `${l.place.state}/run`,
]);

/** Every command the property runs, by its name in case ids. */
export const commandNames: ReadonlyArray<string> = commands.map((command) => command.name);

/** A link planted at a component below a root. */
type Kind = 'out' | 'dangling' | 'relative' | 'chain' | 'alias' | 'cross' | 'prebuild' | 'build';

interface Plant {
  readonly rel: string;
  readonly kind: Kind;
  readonly type: 'dir' | 'file';
}

/** The deepest root holding a path relative to the layout's base. */
const rootKeyOf = (rel: string) =>
  ROOT_KEYS.filter((key) => under(rel, ROOT_REL[key])).toSorted(
    (a, b) => ROOT_REL[b].length - ROOT_REL[a].length,
  )[0];

let serial = 0;

/** Plant the link now, or answer a hook that plants it when the prebuild or the build runs. */
const plantLink = (layout: Layout, plant: Plant, first: string): (() => void) | undefined => {
  const at = `${layout.base}/${plant.rel}`;
  const key = rootKeyOf(plant.rel) ?? 'app';
  const rootDir = `${layout.base}/${ROOT_REL[key]}`;
  serial += 1;
  const n = serial;
  const mirror = (dest: string, source: string) => {
    if (nfs.existsSync(source))
      nfs.cpSync(source, dest, { recursive: true, verbatimSymlinks: true });
    else if (plant.type === 'dir') nfs.mkdirSync(dest, { recursive: true });
    else write(dest, 'sentinel');
  };
  const link = (target: string): undefined => {
    nfs.rmSync(at, { recursive: true, force: true });
    nfs.mkdirSync(dirname(at), { recursive: true });
    nfs.symlinkSync(target, at);
    return undefined;
  };
  const outside = `${layout.base}/outside/m${n}`;
  switch (plant.kind) {
    case 'out':
      mirror(outside, at);
      return link(outside);
    case 'dangling':
      return link(`${layout.base}/outside/d${n}`);
    case 'relative':
      mirror(outside, at);
      return link(relative(dirname(at), outside));
    case 'chain': {
      mirror(outside, at);
      const hop = `${rootDir}/.chain${n}`;
      nfs.symlinkSync(outside, hop);
      return link(hop);
    }
    case 'alias': {
      const alias = `${rootDir}/.alias${n}`;
      mirror(alias, at);
      return link(alias);
    }
    case 'cross': {
      const other = key === 'state' ? 'out' : 'state';
      const cross = `${layout.base}/${ROOT_REL[other]}/.cross${n}`;
      mirror(cross, at);
      return link(cross);
    }
    case 'prebuild':
    case 'build':
      mirror(outside, `${first}/${plant.rel}`);
      return () => void link(outside);
  }
};

interface Ran {
  readonly ok: boolean;
  readonly typed: boolean;
  readonly violations: ReadonlyArray<string>;
  readonly named: ReadonlyArray<string>;
  readonly base: string;
  readonly why: string;
}

const runCase = async (
  scratch: string,
  command: Command,
  variant: Variant,
  plant?: Plant,
  first?: string,
): Promise<Ran> => {
  serial += 1;
  const base = `${scratch}/c${serial}`;
  nfs.mkdirSync(base);
  const layout = makeLayout(base, variant, command.session);
  const run: Run = {
    layout,
    violations: [],
    named: new Set(),
    hooks: {},
    term: false,
    served: command.session !== 'none',
  };
  if (plant) {
    const hook = plantLink(layout, plant, first ?? base);
    if (hook && plant.kind === 'prebuild') run.hooks.prebuild = hook;
    if (hook && plant.kind === 'build') run.hooks.build = hook;
  }
  const before = outsideState(layout);
  const host = Layer.mergeAll(
    Layer.succeed(FileSystem.FileSystem, recordingFs(run)),
    Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, standInSpawner(run)),
    Layer.succeed(HttpClient.HttpClient, standInHttp(run)),
  );
  const program = runSim(layout.place, command.args(layout)).pipe(
    Effect.provide(Layer.provideMerge(DriveLive, host)),
    Effect.provideService(Console.Console, quiet),
    Effect.provide(BunServices.layer),
    Effect.timeoutOrElse({ duration: '20 seconds', orElse: () => Effect.die('timed out') }),
  );
  const exit = await Effect.runPromiseExit(fixedClock(program));
  const after = outsideState(layout);
  for (const line of new Set([...before, ...after]))
    if (!before.includes(line) || !after.includes(line))
      run.violations.push(`outside changed: ${line}`);
  const ok = Exit.isSuccess(exit);
  const typed = Exit.isSuccess(exit) || (Cause.hasFails(exit.cause) && !Cause.hasDies(exit.cause));
  const why = Exit.isSuccess(exit) ? 'ok' : String(Cause.squash(exit.cause)).slice(0, 200);
  return { ok, typed, violations: run.violations, named: [...run.named], base, why };
};

/** The four census triggers: the configured native path, `dd/Build`, `build.log` and the deep derived data. */
const triggersOf = (command: Command, plant: Plant): Array<string> => {
  if (!command.name.startsWith('ios:install')) return [];
  const hits: Array<string> = [];
  const app = ROOT_REL.app;
  const outish = plant.kind === 'out';
  if (
    outish &&
    [`${app}/ios`, `${app}/ios/Hymnal`, `${app}/ios/Hymnal.xcworkspace`].includes(plant.rel)
  )
    hits.push('native-path');
  if ((outish || plant.kind === 'prebuild') && plant.rel === `${app}/ios/build/dd/Build`)
    hits.push('dd-build');
  if (outish && plant.rel === `${ROOT_REL.out}/build.log`) hits.push('build-log');
  if (outish && plant.rel === `${app}/ios/build/dd/Build/Intermediates.noindex/Hymnal.build`)
    hits.push('deep-dd');
  return hits;
};

/** What the property found: zero violations and untyped failures, every liveness layout as expected. */
export interface Found {
  readonly cases: number;
  readonly violations: ReadonlyArray<string>;
  readonly untyped: ReadonlyArray<string>;
  readonly liveness: ReadonlyArray<string>;
  readonly livenessCases: number;
  readonly triggers: ReadonlySet<string>;
}

export interface Domain {
  /** The plant kinds each component takes (the prebuild and build hooks are added where they run). */
  readonly kinds: ReadonlyArray<Kind>;
  /** Which commands run. */
  readonly commands: (name: string) => boolean;
  /** Which commands also run on each liveness layout. */
  readonly liveness: (name: string) => boolean;
  /** Which planted cases run, by the command's name and the plant. */
  readonly plants: (name: string, plant: Plant) => boolean;
}

/** Run the property over `domain` in a scratch tree it removes. */
export const runDomain = async (domain: Domain): Promise<Found> => {
  const scratch = nfs.mkdtempSync(join(tmpdir(), 'sim-contain-'));
  const violations: Array<string> = [];
  const untyped: Array<string> = [];
  const liveness: Array<string> = [];
  const triggers = new Set<string>();
  let cases = 0;
  let livenessCases = 0;
  const tally = (id: string, ran: Ran) => {
    cases += 1;
    for (const violation of ran.violations) violations.push(`${id}: ${violation}`);
    if (!ran.typed) untyped.push(`${id}: ${ran.why}`);
  };
  try {
    for (const command of commands.filter((c) => domain.commands(c.name))) {
      const plain = await runCase(scratch, command, 'plain');
      tally(`${command.name}@plain`, plain);
      const expected = !/^web:(gesture|hold)|^none:serve/.test(command.name);
      const variants = domain.liveness(command.name) ? LAYOUTS : (['plain'] as const);
      for (const variant of variants) {
        const ran = variant === 'plain' ? plain : await runCase(scratch, command, variant);
        livenessCases += 1;
        if (ran.ok !== expected)
          liveness.push(
            `${command.name}@${variant}: ok=${ran.ok}, expected ${expected}: ${ran.why}`,
          );
        if (variant === 'plain') continue;
        tally(`${command.name}@${variant}`, ran);
        nfs.rmSync(ran.base, { recursive: true, force: true });
      }
      const components = componentsOf(plain, command);
      const kinds: Array<Kind> = [...domain.kinds];
      if (command.name.startsWith('ios:install') && !command.name.includes('--app'))
        kinds.push('build');
      if (command.name === 'ios:install --prebuild') kinds.push('prebuild');
      for (const [rel, final] of [...components].toSorted()) {
        for (const kind of kinds) {
          if ((kind === 'prebuild' || kind === 'build') && !under(rel, ROOT_REL.app)) continue;
          let type: Plant['type'] = final ? 'file' : 'dir';
          if (nfs.existsSync(`${plain.base}/${rel}`))
            type = nfs.lstatSync(`${plain.base}/${rel}`).isDirectory() ? 'dir' : 'file';
          const plant: Plant = { rel, kind, type };
          if (!domain.plants(command.name, plant)) continue;
          const ran = await runCase(scratch, command, 'plain', plant, plain.base);
          tally(`${command.name}@${rel}#${kind}`, ran);
          for (const hit of triggersOf(command, plant)) triggers.add(hit);
          nfs.rmSync(ran.base, { recursive: true, force: true });
        }
      }
      nfs.rmSync(plain.base, { recursive: true, force: true });
    }
  } finally {
    nfs.rmSync(scratch, { recursive: true, force: true });
  }
  return { cases, violations, untyped, liveness, livenessCases, triggers };
};

/** Each component below a root of each path the plain run named; true when it is the path's last. */
const componentsOf = (plain: Ran, command: Command) => {
  const components = new Map<string, boolean>();
  const realBase = nfs.realpathSync(plain.base);
  for (const file of plain.named) {
    let rel: string | undefined;
    if (file.startsWith(`${plain.base}/`)) rel = relative(plain.base, file);
    else if (file.startsWith(`${realBase}/`)) rel = relative(realBase, file);
    if (rel === undefined) continue;
    const key = rootKeyOf(rel);
    if (key === undefined) continue;
    const parts = relative(ROOT_REL[key], rel).split('/').filter(Boolean);
    for (let at = 1; at <= parts.length; at += 1) {
      const component = `${ROOT_REL[key]}/${parts.slice(0, at).join('/')}`;
      components.set(component, (components.get(component) ?? true) && at === parts.length);
    }
  }
  if (command.name.startsWith('ios:install --app')) {
    const copied = `${ROOT_REL.out}/${APP.ios.app}`;
    for (const [component] of [...components])
      if (component.startsWith(`${copied}/`))
        components.set(`${ROOT_REL.given}${component.slice(copied.length)}`, false);
  }
  return components;
};
