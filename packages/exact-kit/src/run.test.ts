import * as BunServices from '@effect/platform-bun/BunServices';
import {
  ConfigProvider,
  Effect,
  Option,
  Record as Rec,
  FileSystem,
  Layer,
  Path,
  Schema,
  Sink,
  Stream,
} from 'effect';
import * as Arbitrary from 'effect/Arbitrary';
import { ChildProcessSpawner } from 'effect/process';
import { describe, expect, it } from 'effect-bun-test';

import { runExact } from './run.ts';

const PROBE = '/nonexistent/loop-probe-x';
const LAUNCHER = `${PROBE}/exact-cli.ts`;

/** The apps, their simulators and ports, and the lock, as the spec names them: written out apart from the wrapper. */
const APPS = {
  'heartseed-exact': { simulator: 'verify-heartseed-exact', port: 8765, spare: [8770, 8774] },
  'hymnal-exact': { simulator: 'verify-hymnal-exact', port: 8766, spare: [8775, 8779] },
} as const;
const BUILD_LOCK = '/tmp/manna-exact-build.lock';
const DEFAULT_CLONE = 'Developer/vendor/exact';

/** The commits `docs/exact.md` names: the pin alone, the clone's HEAD every run here stands in with but the off-pin ones. */
const docsPins = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const here = yield* path.fromFileUrl(new URL('.', import.meta.url));
  const doc = yield* fs.readFileString(path.join(here, '..', '..', '..', 'docs', 'exact.md'));
  return [...new Set([...doc.matchAll(/\b[0-9a-f]{40}\b/g)].map((m) => m[0]))];
}).pipe(Effect.provide(BunServices.layer));

/** A process the stand-in was asked to start: its command, arguments and options. */
interface Spawned {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly env: Readonly<Record<string, string>>;
  readonly extendEnv: boolean;
}

const handleOf = (stdout: string, exitCode: number) =>
  ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(0),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(exitCode)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    stdin: Sink.drain,
    stdout: Stream.make(new TextEncoder().encode(stdout)),
    stderr: Stream.empty,
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
    unref: Effect.succeed(Effect.void),
  });

/** A spawner that starts nothing: it keeps each command, answers git's `rev-parse` with `head` (none: no clone), and every other command with 0. */
const standIn = (head: Option.Option<string>, spawned: Array<Spawned>) =>
  ChildProcessSpawner.make((command) => {
    if (command._tag !== 'StandardCommand') return Effect.succeed(handleOf('', 0));
    spawned.push({
      command: command.command,
      args: command.args.map(String),
      env: Rec.map(command.options.env ?? {}, String),
      extendEnv: command.options.extendEnv === true,
    });
    if (command.command === 'git' && Option.isNone(head)) return Effect.succeed(handleOf('', 128));
    if (command.command === 'git')
      return Effect.succeed(handleOf(`${Option.getOrElse(head, () => '')}\n`, 0));
    return Effect.succeed(handleOf('', 0));
  });

/** The caller's environment: what the wrapper may read (`HOME`, `EXACT`) and what it must override. */
type Caller = Readonly<Record<string, string>>;

const running = (
  app: keyof typeof APPS,
  args: ReadonlyArray<string>,
  caller: Caller,
  head: Option.Option<string>,
) => {
  const spawned: Array<Spawned> = [];
  return runExact(`${PROBE}/apps/${app}`, args, LAUNCHER).pipe(
    Effect.result,
    Effect.provide(
      Layer.mergeAll(
        BunServices.layer,
        Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, standIn(head, spawned)),
        ConfigProvider.layer(ConfigProvider.fromUnknown(caller)),
      ),
    ),
    Effect.map((result) => ({ result, spawned })),
  );
};

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
  'pattern',
  'update',
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

const Case = Arbitrary.all({
  app: Arbitrary.schema(Schema.Literals(['heartseed-exact', 'hymnal-exact'])),
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
});

/** The rule, written out apart from the wrapper: what it must refuse. */
const mustRefuse = (app: keyof typeof APPS, args: ReadonlyArray<string>) => {
  const [verb = '', ...rest] = args;
  if (['share', 'deploy', 'release'].includes(verb)) return true;
  if (verb === 'feedback' && rest.join(' ') !== 'never') return true;
  if (args.some((a) => /^--(?:sim|device)(?:=|$)/.test(a))) return true;
  const { port: own, spare } = APPS[app];
  const allowed = new Set(
    [own, ...Array.from({ length: spare[1] - spare[0] + 1 }, (_, i) => spare[0] + i)].map(String),
  );
  return args.some(
    (a, i) =>
      (a === '--port' && !allowed.has(args[i + 1] ?? '')) ||
      (a.startsWith('--port=') && !allowed.has(a.slice(7))),
  );
};

/** The rule, written out: what runs under the build lock. */
const mustLock = (args: ReadonlyArray<string>) =>
  args[0] === 'ios' ||
  args[0] === 'mac' ||
  (['test', 'verify', 'agent'].includes(args[0] ?? '') && args[1] === 'ios');

