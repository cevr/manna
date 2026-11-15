import {
  Array as Arr,
  Config,
  Duration,
  Effect,
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

/** What runs: the child's arguments after Bun and the launcher, the variables set over the caller's, and whether it takes the build lock. */
interface Plan {
  readonly args: ReadonlyArray<string>;
  readonly env: Readonly<Record<string, string>>;
  readonly locked: boolean;
}

/** Whether `args` is a native build or drive: `ios`, `mac`, or `test`, `verify` or `agent` on `ios`. */
const isNative = (args: ReadonlyArray<string>) => {
  const [verb, host] = args;
  if (verb === 'ios' || verb === 'mac') return true;
  return ['test', 'verify', 'agent'].includes(verb ?? '') && host === 'ios';
};

/** Why `args` is refused before any process starts, if it is. */
const refusalOf = (args: ReadonlyArray<string>, app: ExactApp): Option.Option<string> => {
  const [verb = '', ...rest] = args;
  if (REFUSED_VERBS.includes(verb))
    return Option.some(`${verb} publishes the app; it is the owner's to run, never an agent's`);
  if (verb === 'feedback' && !(rest.length === 1 && rest[0] === 'never'))
    return Option.some('feedback goes to Expo; only `feedback never` runs here');
  const flag = Arr.findFirst(args, (arg) =>
    REFUSED_FLAGS.some((f) => arg === f || arg.startsWith(`${f}=`)),
  );
  const other = Arr.findFirst(
    portsOf(args),
    (given) => String(Number(given)) !== given || !ownsPort(app, Number(given)),
  );
  return Option.orElse(
    Option.map(
      flag,
      (given) => `${given} is refused: every drive uses ${app.simulator}, the app's own simulator`,
    ),
    () =>
      Option.map(
        other,
        (given) =>
          `--port ${given} is not this app's: use ${app.port} or ${app.spare[0]}-${app.spare[1]}`,
      ),
  );
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
 * The run of `args` for `app`, whose clone is at `clone`: refused for a verb that publishes, a feedback
 * send, another device or simulator, or a port not the app's; else the child's variables, set over
 * whatever the caller's held: the clone, feedback off, the app's simulator and ports.
 */
const plan = (
  args: ReadonlyArray<string>,
  app: ExactApp,
  clone: string,
): Result.Result<Plan, ExactRefused> =>
  Option.match(refusalOf(args, app), {
    onSome: (reason) => Result.fail(ExactRefused.make({ reason })),
    onNone: () => {
      const web = args[0] === 'web' && portsOf(args).length === 0;
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
          ...(web && { EXACT_PORT: String(app.port) }),
        },
      });
    },
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
 * process when the command is, then refused unless the clone is at the pin, then run with the plan's
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
  const planned = yield* Effect.fromResult(plan(args, app, clone));
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
          env: planned.env,
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
