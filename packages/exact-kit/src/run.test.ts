import * as BunServices from '@effect/platform-bun/BunServices';
import {
  Array as Arr,
  ConfigProvider,
  Console,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  Option,
  Record as Rec,
  Result,
  FileSystem,
  Layer,
  Path,
  Schedule,
  Schema,
  Sink,
  Stream,
} from 'effect';
import * as Arbitrary from 'effect/Arbitrary';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { TestClock } from 'effect/testing';
import { describe, expect, it } from 'effect-bun-test';

import { fixturePort } from './drive/port.ts';
import { EXACT_BASE } from './pin.ts';
import { PortClaims, runExact } from './run.ts';

const PROBE = '/nonexistent/loop-probe-x';
const LAUNCHER = `${PROBE}/exact-cli.ts`;

/**
 * The apps, their folders, simulators and ports, whether each is quiet, and the lock, as the spec names them:
 * written out apart from the wrapper.
 */
const APPS = {
  'heartseed-exact': {
    folder: 'apps/heartseed-exact',
    simulator: 'verify-heartseed-exact',
    port: 8765,
    spare: [8770, 8774],
    quiet: true,
  },
  'hymnal-exact': {
    folder: 'apps/hymnal-exact',
    simulator: 'verify-hymnal-exact',
    port: 8766,
    spare: [8775, 8779],
    quiet: false,
  },
  lab: {
    folder: 'packages/exact-kit/lab',
    simulator: 'verify-heartseed-exact',
    port: 8774,
    spare: [8774, 8774],
    quiet: true,
  },
} as const;
type App = keyof typeof APPS;
const APP_NAMES = Object.keys(APPS) as ReadonlyArray<App>;
const BUILD_LOCK = '/tmp/manna-exact-build.lock';
const DEFAULT_CLONE = 'Developer/vendor/exact';

/** What Exact's `update` writes: its own launcher, which runs its CLI directly, and its notes' opening line. */
const EXACT_LAUNCHER = `#!/usr/bin/env bun
import {run} from "../../../vendor/exact/scripts/app-cli.mjs";
process.exit(await run({ name: "manna-heartseed-exact", exact2: EXACT, args: process.argv.slice(2) }));
`;
const EXACT_NOTES = `<!-- exact:begin (exact new writes this block; bun exact.mjs update rewrites it) -->
When an iPhone app is ready to try, run \`bun exact.mjs share\` and send its link.
<!-- exact:end -->
`;

/**
 * A launcher standing in for `exact-cli.ts`: it starts a `sleep` that outlives it in its process group, as Exact's
 * test runners do, writes its pid beside the app as `exited.pid` (or `waited.pid` when the last argument is `wait`),
 * then exits, or waits to be stopped.
 */
const LINGERING = `const { spawn } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const [appDir] = process.argv.slice(2);
const waits = process.argv.at(-1) === 'wait';
const kept = spawn('sleep', ['20'], { stdio: 'ignore' });
writeFileSync(appDir + (waits ? '/waited.pid' : '/exited.pid'), String(kept.pid));
if (waits) setInterval(() => {}, 1000);
else process.exit(0);
`;

/** The repo's root, from this file. */
const repoRoot = Effect.gen(function* () {
  const path = yield* Path.Path;
  return path.join(yield* path.fromFileUrl(new URL('.', import.meta.url)), '..', '..', '..');
});

/** The commits `docs/exact.md` names, in order: the pin, the clone's HEAD every run here stands in with but the off-pin ones, then the base. */
const docsPins = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const doc = yield* fs.readFileString(path.join(yield* repoRoot, 'docs', 'exact.md'));
  return [...new Set([...doc.matchAll(/\b[0-9a-f]{40}\b/g)].map((m) => m[0]))];
}).pipe(Effect.provide(BunServices.layer));

/** Each app's committed `exact.mjs` and `AGENTS.md`, keyed by where the runs here put the app: `PROBE/apps/<app>/<file>`. */
const appFiles = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* repoRoot;
  const entries = yield* Effect.forEach(
    APP_NAMES.flatMap((app) => ['exact.mjs', 'AGENTS.md'].map((file) => [app, file] as const)),
    ([app, file]) =>
      Effect.map(
        fs.readFileString(path.join(root, APPS[app].folder, file)),
        (text) => [`${PROBE}/apps/${app}/${file}`, text] as const,
      ),
  );
  return Object.fromEntries(entries);
}).pipe(Effect.provide(BunServices.layer));

/** A file system over `files` (absolute path → text, read as each read runs) that only reads, touching no disk. */
const memoryFs = (files: Readonly<Record<string, string>>) => {
  const missing = FileSystem.makeNoop({});
  return FileSystem.layerNoop({
    readFileString: (file) =>
      Effect.suspend(() =>
        Option.match(Rec.get(files, file), {
          onNone: () => missing.readFileString(file),
          onSome: Effect.succeed,
        }),
      ),
  });
};

/** A process the stand-in was asked to start: its command, arguments and options; `removed`, the inherited variables it is started without. */
interface Spawned {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly env: Readonly<Record<string, string>>;
  readonly removed: ReadonlyArray<string>;
  readonly extendEnv: boolean;
}

const handleOf = (
  stdout: string,
  exitCode: number,
  exited: Effect.Effect<void> = Effect.void,
  kill: Effect.Effect<void> = Effect.void,
) =>
  ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(0),
    exitCode: Effect.as(exited, ChildProcessSpawner.ExitCode(exitCode)),
    isRunning: Effect.succeed(false),
    kill: () => kill,
    stdin: Sink.drain,
    stdout: Stream.make(new TextEncoder().encode(stdout)),
    stderr: Stream.empty,
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
    unref: Effect.succeed(Effect.void),
  });

/**
 * A spawner that starts nothing: it keeps each command, answers git's `rev-parse` with `head` (none: no clone), and
 * every other command with 0 once `exited` ends.
 */