describe('the exact wrapper', () => {
  it.effect(
    'refuses publishing, feedback, other devices and ports before any process; runs the rest on the app own simulator, clone and lock',
    () =>
      Effect.gen(function* () {
        const [pin = ''] = yield* docsPins;
        const result = yield* Arbitrary.checkEffect(
          Case,
          ({ app, verb, rest, callerSim, callerFeedback, callerExact }) =>
            Effect.gen(function* () {
              const args = [verb, ...rest];
              const caller = Rec.filter(
                {
                  HOME: `${PROBE}/home`,
                  EXACT_SIM: callerSim,
                  EXACT_FEEDBACK: callerFeedback,
                  EXACT: callerExact,
                },
                (value) => value !== '',
              );
              const clone = Option.getOrElse(
                Rec.get(caller, 'EXACT'),
                () => `${PROBE}/home/${DEFAULT_CLONE}`,
              );
              const { result: ran, spawned } = yield* running(app, args, caller, Option.some(pin));
              if (mustRefuse(app, args))
                return (
                  ran._tag === 'Failure' &&
                  ran.failure._tag === 'ExactRefused' &&
                  spawned.length === 0
                );
              const [git, child, ...more] = spawned;
              if (ran._tag !== 'Success' || !git || !child || more.length > 0) return false;
              const locked =
                child.command === 'lockf' && child.args[0] === '-k' && child.args[1] === BUILD_LOCK;
              return (
                git.command === 'git' &&
                git.args.join(' ') === `-C ${clone} rev-parse HEAD` &&
                child.extendEnv &&
                child.env['EXACT'] === clone &&
                child.env['EXACT_FEEDBACK'] === '0' &&
                child.env['EXACT_SIM'] === APPS[app].simulator &&
                locked === mustLock(args) &&
                (locked || child.command === 'bun') &&
                child.args.slice(-args.length - 3).join('\u0000') ===
                  [LAUNCHER, `${PROBE}/apps/${app}`, app, ...args].join('\u0000')
              );
            }),
          { runs: 400 },
        );
        expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
      }),
  );

  it.effect('refuses a clone off the pin, naming both commits, and starts nothing after git', () =>
    Effect.gen(function* () {
      const [pin = ''] = yield* docsPins;
      const elsewhere = 'f'.repeat(40);
      const { result, spawned } = yield* running(
        'heartseed-exact',
        ['test', 'web'],
        { HOME: PROBE },
        Option.some(elsewhere),
      );
      expect(result._tag).toBe('Failure');
      if (result._tag !== 'Failure') return;
      expect(result.failure.message).toContain(elsewhere);
      expect(result.failure.message).toContain(pin);
      expect(spawned.map((s) => s.command)).toEqual(['git']);
    }),
  );

  it.effect('refuses with how to clone when there is no clone', () =>
    Effect.gen(function* () {
      const [pin = ''] = yield* docsPins;
      const { result, spawned } = yield* running(
        'hymnal-exact',
        ['web'],
        { EXACT: `${PROBE}/none` },
        Option.none(),
      );
      expect(result._tag).toBe('Failure');
      if (result._tag !== 'Failure') return;
      expect(result.failure.message).toContain(`no Exact clone at ${PROBE}/none`);
      expect(result.failure.message).toContain(`checkout --detach ${pin}`);
      expect(spawned.map((s) => s.command)).toEqual(['git']);
    }),
  );

  it.effect('refuses an app it does not know', () =>
    Effect.gen(function* () {
      const [pin = ''] = yield* docsPins;
      const spawned: Array<Spawned> = [];
      const result = yield* runExact(`${PROBE}/apps/heartseed`, ['web'], LAUNCHER).pipe(
        Effect.result,
        // oxlint-disable-next-line effect/noInlineProvide -- this case's own stand-in spawner
        Effect.provide(
          Layer.mergeAll(
            BunServices.layer,
            Layer.succeed(
              ChildProcessSpawner.ChildProcessSpawner,
              standIn(Option.some(pin), spawned),
            ),
            ConfigProvider.layer(ConfigProvider.fromUnknown({ HOME: PROBE })),
          ),
        ),
      );
      expect(result._tag).toBe('Failure');
      expect(spawned).toEqual([]);
    }),
  );

  it.effect(
    'serves the web loop on the app own port, and every other web host in its spare range',
    () =>
      Effect.gen(function* () {
        const [pin = ''] = yield* docsPins;
        const { spawned } = yield* running(
          'hymnal-exact',
          ['web'],
          { HOME: PROBE },
          Option.some(pin),
        );
        expect(spawned[1]?.env).toMatchObject({
          EXACT_PORT: '8766',
          PORT_LO: '8775',
          PORT_HI: '8779',
        });
        const tested = yield* running(
          'heartseed-exact',
          ['test', 'web'],
          { HOME: PROBE },
          Option.some(pin),
        );
        expect(tested.spawned[1]?.env).toMatchObject({ PORT_LO: '8770', PORT_HI: '8774' });
        expect(tested.spawned[1]?.env['EXACT_PORT']).toBeUndefined();
      }),
  );

  it.effect('docs/exact.md names one commit, the pin the wrapper runs at', () =>
    Effect.gen(function* () {
      const pins = yield* docsPins;
      expect(pins.length).toBe(1);
      const { result } = yield* running(
        'heartseed-exact',
        ['web'],
        { HOME: PROBE },
        Option.fromNullishOr(pins[0]),
      );
      expect(result._tag).toBe('Success');
    }),
  );
});
