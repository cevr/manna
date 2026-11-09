/* oxlint-disable effect/noNullish -- drives rolldown at the bundler's host boundary: its plugin hooks answer `null` for a module that is not theirs. */

/**
 * The One dev server's iOS bundle compiles to Hermes bytecode: the dev
 * runtime vxrn puts at the head of every Debug bundle, built by the rolldown
 * vxrn resolves (one → vxrn → rolldown, as the server finds them), passes
 * react-native's hermesc with vxrn's own flags.
 *
 * Its seams: rolldown's `dev()` over a one-module entry with vxrn's runtime
 * source, and hermesc as a child process. It catches a rolldown whose dev
 * runtime carries syntax Hermes cannot parse (rolldown 1.3.0's dynamic
 * `import(`), a build without vxrn's runtime (the marker), and a moved
 * runtime file or compiler (both fail, never skip). It misses the app's own
 * modules and vxrn's transforms of them: the dev-server leg
 * (`devbundle.slow.test.ts`) requests the whole bundle.
 */

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/** The timeout of the test, which spawns hermesc: a cold start's time is the machine's (effect/requireSpawnBudget). */
const SPAWNS_MS = 20_000;

/** hermesc's folder in hermes-compiler, by host. */
const HERMES_BIN: ReadonlyMap<string, string> = new Map([
  ['darwin', 'osx-bin'],
  ['linux', 'linux64-bin'],
]);

/** Hermes bytecode's magic, the first 8 bytes of every `.hbc`. */
const HERMES_MAGIC = 'c61fbc03c103191f';

const ENTRY = '\0devbundle-entry';

/** The one module the probe bundle holds. */
interface EntryPlugin {
  readonly name: string;
  readonly resolveId: (source: string) => string | null;
  readonly load: (id: string) => string | null;
}
/** The input options vxrn's native dev engine gives rolldown, less its own plugins. */
interface DevInput {
  readonly input: string;
  readonly platform: 'neutral';
  readonly treeshake: boolean;
  readonly experimental: {
    readonly devMode: { readonly implement: string; readonly host: string; readonly port: number };
    readonly incrementalBuild: boolean;
  };
  readonly plugins: ReadonlyArray<EntryPlugin>;
}
interface DevOutput {
  readonly output: ReadonlyArray<{ readonly type: string; readonly code?: string }>;
}
interface DevOptions {
  readonly watch: { readonly enabled: boolean; readonly skipWrite: boolean };
  readonly onOutput: (result: Error | DevOutput) => void;
}
/** The parts of rolldown's dev engine the dev server drives. */
interface Engine {
  readonly run: () => Promise<void>;
  readonly ensureCurrentBuildFinish: () => Promise<void>;
  readonly close: () => Promise<void>;
}
interface Rolldown {
  readonly dev: (
    input: DevInput,
    output: { readonly format: 'esm' },
    options: DevOptions,
  ) => Promise<Engine>;
}
/** vxrn's runtime source and the line that ends it in every dev bundle. */
interface Runtime {
  readonly getHmrRuntimeSource: () => string;
  readonly NATIVE_DEV_RUNTIME_END: string;
}

/** A package's real directory, resolved from `from` as the dev server finds it. */
const packageDir = Effect.fn('test.devbundle.packageDir')(function* (name: string, from: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return path.dirname(yield* fs.realPath(Bun.resolveSync(`${name}/package.json`, from)));
});

/** The rolldown and the runtime source the dev server uses, reached from the app through one and vxrn. */
const chain = Effect.fn('test.devbundle.chain')(function* (app: string) {
  const path = yield* Path.Path;
  const vxrn = yield* packageDir('vxrn', yield* packageDir('one', app));
  const rolldown: Rolldown = yield* Effect.promise(
    () => import(Bun.resolveSync('rolldown/experimental', vxrn)),
  );
  const runtime: Runtime = yield* Effect.promise(
    () => import(path.join(vxrn, 'dist/utils/createNativeDevEngine.mjs')),
  );
  return { rolldown, runtime };
});