const standIn = (
  head: Option.Option<string>,
  spawned: Array<Spawned>,
  exited: Effect.Effect<void> = Effect.void,
  kill: Effect.Effect<void> = Effect.void,
) =>
  ChildProcessSpawner.make((command) => {
    if (command._tag !== 'StandardCommand') return Effect.succeed(handleOf('', 0));
    const env = Object.entries(
      Option.getOrElse(Option.fromUndefinedOr(command.options.env), () => ({})),
    ).map(([name, value]) => [name, Option.map(Option.fromUndefinedOr(value), String)] as const);
    spawned.push({
      command: command.command,
      args: command.args.map(String),
      env: Object.fromEntries(
        env.flatMap(([name, value]) => Option.toArray(Option.map(value, (v) => [name, v]))),
      ),
      removed: env.filter(([, value]) => Option.isNone(value)).map(([name]) => name),
      extendEnv: command.options.extendEnv === true,
    });
    if (command.command === 'git' && Option.isNone(head)) return Effect.succeed(handleOf('', 128));
    if (command.command === 'git')
      return Effect.succeed(handleOf(`${Option.getOrElse(head, () => '')}\n`, 0));
    return Effect.succeed(handleOf('', 0, exited, kill));
  });

/** The caller's environment: what the wrapper may read (`HOME`, `EXACT`, `EXACT_PORT`) and what it must override. */
type Caller = Readonly<Record<string, string>>;

/**
 * `runExact` for `app` at `PROBE/apps/<app>`, over `files` for its folder, a stand-in spawner whose clone is at `head`
 * and whose child ends once `exited` does, and the caller's `caller`; `claims` and `spawned` are filled as it runs.
 */
const running = (
  app: App | 'heartseed',
  args: ReadonlyArray<string>,
  caller: Caller,
  head: Option.Option<string>,
  files: Readonly<Record<string, string>>,
  {
    exited = Effect.void,
    kill = Effect.void,
    claims = [],
    spawned = [],
  }: {
    readonly exited?: Effect.Effect<void>;
    readonly kill?: Effect.Effect<void>;
    readonly claims?: Array<Claimed>;
    readonly spawned?: Array<Spawned>;
  } = {},
) =>
  runExact(`${PROBE}/apps/${app}`, args, LAUNCHER).pipe(
    Effect.result,
    Effect.provide(
      Layer.mergeAll(
        BunServices.layer,
        memoryFs(files),
        Layer.succeed(
          ChildProcessSpawner.ChildProcessSpawner,
          standIn(head, spawned, exited, kill),
        ),
        Layer.succeed(PortClaims, claimsStandIn(claims)),
        ConfigProvider.layer(ConfigProvider.fromUnknown(caller)),
      ),
    ),
    Effect.map((result) => ({ result, spawned, claims })),
  );

/** Ports the stand-in claims were asked to hold: a block claimed from a range, or one port taken, and whether they were given back. */
interface Claimed {
  readonly asked: 'claimed' | number;
  readonly ports: readonly [number, number];
  given: boolean;
}

/**
 * Claims that hold no port: a range's claim of `count` answers that many of its first ports (all of it when it holds
 * fewer), a take the port; each is marked given when its scope closes.
 */
const claimsStandIn = (claims: Array<Claimed>) => {
  const holding = (asked: Claimed['asked'], ports: readonly [number, number]) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const claimed: Claimed = { asked, ports, given: false };
        claims.push(claimed);
        return claimed;
      }),
      (claimed) =>
        Effect.sync(() => {
          claimed.given = true;
        }),
    );
  return {
    claim: (range: readonly [number, number], count: number) =>
      Effect.map(
        holding('claimed', [range[0], Math.min(range[1], range[0] + count - 1)]),
        (claimed) => claimed.ports,
      ),
    take: (port: number) => Effect.map(holding(port, [port, port]), () => port),
  };
};

/** The pin and the apps' committed files, which every run but a refused one needs. */
const fixtures = Effect.all({ pins: docsPins, files: appFiles });

const VERBS = [
  'web',
  'test',
  'verify',
  'agent',
  'ios',
  'mac',
  'share',
  'deploy',
  'release',
  'feedback',
  'contract',
  'forma',
  'pattern',
  'update',
  'snapback',
  'add',
  'help',
  'web-build',
  'serve',
  'linux',
  'android',
] as const;
const WORDS = [
  'web',
  'ios',
  'macos',
  'never',
  'note',
  'status',
  'always',
  '--json',
  '--run',
  '--run=1',
  'mac',
  '--prebuild',
  '--help',
  '--sim',
  '--sim=booted',
  '--device',
  '--port',
  '8765',
  '8766',
  '8770',
  '8774',
  '8775',
  '8779',
  '9000',
  'app.test.contract',
  'tree',
  'clock data',
] as const;

/**
 * A port a caller may leave in a port variable: none (drawn most, so a fifth of the draws leave all three unset and
 * reach the run), each app's own and spare, the lab's, the current hymnal's, and not a number.
 */
const CALLER_PORTS = [
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '8765',
  '8766',
  '8771',
  '8774',
  '8776',
  '8281',
  '87a',
  '8765.0',
] as const;

/** The variables the pinned Exact reads a listening port from (its clone's `EXACT_PORT`, `PORT` and `EXACT_TOOL_PORT` reads), written out apart from the wrapper. */
const PORT_VARIABLES = ['EXACT_PORT', 'PORT', 'EXACT_TOOL_PORT'] as const;
type PortVariable = (typeof PORT_VARIABLES)[number];
type CallerPorts = Readonly<Record<PortVariable, string>>;

/**
 * Starts drawn more often: the verbs that listen, each of which must keep to the app's ports, the native drives
 * on the Mac and the simulator, and the launches a quiet app refuses.
 */
const STARTS = [
  ['web'],
  ['serve'],
  ['test', 'web'],
  ['verify'],
  ['agent', 'web'],
  ['test', 'macos'],
  ['agent', 'macos'],
  ['verify', 'macos'],
  ['ios', '--run'],
  ['mac', '--run'],
  ['ios', '--run=1'],
  ['test', 'mac'],
  ['test', 'ios'],
  ['agent', 'ios'],
] as const;

/** What the app's folder holds: its own files, or one rewritten as Exact's `update` writes it. */
const REWRITES = ['none', 'none', 'none', 'launcher', 'notes', 'no launcher'] as const;

