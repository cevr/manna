import {
  Array as Arr,
  Config,
  Duration,
  Effect,
  FileSystem,
  Option,
  Path,
  Result,
  Schema,
  Stream,
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/** The Exact commit every command runs at. Only the `ex-pin` unit moves it (docs/exact.md). */
const EXACT_PIN = '0fa708e34ef4d2e49af98b25edc76bedc46ae7fa';

/** Where the clone is when `EXACT` names none: under the home folder. */
const DEFAULT_CLONE = 'Developer/vendor/exact';

/** The lock every native build and drive waits on, one at a time on this Mac. */
const BUILD_LOCK = '/tmp/manna-exact-build.lock';

/** An app this wrapper runs: its simulator, its web port and its spare ports. */
interface ExactApp {
  readonly simulator: string;
  readonly port: number;
  readonly spare: readonly [number, number];
}

/** The ported apps, by folder. Each drives its own simulator and serves on its own ports. */
const APPS: Readonly<Record<'heartseed-exact' | 'hymnal-exact', ExactApp>> = {
  'heartseed-exact': { simulator: 'verify-heartseed-exact', port: 8765, spare: [8770, 8774] },
  'hymnal-exact': { simulator: 'verify-hymnal-exact', port: 8766, spare: [8775, 8779] },
};

/** Verbs that publish or upload: never through this wrapper. */
const REFUSED_VERBS: ReadonlyArray<string> = ['share', 'deploy', 'release'];

/**
 * Verbs that rewrite the app's `exact.mjs` or its `AGENTS.md` with Exact's own: `update` writes Exact's
 * launcher, which runs its CLI past this wrapper, and both write Exact's notes, which tell agents to share
 * and send feedback.
 */
const REWRITING_VERBS: ReadonlyArray<string> = ['update', 'snapback'];

/** Each app's `exact.mjs`, byte for byte: the launcher into this wrapper. */
const KIT_LAUNCHER = `#!/usr/bin/env bun
import { main } from '@manna/exact-kit/main';

main(import.meta.dir, process.argv.slice(2));
`;

/** The line that opens Exact's generated block in an `AGENTS.md`. */
const EXACT_NOTES = '<!-- exact:begin';

/** Flags that would leave the app's simulator for another device, or name another simulator. */
const REFUSED_FLAGS: ReadonlyArray<string> = ['--sim', '--device'];

/** A command the wrapper will not run, and why. */
class ExactRefused extends Schema.TaggedError<ExactRefused>()('ExactRefused', {
  reason: Schema.String,
}) {
  override get message() {
    return `exact: ${this.reason}`;
  }
}

/** What runs: the child's arguments after Bun and the launcher, the variables set over the caller's, the caller's it removes, and whether it takes the build lock. */
interface Plan {
  readonly args: ReadonlyArray<string>;
  readonly env: Readonly<Record<string, string>>;
  readonly removed: ReadonlyArray<string>;
  readonly locked: boolean;
}

/** Whether `args` is a native build or drive: `ios`, `mac`, or `test`, `verify` or `agent` on `ios`. */
const isNative = (args: ReadonlyArray<string>) => {
  const [verb, host] = args;
  if (verb === 'ios' || verb === 'mac') return true;
  return ['test', 'verify', 'agent'].includes(verb ?? '') && host === 'ios';
};

/** Why `args`, with the caller's `EXACT_PORT` if it set one, is refused before any process starts, if it is. */
const refusalOf = (
  args: ReadonlyArray<string>,
  app: ExactApp,
  callerPort: Option.Option<string>,
): Option.Option<string> => {
  const [verb = '', ...rest] = args;
  if (REFUSED_VERBS.includes(verb))
    return Option.some(`${verb} publishes the app; it is the owner's to run, never an agent's`);
  if (REWRITING_VERBS.includes(verb))
    return Option.some(
      `${verb} writes Exact's own exact.mjs and AGENTS.md over this app's, which run Exact past this wrapper; it is the ex-pin unit's, by hand (docs/exact.md)`,
    );
  if (verb === 'feedback' && !(rest.length === 1 && rest[0] === 'never'))
    return Option.some('feedback goes to Expo; only `feedback never` runs here');
  const flag = Arr.findFirst(args, (arg) =>
    REFUSED_FLAGS.some((f) => arg === f || arg.startsWith(`${f}=`)),
  );
  const notOwned = (given: string) =>
    String(Number(given)) !== given || !ownsPort(app, Number(given));
  const range = `use ${app.port} or ${app.spare[0]}-${app.spare[1]}`;
  return Option.firstSomeOf([
    Option.map(
      flag,
      (given) => `${given} is refused: every drive uses ${app.simulator}, the app's own simulator`,
    ),
    Option.map(
      Arr.findFirst(portsOf(args), notOwned),
      (given) => `--port ${given} is not this app's: ${range}`,
    ),
    Option.map(
      Option.filter(callerPort, notOwned),
      (given) => `EXACT_PORT=${given} is not this app's: unset it, or ${range}`,
    ),
  ]);
};

/** Every port `args` names, as `--port <n>` or `--port=<n>`; a `--port` with nothing after names "". */
const portsOf = (args: ReadonlyArray<string>) =>
  args.flatMap((arg, i) => {
    if (arg === '--port') return [args[i + 1] ?? ''];
    if (arg.startsWith('--port=')) return [arg.slice('--port='.length)];
    return [];
  });

const ownsPort = (app: ExactApp, port: number) =>
  port === app.port || (port >= app.spare[0] && port <= app.spare[1]);

/**
 * The run of `args` for `app`, whose clone is at `clone`, with the caller's `EXACT_PORT` if it set one:
 * refused for a verb that publishes or rewrites the launcher, a feedback send, another device or
 * simulator, or a port not the app's; else the child's variables, set over whatever the caller's held:
 * the clone, feedback off, the app's simulator and ports. `EXACT_PORT` is the caller's when it is the
 * app's, else the app's own port for a bare `web`, else removed.
 */
const plan = (
  args: ReadonlyArray<string>,
  app: ExactApp,
  clone: string,
  callerPort: Option.Option<string>,
): Result.Result<Plan, ExactRefused> =>
  Option.match(refusalOf(args, app, callerPort), {
    onSome: (reason) => Result.fail(ExactRefused.make({ reason })),
    onNone: () => {
      const web = args[0] === 'web' && portsOf(args).length === 0;
      const port = Option.orElse(callerPort, () =>
        Option.filter(Option.some(String(app.port)), () => web),
      );
      return Result.succeed({
        args,
        locked: isNative(args),
        env: {
          EXACT: clone,
          EXACT2: clone,
          EXACT_FEEDBACK: '0',
          EXACT_SIM: app.simulator,
          PORT_LO: String(app.spare[0]),
          PORT_HI: String(app.spare[1]),
          ...Option.match(port, { onNone: () => ({}), onSome: (p) => ({ EXACT_PORT: p }) }),
        },
        removed: Option.match(port, { onNone: () => ['EXACT_PORT'], onSome: () => [] }),
      });
    },
  });

/**
 * Refused unless `appDir`'s `exact.mjs` is the kit's launcher and its `AGENTS.md` holds no block of
 * Exact's: a rewrite by `update` or by hand would run Exact past this wrapper, and its notes tell agents
 * to share and send feedback.
 */
const launcherHeld = (appDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const restore = `git checkout -- ${appDir}/exact.mjs ${appDir}/AGENTS.md`;
    const launcher = yield* Effect.orElseSucceed(
      fs.readFileString(path.join(appDir, 'exact.mjs')),
      () => '',
    );
    if (launcher !== KIT_LAUNCHER)
      return yield* ExactRefused.make({
        reason: `${appDir}/exact.mjs is not @manna/exact-kit's launcher, so Exact would run past this wrapper: ${restore}`,
      });
    const notes = yield* Effect.orElseSucceed(
      fs.readFileString(path.join(appDir, 'AGENTS.md')),
      () => '',
    );
    if (notes.includes(EXACT_NOTES))
      return yield* ExactRefused.make({
        reason: `${appDir}/AGENTS.md holds Exact's generated notes, which tell agents to share and send feedback: ${restore}`,
      });
  });