/** react-native's hermesc, the compiler `sim boot` hands the dev server. */
const hermesc = Effect.fn('test.devbundle.hermesc')(function* (app: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const bin = yield* Option.match(Option.fromNullishOr(HERMES_BIN.get(process.platform)), {
    onNone: () => Effect.die(`no hermesc for platform ${process.platform}`),
    onSome: Effect.succeed,
  });
  const reactNative = yield* fs.realPath(path.join(app, 'node_modules/react-native'));
  return path.join(yield* packageDir('hermes-compiler', reactNative), 'hermesc', bin, 'hermesc');
});

/** The entry chunk of a one-module dev build carrying vxrn's runtime, written nowhere. */
const build = Effect.fn('test.devbundle.build')(function* (rolldown: Rolldown, runtime: Runtime) {
  const chunks: Array<string> = [];
  const failures: Array<Error> = [];
  const engine = yield* Effect.acquireRelease(
    Effect.promise(() =>
      rolldown.dev(
        {
          input: ENTRY,
          platform: 'neutral',
          treeshake: false,
          experimental: {
            devMode: { implement: runtime.getHmrRuntimeSource(), host: '127.0.0.1', port: 8081 },
            incrementalBuild: true,
          },
          plugins: [
            {
              name: 'devbundle-entry',
              resolveId: (source) =>
                Option.getOrNull(Option.liftPredicate(source, (s) => s === ENTRY)),
              load: (id) =>
                Option.getOrNull(
                  Option.map(
                    Option.liftPredicate(id, (s) => s === ENTRY),
                    () => 'globalThis.probe = 1;',
                  ),
                ),
            },
          ],
        },
        { format: 'esm' },
        {
          watch: { enabled: false, skipWrite: true },
          onOutput: (result) => {
            if (result instanceof Error) failures.push(result);
            else
              for (const chunk of result.output)
                if (chunk.type === 'chunk') chunks.push(chunk.code ?? '');
          },
        },
      ),
    ),
    (engine) => Effect.promise(() => engine.close()),
  );
  yield* Effect.promise(() => engine.run());
  yield* Effect.promise(() => engine.ensureCurrentBuildFinish());
  yield* Effect.forEach(failures, (failure) => Effect.die(failure), { discard: true });
  return chunks.join('\n');
});

/** Compiles `code` as vxrn's dev bytecode step does: hermesc's exit, its `error` lines and the output's first 8 bytes. */
const compile = Effect.fn('test.devbundle.compile')(function* (compiler: string, code: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'devbundle-' });
  const source = path.join(dir, 'index.bundle.js');
  const out = path.join(dir, 'index.hbc');
  yield* fs.writeFileString(source, code);
  const handle = yield* spawner.spawn(
    ChildProcess.make(compiler, ['-Og', '-g', '-emit-binary', '-out', out, source], {
      forceKillAfter: '5 seconds',
    }),
  );
  const [stderr, status] = yield* Effect.all(
    [
      Stream.mkString(Stream.decodeText(handle.stderr)),
      handle.exitCode,
      Stream.runDrain(handle.stdout),
    ],
    { concurrency: 3 },
  );
  const head = yield* fs.readFile(out).pipe(
    Effect.map((bytes) => Buffer.from(bytes.subarray(0, 8)).toString('hex')),
    Effect.orElseSucceed(() => ''),
  );
  const errors = stderr.split('\n').filter((line) => line.includes('error'));
  return { status: Number(status), errors, head };
});

describe('the dev server’s iOS runtime', () => {
  it.effect.layer(BunServices.layer)(
    'compiles to Hermes bytecode with the rolldown vxrn resolves',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const app = path.resolve(import.meta.dir, '..');
          const { rolldown, runtime } = yield* chain(app);
          const code = yield* build(rolldown, runtime);
          expect(code).toContain(runtime.NATIVE_DEV_RUNTIME_END);
          expect(yield* compile(yield* hermesc(app), code)).toEqual({
            status: 0,
            errors: [],
            head: HERMES_MAGIC,
          });
        }),
      ),
    SPAWNS_MS,
  );
});