const Case = Arbitrary.all({
  app: Arbitrary.schema(Schema.Literals(APP_NAMES)),
  verb: Arbitrary.schema(
    Schema.Union([Schema.Literals(VERBS), Schema.Literals(VERBS), Schema.String]),
  ),
  rest: Arbitrary.array(
    Arbitrary.schema(Schema.Union([Schema.Literals(WORDS), Schema.Literals(WORDS), Schema.String])),
    { maxLength: 5 },
  ),
  callerSim: Arbitrary.schema(Schema.Literals(['booted', 'verify-heartseed', 'verify-hymnal', ''])),
  callerFeedback: Arbitrary.schema(Schema.Literals(['1', 'always', ''])),
  callerExact: Arbitrary.schema(Schema.Literals([`${PROBE}/elsewhere`, ''])),
  callerPorts: Arbitrary.all({
    EXACT_PORT: Arbitrary.schema(Schema.Literals(CALLER_PORTS)),
    PORT: Arbitrary.schema(Schema.Literals(CALLER_PORTS)),
    EXACT_TOOL_PORT: Arbitrary.schema(Schema.Literals(CALLER_PORTS)),
  }),
  start: Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: STARTS.length * 2 - 1 })),
  ),
  rewrite: Arbitrary.schema(Schema.Literals(REWRITES)),
});

/** The case's arguments: one of `STARTS` for half the draws, else the drawn verb, then the drawn words. */
const argsOf = (verb: string, rest: ReadonlyArray<string>, start: number) => [
  ...Option.getOrElse(Option.fromUndefinedOr(STARTS[start]), () => [verb]),
  ...rest,
];

/** The ports `app` owns, as text: its own and its spare range. */
const owned = (app: App) => {
  const { port: own, spare } = APPS[app];
  return new Set(
    [own, ...Array.from({ length: spare[1] - spare[0] + 1 }, (_, i) => spare[0] + i)].map(String),
  );
};

/** The rule, written out apart from the wrapper: what it must refuse. */
const mustRefuse = (
  app: App,
  args: ReadonlyArray<string>,
  callerPorts: CallerPorts,
  rewrite: (typeof REWRITES)[number],
) => {
  const [verb = '', ...rest] = args;
  if (['share', 'deploy', 'release', 'update', 'snapback'].includes(verb)) return true;
  if (verb === 'feedback' && rest.join(' ') !== 'never') return true;
  if (args.some((a) => /^--(?:sim|device)(?:=|$)/.test(a))) return true;
  if (APPS[app].quiet && ['ios', 'mac'].includes(verb) && rest.some((a) => /^--run(?:=|$)/.test(a)))
    return true;
  const allowed = owned(app);
  if (PORT_VARIABLES.some((name) => callerPorts[name] !== '' && !allowed.has(callerPorts[name])))
    return true;
  if (rewrite !== 'none') return true;
  return args.some(
    (a, i) =>
      (a === '--port' && !allowed.has(args[i + 1] ?? '')) ||
      (a.startsWith('--port=') && !allowed.has(a.slice(7))),
  );
};

/**
 * The rule, written out: the port a run holds while its child runs. None for a verb other than `test`, `verify`
 * and `agent`, or one on a native host; else the page's port its arguments or the caller's `EXACT_PORT` name, else
 * one claimed from the spare range.
 */
const listenerFor = (
  args: ReadonlyArray<string>,
  callerPorts: CallerPorts,
): 'none' | 'claimed' | number => {
  if (!['test', 'verify', 'agent'].includes(args[0] ?? '') || mustLock(args)) return 'none';
  const named = args.flatMap((a, i) => {
    if (a === '--port') return [args[i + 1] ?? ''];
    if (a.startsWith('--port=')) return [a.slice(7)];
    return [];
  });
  const port = named[0] ?? callerPorts.EXACT_PORT;
  if (port === '') return 'claimed';
  return Number(port);
};

/**
 * The rule, written out: how many adjacent ports a run of `verb` off the native hosts claims, so its pages at once
 * each find one: `verify` the whole spare range, `test` two, `agent` one; never more than the range holds.
 */
const pagesOf = (app: App, verb: string) => {
  const [lo, hi] = APPS[app].spare;
  const size = hi - lo + 1;
  if (verb === 'verify') return size;
  if (verb === 'test') return Math.min(2, size);
  return 1;
};

/**
 * The range a child is held to and the turns it is told it holds, for `listener`: a claimed block is the range's
 * first `pagesOf` ports (the stand-in's) and the child is held to it; a named one keeps the spare range; none holds
 * no turn ("").
 */
const rangeHeld = (
  app: App,
  args: ReadonlyArray<string>,
  listener: ReturnType<typeof listenerFor>,
) => {
  const [lo, hi] = APPS[app].spare;
  if (listener === 'claimed') {
    const top = lo + pagesOf(app, args[0] ?? '') - 1;
    return { lo, hi: top, turns: Arr.range(lo, top).join(',') };
  }
  if (listener === 'none') return { lo, hi, turns: '' };
  return { lo, hi, turns: String(listener) };
};

/** The rule, written out: what runs under the build lock. */
const mustLock = (args: ReadonlyArray<string>) =>
  args[0] === 'ios' ||
  args[0] === 'mac' ||
  (['test', 'verify', 'agent'].includes(args[0] ?? '') &&
    ['ios', 'macos', 'mac'].includes(args[1] ?? ''));

/**
 * The rule, written out: the child's `name`, the caller's when set, else the app's own port for the
 * verb that listens by it given no `--port` (`web` by `EXACT_PORT`, `serve` by `PORT`), else none.
 */
const portFor = (
  app: App,
  args: ReadonlyArray<string>,
  callerPorts: CallerPorts,
  name: PortVariable,
) => {
  if (callerPorts[name] !== '') return Option.some(callerPorts[name]);
  const bare = !args.some((a) => a === '--port' || a.startsWith('--port='));
  const listensBy =
    (args[0] === 'web' && name === 'EXACT_PORT') || (args[0] === 'serve' && name === 'PORT');
  if (bare && listensBy) return Option.some(String(APPS[app].port));
  return Option.none();
};

/**
 * Whether `child` gets every port variable as `portFor` says (set to it, or removed from what it
 * inherits), and so listens on none but `app`'s ports.
 */
const portsHeld = (
  child: Spawned,
  app: App,
  args: ReadonlyArray<string>,
  callerPorts: CallerPorts,
) =>
  PORT_VARIABLES.every((name) =>
    Option.match(portFor(app, args, callerPorts, name), {
      onSome: (p) => child.env[name] === p && owned(app).has(p) && !child.removed.includes(name),
      onNone: () => !(name in child.env) && child.removed.includes(name),
    }),
  );

/**
 * The rule, written out: a run on the simulator (`ios`, or `test`, `verify` or `agent` on `ios`) tells its child when
 * the wrapper started, so the child clears the stale launch consoles before then, and runs under the build lock, so
 * the clear never unlinks a locked run's live consoles; any other run removes the variable.
 */