/** A byte stream as text. */
const text = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Stream.mkString(Stream.decodeText(stream));

/** The clone's `HEAD`, read with git; refused when there is no clone to read. */
const headOf = (clone: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make('git', ['-C', clone, 'rev-parse', 'HEAD'], {
          forceKillAfter: Duration.seconds(5),
        }),
      );
      const [head, code] = yield* Effect.all([text(handle.stdout), handle.exitCode], {
        concurrency: 2,
      });
      if (code !== 0) return yield* Effect.fail('no git checkout');
      return head.trim();
    }),
  ).pipe(
    Effect.mapError((error) =>
      ExactRefused.make({
        reason: `no Exact clone at ${clone} (${String(error)}): git clone https://github.com/expo/exact.git ${clone} && git -C ${clone} checkout --detach ${EXACT_PIN}, or set EXACT to the clone (docs/exact.md)`,
      }),
    ),
  );

/** The app whose folder is `name`, if the wrapper runs it. */
const appNamed = (name: string) =>
  Option.fromNullishOr(Object.entries(APPS).find(([folder]) => folder === name)?.[1]);

/**
 * Runs Exact's `args` for the app in `appDir` through `launcher` (exact-cli.ts): refused before any
 * process when the command is, then unless the app's `exact.mjs` and `AGENTS.md` are its own and the
 * clone is at the pin, then run with the plan's
 * variables over the caller's, a native build or drive under the build lock. The child's exit code.
 */
export const runExact = Effect.fn('ExactKit.run')(function* (
  appDir: string,
  args: ReadonlyArray<string>,
  launcher: string,
) {
  const path = yield* Path.Path;
  const name = path.basename(appDir);
  const app = yield* Effect.fromOption(appNamed(name)).pipe(
    Effect.mapError(() =>
      ExactRefused.make({
        reason: `${name} is not an app this wrapper runs (${Object.keys(APPS).join(', ')})`,
      }),
    ),
  );
  const home = yield* Config.String('HOME').pipe(Config.withDefault('~'));
  const clone = yield* Config.String('EXACT').pipe(
    Config.withDefault(path.join(home, DEFAULT_CLONE)),
  );
  const callerPort = yield* Config.option(Config.String('EXACT_PORT'));
  const planned = yield* Effect.fromResult(plan(args, app, clone, callerPort));
  yield* launcherHeld(appDir);
  const head = yield* headOf(clone);
  if (head !== EXACT_PIN)
    return yield* ExactRefused.make({
      reason: `the clone at ${clone} is at ${head}, not the pin ${EXACT_PIN}: git -C ${clone} checkout --detach ${EXACT_PIN}`,
    });
  const lock = Arr.filter(['lockf', '-k', BUILD_LOCK], () => planned.locked);
  const [command = 'bun', ...rest] = [...lock, 'bun', launcher, appDir, name, ...planned.args];
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.flatMap(
      spawner.spawn(
        ChildProcess.make(command, rest, {
          cwd: appDir,
          env: {
            ...planned.env,
            ...Object.fromEntries(
              // oxlint-disable-next-line effect/noNullish -- the spawner removes a variable set to undefined from the inherited environment
              planned.removed.map((name) => [name, undefined]),
            ),
          },
          extendEnv: true,
          stdin: 'inherit',
          stdout: 'inherit',
          stderr: 'inherit',
          forceKillAfter: Duration.seconds(5),
        }),
      ),
      (handle) => handle.exitCode,
    ),
  );
});