const clearsOnSimulator = (child: Spawned, args: ReadonlyArray<string>) => {
  const onSimulator =
    args[0] === 'ios' || (['test', 'verify', 'agent'].includes(args[0] ?? '') && args[1] === 'ios');
  const started = Rec.get(child.env, 'EXACT_KIT_CLEAR_BEFORE');
  const removed = child.removed.includes('EXACT_KIT_CLEAR_BEFORE');
  const locked =
    child.command === 'lockf' && child.args[0] === '-k' && child.args[1] === BUILD_LOCK;
  if (Option.isSome(started) && !locked) return false;
  if (onSimulator) return Option.exists(started, (at) => /^\d+$/.test(at)) && !removed;
  return Option.isNone(started) && removed;
};

/** `files` with `app`'s folder rewritten as `rewrite` says. */
const rewritten = (
  files: Readonly<Record<string, string>>,
  app: App,
  rewrite: (typeof REWRITES)[number],
) => {
  const at = `${PROBE}/apps/${app}`;
  if (rewrite === 'launcher') return { ...files, [`${at}/exact.mjs`]: EXACT_LAUNCHER };
  if (rewrite === 'notes')
    return { ...files, [`${at}/AGENTS.md`]: `${files[`${at}/AGENTS.md`] ?? ''}\n${EXACT_NOTES}` };
  if (rewrite === 'no launcher') return Rec.remove(files, `${at}/exact.mjs`);
  return files;
};

/**
 * Whether `child` is `args` run as the rule says: the clone, feedback off, the app's simulator and spare range, its
 * ports, the build lock for the native verbs alone, and the launcher with the app's folder, name and arguments.
 */
const ranAsPlanned = (
  child: Spawned,
  app: App,
  args: ReadonlyArray<string>,
  callerPorts: CallerPorts,
  clone: string,
) => {
  const locked =
    child.command === 'lockf' && child.args[0] === '-k' && child.args[1] === BUILD_LOCK;
  const { lo, hi, turns } = rangeHeld(app, args, listenerFor(args, callerPorts));
  return (
    child.extendEnv &&
    child.env['EXACT'] === clone &&
    child.env['EXACT_FEEDBACK'] === '0' &&
    child.env['EXACT_SIM'] === APPS[app].simulator &&
    child.env['PORT_LO'] === String(lo) &&
    child.env['PORT_HI'] === String(hi) &&
    Option.getOrElse(Rec.get(child.env, 'EXACT_PORT_TURNS'), () => '') === turns &&
    portsHeld(child, app, args, callerPorts) &&
    clearsOnSimulator(child, args) &&
    locked === mustLock(args) &&
    (locked || child.command === 'bun') &&
    child.args.slice(-args.length - 3).join('\u0000') ===
      [LAUNCHER, `${PROBE}/apps/${app}`, app, ...args].join('\u0000')
  );
};

describe('the exact wrapper', () => {
  it.effect(
    "refuses publishing, rewriting the launcher, feedback, a quiet app's launch outside the agent, other devices and ports, and a rewritten launcher, before any process; runs the rest on the app own simulator, clone, ports and lock",
    () =>
      Effect.gen(function* () {
        const { pins, files } = yield* fixtures;
        const [pin = ''] = pins;
        const result = yield* Arbitrary.checkEffect(
          Case,
          ({
            app,
            verb,
            rest,
            callerSim,
            callerFeedback,
            callerExact,
            callerPorts,
            start,
            rewrite,
          }) =>
            Effect.gen(function* () {
              const args = argsOf(verb, rest, start);
              const caller = Rec.filter(
                {
                  HOME: `${PROBE}/home`,
                  EXACT_SIM: callerSim,
                  EXACT_FEEDBACK: callerFeedback,
                  EXACT: callerExact,
                  ...callerPorts,
                },
                (value) => value !== '',
              );
              const clone = Option.getOrElse(
                Rec.get(caller, 'EXACT'),
                () => `${PROBE}/home/${DEFAULT_CLONE}`,
              );
              const {
                result: ran,
                spawned,
                claims,
              } = yield* running(
                app,
                args,
                caller,
                Option.some(pin),
                rewritten(files, app, rewrite),
              );
              if (mustRefuse(app, args, callerPorts, rewrite))
                return (
                  ran._tag === 'Failure' &&
                  ran.failure._tag === 'ExactRefused' &&
                  spawned.length === 0 &&
                  claims.length === 0
                );
              const [git, child, ...more] = spawned;
              if (ran._tag !== 'Success' || !git || !child || more.length > 0) return false;
              const listener = listenerFor(args, callerPorts);
              return (
                Bun.deepEquals(
                  claims.map((c) => [c.asked, c.given]),
                  Arr.filter([[listener, true]], () => listener !== 'none'),
                ) &&
                git.command === 'git' &&
                git.args.join(' ') === `-C ${clone} rev-parse HEAD` &&
                ranAsPlanned(child, app, args, callerPorts, clone)
              );
            }),
          { runs: 500 },
        );
        expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
      }),
  );

  it.effect(
    'refuses update, and a launcher update rewrote, naming how to restore it; starts nothing',
    () =>
      Effect.gen(function* () {
        const { pins, files } = yield* fixtures;
        const head = Option.fromNullishOr(pins[0]);
        const update = yield* running('heartseed-exact', ['update'], { HOME: PROBE }, head, files);
        expect(update.result._tag).toBe('Failure');
        expect(update.spawned).toEqual([]);
        const after = yield* running(
          'heartseed-exact',
          ['share'],
          { HOME: PROBE },
          head,
          rewritten(files, 'heartseed-exact', 'launcher'),
        );
        expect(after.result._tag).toBe('Failure');
        const web = yield* running(
          'hymnal-exact',
          ['test', 'web'],
          { HOME: PROBE },
          head,
          rewritten(files, 'hymnal-exact', 'notes'),
        );
        expect(web.spawned).toEqual([]);
        if (web.result._tag !== 'Failure') return;
        expect(web.result.failure.message).toContain(
          `git checkout -- ${PROBE}/apps/hymnal-exact/exact.mjs`,
        );
      }),
  );

  it.effect('refuses a clone off the pin, naming both commits, and starts nothing after git', () =>
    Effect.gen(function* () {
      const { pins, files } = yield* fixtures;
      const [pin = ''] = pins;
      const elsewhere = 'f'.repeat(40);
      const { result, spawned } = yield* running(
        'heartseed-exact',
        ['test', 'web'],
        { HOME: PROBE },
        Option.some(elsewhere),
        files,
      );
      expect(result._tag).toBe('Failure');
      if (result._tag !== 'Failure') return;
      expect(result.failure.message).toContain(elsewhere);
      expect(result.failure.message).toContain(pin);
      expect(result.failure.message).toContain('bun packages/exact-kit/src/patch.ts');
      expect(spawned.map((s) => s.command)).toEqual(['git']);
    }),
  );

  it.effect('refuses with how to clone when there is no clone', () =>
    Effect.gen(function* () {
      const { files } = yield* fixtures;
      const { result, spawned } = yield* running(
        'hymnal-exact',
        ['web'],
        { EXACT: `${PROBE}/none` },
        Option.none(),
        files,
      );
      expect(result._tag).toBe('Failure');
      if (result._tag !== 'Failure') return;
      expect(result.failure.message).toContain(`no Exact clone at ${PROBE}/none`);
      expect(result.failure.message).toContain(
        `EXACT=${PROBE}/none bun packages/exact-kit/src/patch.ts`,
      );
      expect(spawned.map((s) => s.command)).toEqual(['git']);
    }),
  );

  it.effect(
    "serves on the app's own port by PORT, refuses a caller's PORT not the app's, and drops it from every other verb",
    () =>
      Effect.gen(function* () {
        const { pins, files } = yield* fixtures;
        const head = Option.fromNullishOr(pins[0]);
        const hymnal = yield* running('hymnal-exact', ['serve'], { HOME: PROBE }, head, files);
        expect(hymnal.spawned[1]?.env['PORT']).toBe('8766');
        expect(hymnal.spawned[1]?.removed).toEqual([
          'EXACT_PORT',
          'EXACT_TOOL_PORT',
          'EXACT_KIT_CLEAR_BEFORE',
        ]);
        const heartseed = yield* running(
          'heartseed-exact',
          ['serve'],
          { HOME: PROBE },
          head,
          files,
        );
        expect(heartseed.spawned[1]?.env['PORT']).toBe('8765');
        const theirs = yield* running(
          'heartseed-exact',
          ['serve'],
          { HOME: PROBE, PORT: '8281' },
          head,
          files,
        );
        expect(theirs.spawned).toEqual([]);
        expect(theirs.result._tag).toBe('Failure');
        if (theirs.result._tag === 'Failure')
          expect(theirs.result.failure.message).toContain('PORT=8281');
        const given = yield* running(
          'hymnal-exact',
          ['serve', '--port', '8777'],
          { HOME: PROBE },
          head,
          files,
        );
        expect(given.spawned[1]?.removed).toContain('PORT');
      }),
  );

  it.effect(
    "refuses a quiet app's `ios --run` and `mac --run`, naming the agent, and starts nothing; the hymnal's runs under the lock",
    () =>
      Effect.gen(function* () {
        const { pins, files } = yield* fixtures;
        const head = Option.fromNullishOr(pins[0]);
        for (const app of ['heartseed-exact', 'lab'] as const) {
          const ios = yield* running(app, ['ios', '--run'], { HOME: PROBE }, head, files);
          expect(ios.spawned).toEqual([]);
          expect(ios.result._tag).toBe('Failure');
          if (ios.result._tag === 'Failure')
            expect(ios.result.failure.message).toContain('agent ios');
          const mac = yield* running(app, ['mac', '--run'], { HOME: PROBE }, head, files);
          expect(mac.spawned).toEqual([]);
          if (mac.result._tag === 'Failure')
            expect(mac.result.failure.message).toContain('agent macos');
          const built = yield* running(app, ['ios'], { HOME: PROBE }, head, files);
          expect(built.result._tag).toBe('Success');
          expect(built.spawned[1]?.args.slice(0, 2)).toEqual(['-k', BUILD_LOCK]);
          expect(built.spawned[1]?.command).toBe('lockf');
          expect(built.spawned[1]?.env['EXACT_KIT_CLEAR_BEFORE']).toMatch(/^\d+$/);
        }
        const hymnal = yield* running(
          'hymnal-exact',
          ['ios', '--run'],
          { HOME: PROBE },
          head,
          files,
        );
        expect(hymnal.result._tag).toBe('Success');
        expect(hymnal.spawned[1]?.command).toBe('lockf');
      }),
  );

  it.effect('the lab serves on 8774 alone, on Heartseed simulator', () =>
    Effect.gen(function* () {
      const { pins, files } = yield* fixtures;
      const head = Option.fromNullishOr(pins[0]);
      const tested = yield* running('lab', ['test', 'web'], { HOME: PROBE }, head, files);
      expect(tested.spawned[1]?.env).toMatchObject({
        EXACT_SIM: 'verify-heartseed-exact',
        PORT_LO: '8774',
        PORT_HI: '8774',
      });
      const web = yield* running('lab', ['web'], { HOME: PROBE }, head, files);
      expect(web.spawned[1]?.env['EXACT_PORT']).toBe('8774');
      const other = yield* running(
        'lab',
        ['test', 'web', '--port', '8773'],
        { HOME: PROBE },
        head,
        files,
      );
      expect(other.spawned).toEqual([]);
      const macos = yield* running('lab', ['test', 'macos'], { HOME: PROBE }, head, files);
      expect(macos.spawned[1]?.args.slice(0, 2)).toEqual(['-k', BUILD_LOCK]);
    }),
  );

  it.effect(
    "gives test and agent the checkout's own fixture origin unless the caller names one, and no build, dev loop or serve any",
    () =>
      Effect.gen(function* () {
        const { pins, files } = yield* fixtures;
        const head = Option.fromNullishOr(pins[0]);
        const origin = `http://127.0.0.1:${fixturePort(`${PROBE}/apps/hymnal-exact`)}`;
        const given = (app: App, args: ReadonlyArray<string>, caller: Caller = {}) =>
          Effect.map(
            running(app, args, { HOME: PROBE, ...caller }, head, files),
            ({ spawned }) => spawned[1]?.env['HYMNAL_RECORDINGS'],
          );
        expect(fixturePort(`${PROBE}/apps/hymnal-exact`)).toBeGreaterThanOrEqual(4790);
        expect(fixturePort(`${PROBE}/apps/hymnal-exact`)).toBeLessThanOrEqual(5789);
        expect(fixturePort(`${PROBE}/apps/hymnal-exact`)).not.toBe(
          fixturePort(`${PROBE}/other/hymnal-exact`),
        );
        expect(yield* given('hymnal-exact', ['test', 'web'])).toBe(origin);
        expect(yield* given('hymnal-exact', ['test', 'ios', 'player.test.contract'])).toBe(origin);
        expect(yield* given('hymnal-exact', ['agent', 'web', '--json'])).toBe(origin);
        expect(
          yield* given('hymnal-exact', ['test', 'web'], {
            HYMNAL_RECORDINGS: 'http://127.0.0.1:4797',
          }),
        ).toBeUndefined();
        for (const args of [['web-build', '--out', 'dist'], ['web'], ['serve', 'dist'], ['ios']])
          expect(yield* given('hymnal-exact', args)).toBeUndefined();
        expect(yield* given('heartseed-exact', ['test', 'web'])).toBeUndefined();
      }),
  );

  it.effect('refuses an app it does not know', () =>
    Effect.gen(function* () {
      const { pins, files } = yield* fixtures;
      const { result, spawned } = yield* running(
        'heartseed',
        ['web'],
        { HOME: PROBE },
        Option.fromNullishOr(pins[0]),
        files,
      );
      expect(result._tag).toBe('Failure');
      expect(spawned).toEqual([]);
    }),
  );

  it.effect(
    "serves the web loop on the app own port, every other web host on ports it claims from its spare range without the caller's EXACT_PORT (verify all of them, test two, so each page at once finds one), and refuses a caller's EXACT_PORT not the app's",
    () =>
      Effect.gen(function* () {
        const { pins, files } = yield* fixtures;
        const head = Option.fromNullishOr(pins[0]);
        const { spawned } = yield* running('hymnal-exact', ['web'], { HOME: PROBE }, head, files);
        expect(spawned[1]?.env).toMatchObject({
          EXACT_PORT: '8766',
          PORT_LO: '8775',
          PORT_HI: '8779',
        });
        const tested = yield* running(
          'heartseed-exact',
          ['test', 'web'],
          { HOME: PROBE },
          head,
          files,
        );
        expect(tested.spawned[1]?.env).toMatchObject({
          PORT_LO: '8770',
          PORT_HI: '8771',
          EXACT_PORT_TURNS: '8770,8771',
        });
        expect(tested.claims).toEqual([{ asked: 'claimed', ports: [8770, 8771], given: true }]);
        const verified = yield* running(
          'heartseed-exact',
          ['verify', 'web'],
          { HOME: PROBE },
          head,
          files,
        );
        expect(verified.spawned[1]?.env).toMatchObject({
          PORT_LO: '8770',
          PORT_HI: '8774',
          EXACT_PORT_TURNS: '8770,8771,8772,8773,8774',
        });
        const driven = yield* running(
          'heartseed-exact',
          ['agent', 'web', '--port', '8772', 'tree'],
          { HOME: PROBE, EXACT_PORT_TURNS: '8772' },
          head,
          files,
        );
        expect(driven.claims).toEqual([{ asked: 8772, ports: [8772, 8772], given: true }]);
        expect(driven.spawned[1]?.env).toMatchObject({
          PORT_LO: '8770',
          PORT_HI: '8774',
          EXACT_PORT_TURNS: '8772',
        });
        expect(tested.spawned[1]?.removed).toEqual([
          'EXACT_PORT',
          'PORT',
          'EXACT_TOOL_PORT',
          'EXACT_KIT_CLEAR_BEFORE',
        ]);
        const hymnals = yield* running(
          'hymnal-exact',
          ['test', 'web'],
          { HOME: PROBE, EXACT_PORT: '8281' },
          head,
          files,
        );
        expect(hymnals.spawned).toEqual([]);
        if (hymnals.result._tag !== 'Failure') return;
        expect(hymnals.result.failure.message).toContain('EXACT_PORT=8281');
      }),
  );

  it.effect(
    "a verify gives its ports back once Exact records its host's run, while its child runs on; another host's record, none, a test's, or a run another verify of the checkout started before it or after its own start keeps them",
    () =>
      Effect.gen(function* () {
        const { pins, files } = yield* fixtures;
        const head = Option.fromNullishOr(pins[0]);
        const record = `${PROBE}/apps/heartseed-exact/.exact/verify/last.json`;
        const runFor = (args: ReadonlyArray<string>, folder: Record<string, string>) =>
          Effect.gen(function* () {
            const done = yield* Deferred.make<void>();
            const claims: Array<Claimed> = [];
            const fiber = yield* Effect.forkChild(
              running('heartseed-exact', args, { HOME: PROBE }, head, folder, {
                exited: Deferred.await(done),
                claims,
              }),
            );
            yield* TestClock.adjust('3 seconds');
            const given = () => claims.map((c) => c.given);
            const end = Effect.andThen(Deferred.done(done, Exit.void), Fiber.join(fiber));
            return { claims, given, end };
          });

        const named = { ...files, [record]: '{"web":1000,"ios":5}' };
        const verify = yield* runFor(['verify', 'web'], named);
        expect(verify.claims.map((c) => c.ports)).toEqual([[8770, 8774]]);
        expect(verify.given()).toEqual([false]);
        named[record] = '{"web":1000,"ios":9}';
        yield* TestClock.adjust('3 seconds');
        expect(verify.given()).toEqual([false]);
        named[record] = '{"web":1200,"ios":9}';
        yield* TestClock.adjust('3 seconds');
        expect(verify.given()).toEqual([true]);
        expect((yield* verify.end).result._tag).toBe('Success');

        const bare = { ...files };
        const first = yield* runFor(['verify', '--json'], bare);
        yield* TestClock.adjust('3 seconds');
        expect(first.given()).toEqual([false]);
        bare[record] = '{"web":800}';
        yield* TestClock.adjust('3 seconds');
        expect(first.given()).toEqual([true]);
        yield* first.end;

        const never = yield* runFor(['verify', 'web'], { ...files });
        yield* TestClock.adjust('30 minutes');
        expect(never.given()).toEqual([false]);
        yield* never.end;
        expect(never.given()).toEqual([true]);

        const tested = { ...files };
        const test = yield* runFor(['test', 'web'], tested);
        tested[record] = '{"web":800}';
        yield* TestClock.adjust('3 seconds');
        expect(test.given()).toEqual([false]);
        yield* test.end;

        const shared = { ...files };
        const ranged = yield* runFor(['verify', 'web'], shared);
        yield* TestClock.adjust('37 seconds');
        shared[record] = '{"web":10000}';
        yield* TestClock.adjust('3 seconds');
        expect(ranged.given()).toEqual([false]);
        shared[record] = '{"web":50000}';
        yield* TestClock.adjust('3 seconds');
        expect(ranged.given()).toEqual([false]);
        yield* TestClock.adjust('54 seconds');
        shared[record] = '{"web":98500}';
        yield* TestClock.adjust('3 seconds');
        expect(ranged.given()).toEqual([true]);
        yield* ranged.end;
      }),
  );

  it.effect(
    "a verify on any host whose child still runs two minutes after its report is stopped, its group ended, saying the device run's result: exit 124 when that host's run recorded clean, 1 when it recorded a failure, or nothing, or only another host's run; one whose child ends first, or that never reports, runs to its child's end",
    () =>
      Effect.gen(function* () {
        const { pins, files } = yield* fixtures;
        const head = Option.fromNullishOr(pins[0]);
        const at = `${PROBE}/apps/hymnal-exact/.exact`;
        const start = (args: ReadonlyArray<string>, folder: Record<string, string>) =>
          Effect.gen(function* () {
            const done = yield* Deferred.make<void>();
            const said: Array<string> = [];
            const kills: Array<true> = [];
            const fiber = yield* Effect.forkChild(
              running('hymnal-exact', args, { HOME: PROBE }, head, folder, {
                exited: Deferred.await(done),
                kill: Effect.sync(() => kills.push(true)),
              }).pipe(
                Effect.provideService(Console.Console, {
                  ...globalThis.console,
                  error: (...line: ReadonlyArray<unknown>) => said.push(line.join(' ')),
                }),
              ),
            );
            yield* TestClock.adjust('3 seconds');
            const code = Effect.map(Fiber.join(fiber), ({ result }) => Result.map(result, Number));
            return { fiber, said, kills, code, exit: Deferred.done(done, Exit.void) };
          });

        const hung = { ...files };
        const ios = yield* start(['verify', 'ios'], hung);
        hung[`${at}/verify/last.json`] = '{"ios":2500}';
        hung[`${at}/runs.jsonl`] =
          '{"at":"1970-01-01T00:00:01.000Z","host":"ios","what":"verify","result":"2 problems, 1 failed test"}\n';
        yield* TestClock.adjust('1 second');
        yield* TestClock.adjust('119 seconds');
        expect(ios.fiber.pollUnsafe()).toBeUndefined();
        yield* TestClock.adjust('1 second');
        expect(yield* ios.code).toEqual(Result.succeed(1));
        expect(ios.kills).toEqual([true]);
        expect(ios.said.join('\n')).toContain('verify ios wrote its report 2m ago');
        expect(ios.said.join('\n')).toContain('exit 1:');
        expect(ios.said.join('\n')).toContain('recorded "2 problems, 1 failed test"');

        const clean = { ...files };
        const passed = yield* start(['verify', 'ios'], clean);
        clean[`${at}/verify/last.json`] = '{"ios":2500}';
        clean[`${at}/runs.jsonl`] =
          '{"at":"1970-01-01T00:02:10.000Z","host":"ios","what":"verify","result":"clean"}\n';
        yield* TestClock.adjust('121 seconds');
        expect(yield* passed.code).toEqual(Result.succeed(124));
        expect(passed.said.join('\n')).toContain('exit 124:');
        expect(passed.said.join('\n')).toContain('recorded "clean"');

        const elsewhere = { ...files };
        const other = yield* start(['verify', 'ios'], elsewhere);
        elsewhere[`${at}/verify/last.json`] = '{"ios":2500}';
        elsewhere[`${at}/runs.jsonl`] =
          '{"at":"1970-01-01T00:04:20.000Z","host":"web","what":"verify","result":"clean"}\n';
        yield* TestClock.adjust('121 seconds');
        expect(yield* other.code).toEqual(Result.succeed(1));
        expect(other.said.join('\n')).toContain('recorded no result');

        const stale = { ...files };
        const web = yield* start(['verify'], stale);
        stale[`${at}/verify/last.json`] = '{"web":2500}';
        stale[`${at}/runs.jsonl`] =
          '{"at":"1969-12-31T23:59:58.000Z","host":"web","what":"verify","result":"clean"}\n';
        yield* TestClock.adjust('121 seconds');
        expect(yield* web.code).toEqual(Result.succeed(1));
        expect(web.said.join('\n')).toContain('recorded no result');

        const ended = { ...files };
        const quick = yield* start(['verify', 'ios'], ended);
        ended[`${at}/verify/last.json`] = '{"ios":2500}';
        yield* TestClock.adjust('60 seconds');
        yield* quick.exit;
        expect(yield* quick.code).toEqual(Result.succeed(0));
        expect(quick.kills).toEqual([]);
        expect(quick.said).toEqual([]);

        const silent = yield* start(['verify', 'ios'], { ...files });
        yield* TestClock.adjust('2 hours');
        expect(silent.fiber.pollUnsafe()).toBeUndefined();
        yield* silent.exit;
        expect(yield* silent.code).toEqual(Result.succeed(0));
        expect(silent.kills).toEqual([]);
      }),
  );

  it.scopedLive(
    'ends what its child left in its process group when the child exits or the run is interrupted',
    () =>
      Effect.gen(function* () {
        const { pins, files } = yield* fixtures;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'exact-kit-tree-' });
        const appDir = path.join(dir, 'heartseed-exact');
        yield* fs.makeDirectory(appDir);
        yield* fs.writeFileString(
          path.join(appDir, 'exact.mjs'),
          files[`${PROBE}/apps/heartseed-exact/exact.mjs`] ?? '',
        );
        const launcher = path.join(dir, 'launcher.cjs');
        yield* fs.writeFileString(launcher, LINGERING);
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const alive = (pid: number) =>
          spawner
            .string(
              ChildProcess.make('ps', ['-p', String(pid), '-o', 'pid='], {
                forceKillAfter: Duration.seconds(5),
              }),
            )
            .pipe(
              Effect.map((out) => out.trim() !== ''),
              Effect.orElseSucceed(() => false),
            );
        const left: Array<number> = [];
        yield* Effect.addFinalizer(() =>
          Effect.forEach(left, (pid) =>
            Effect.flatMap(alive(pid), (still) =>
              Effect.sync(() => {
                if (still && pid > 1) process.kill(pid, 'SIGKILL');
              }),
            ),
          ),
        );
        const pidOf = (run: string) =>
          Effect.map(fs.readFileString(path.join(appDir, `${run}.pid`)), Number);
        const runIn = (args: ReadonlyArray<string>) =>
          runExact(appDir, args, launcher).pipe(
            Effect.provide(
              Layer.mergeAll(
                Layer.succeed(PortClaims, claimsStandIn([])),
                ConfigProvider.layer(
                  ConfigProvider.fromUnknown({ HOME: PROBE, EXACT: `${PROBE}/clone` }),
                ),
                Layer.effect(
                  ChildProcessSpawner.ChildProcessSpawner,
                  Effect.map(ChildProcessSpawner.ChildProcessSpawner, (real) =>
                    ChildProcessSpawner.make((command) => {
                      if (command._tag === 'StandardCommand' && command.command === 'git')
                        return Effect.succeed(handleOf(`${pins[0] ?? ''}\n`, 0));
                      return real.spawn(command);
                    }),
                  ),
                ),
              ).pipe(Layer.provideMerge(BunServices.layer)),
            ),
          );

        expect(Number(yield* runIn(['contract', 'build']))).toBe(0);
        const exited = yield* pidOf('exited');
        left.push(exited);
        expect(yield* alive(exited)).toBe(false);

        const fiber = yield* Effect.forkChild(runIn(['contract', 'build', 'wait']));
        const waited = yield* pidOf('waited').pipe(
          Effect.retry({ schedule: Schedule.spaced('10 millis'), times: 300 }),
        );
        left.push(waited);
        expect(yield* alive(waited)).toBe(true);
        yield* Fiber.interrupt(fiber);
        expect(yield* alive(waited)).toBe(false);
      }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scopedLive(
    "sets aside a linked package's One route types while Exact runs, and puts them back after a pass, a failure or an interruption, unless a dev server wrote newer ones",
    () =>
      Effect.gen(function* () {
        const { pins, files } = yield* fixtures;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'exact-kit-routes-' });
        const appDir = path.join(dir, 'apps', 'hymnal-exact');
        const linked = path.join(dir, 'apps', 'hymnal');
        const routes = path.join(linked, 'app', 'routes.d.ts');
        const written = "import type { OneRouter } from 'one';\n";
        yield* fs.makeDirectory(path.join(appDir, 'node_modules', '@manna'), { recursive: true });
        yield* fs.makeDirectory(path.join(linked, 'app'), { recursive: true });
        yield* fs.writeFileString(
          path.join(appDir, 'exact.mjs'),
          files[`${PROBE}/apps/hymnal-exact/exact.mjs`] ?? '',
        );
        yield* fs.writeFileString(
          path.join(appDir, 'package.json'),
          '{ "dependencies": { "@manna/hymnal-app": "workspace:*", "effect": "4.1.4" } }',
        );
        yield* fs.symlink(linked, path.join(appDir, 'node_modules', '@manna', 'hymnal-app'));
        const seen: Array<boolean> = [];
        const runWith = (
          code: number,
          during: Effect.Effect<void, unknown> = Effect.void,
          exited: Effect.Effect<void> = Effect.void,
        ) =>
          runExact(appDir, ['contract', 'build'], LAUNCHER).pipe(
            Effect.provide(
              Layer.mergeAll(
                Layer.succeed(PortClaims, claimsStandIn([])),
                ConfigProvider.layer(
                  ConfigProvider.fromUnknown({ HOME: PROBE, EXACT: `${PROBE}/clone` }),
                ),
                Layer.succeed(
                  ChildProcessSpawner.ChildProcessSpawner,
                  ChildProcessSpawner.make((command) => {
                    if (command._tag === 'StandardCommand' && command.command === 'git')
                      return Effect.succeed(handleOf(`${pins[0] ?? ''}\n`, 0));
                    return fs.exists(routes).pipe(
                      Effect.tap((there) => Effect.sync(() => seen.push(there))),
                      Effect.andThen(during),
                      Effect.orDie,
                      Effect.as(handleOf('', code, exited)),
                    );
                  }),
                ),
              ),
            ),
          );
        const after = Effect.all([
          fs.readFileString(routes),
          fs.readDirectory(path.join(linked, 'app')),
        ]);

        yield* fs.writeFileString(routes, written);
        expect(Number(yield* runWith(0))).toBe(0);
        expect(yield* after).toEqual([written, ['routes.d.ts']]);

        expect(Number(yield* runWith(1))).toBe(1);
        expect(yield* after).toEqual([written, ['routes.d.ts']]);

        const newer = `${written}// newer\n`;
        expect(Number(yield* runWith(0, fs.writeFileString(routes, newer)))).toBe(0);
        expect(yield* after).toEqual([newer, ['routes.d.ts']]);

        const started = yield* Deferred.make<boolean>();
        const fiber = yield* Effect.forkChild(
          runWith(0, Deferred.succeed(started, true), Effect.never),
        );
        yield* Deferred.await(started);
        expect(yield* fs.exists(routes)).toBe(false);
        yield* Fiber.interrupt(fiber);
        expect(yield* after).toEqual([newer, ['routes.d.ts']]);

        expect(seen).toEqual([false, false, false, false]);
      }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('docs/exact.md names the pin the wrapper runs at, then the base it is made from', () =>
    Effect.gen(function* () {
      const { pins, files } = yield* fixtures;
      expect(pins.length).toBe(2);
      expect(pins[1]).toBe(EXACT_BASE);
      const { result } = yield* running(
        'heartseed-exact',
        ['web'],
        { HOME: PROBE },
        Option.fromNullishOr(pins[0]),
        files,
      );
      expect(result._tag).toBe('Success');
    }),
  );

  it.effect(
    "each app's `bun run exact` is the kit's command, so a rewritten exact.mjs cannot take the wrapper out",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* repoRoot;
        const scripts = yield* Effect.forEach(APP_NAMES, (app) =>
          Effect.map(
            fs.readFileString(path.join(root, APPS[app].folder, 'package.json')),
            (text) => /"exact":\s*"([^"]*)"/.exec(text)?.[1] ?? '',
          ),
        );
        for (const script of scripts) expect(script).toMatch(/(?:^|&& )manna-exact$/);
      }).pipe(Effect.provide(BunServices.layer)),
  );
});
