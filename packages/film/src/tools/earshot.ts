import { Config, Context, Duration, Effect, FileSystem, Layer, Path } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { EarshotFailed, EarshotMissing } from './errors.ts';
import { collect, collectWithin } from './process.ts';
import { sandboxArgs } from './sandbox.ts';

const EARSHOT_PIN = '972132643583fc0b9a60c6c50983ed7dc1aa55bf';
const EARSHOT_REPO = 'https://github.com/Leonxlnx/earshot';
const WHEELS = [
  'numpy==2.5.4',
  'scipy==1.18.1',
  'soundfile==0.14.0',
  'numba==0.68.0',
  'matplotlib==3.11.2',
  'threadpoolctl==3.7.0',
];
const EARSHOT_LIMIT = Duration.minutes(10);

const installOf = (home: string) =>
  [
    `git clone ${EARSHOT_REPO} ${home}/earshot && git -C ${home}/earshot checkout --detach ${EARSHOT_PIN}`,
    `uv venv --python 3.12 ${home}/venv`,
    `uv pip install --python ${home}/venv/bin/python --only-binary :all: ${WHEELS.join(' ')}`,
  ].join('\n');

const DRIVER = `
import json, math, sys
clone, source, out = sys.argv[1:4]
sys.path.append(clone)
import numpy as np
import soundfile
from scipy.signal import resample_poly
from earshot.forge.fit import auto
x, rate = soundfile.read(source, dtype='float64', always_2d=True)
if rate != 48000:
    g = math.gcd(48000, rate)
    x = resample_poly(x, 48000 // g, rate // g, axis=0)
if x.shape[1] == 1:
    x = np.repeat(x, 2, axis=1)
model = auto.fit(x[:, :2], kind='auto', clap=False, seeds=(0,), name='fit', verbose=False)
auto.save(model, out)
print(json.dumps({'kind': auto.kind_of(model)}))
`;

const tailOf = (text: string) => text.trim().split('\n').slice(-6).join('\n');

interface EarshotService {
  readonly commit: string;
  readonly fit: (source: string) => Effect.Effect<string, EarshotMissing | EarshotFailed>;
}

export class Earshot extends Context.Service<Earshot, EarshotService>()(
  '@manna/film/tools/Earshot',
) {
  static readonly pin = EARSHOT_PIN;

  static readonly layer = Layer.effect(
    Earshot,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const userHome = yield* Config.String('HOME').pipe(Config.withDefault('~'));
      const home = yield* Config.String('EARSHOT_HOME').pipe(
        Config.withDefault(path.join(userHome, '.cache', 'bible-film', 'earshot')),
      );
      const clone = path.join(home, 'earshot');
      const python = path.join(home, 'venv', 'bin', 'python');
      const missing = (reason: string) =>
        EarshotMissing.make({ home, reason, install: installOf(home) });

      const pinned = Effect.gen(function* () {
        if (process.platform !== 'darwin')
          return yield* missing(
            `its sandbox is macOS's sandbox-exec, and this is ${process.platform}`,
          );
        for (const [what, at] of [
          ['its clone', clone],
          ['its virtualenv', python],
        ] as const)
          if (!(yield* fs.exists(at).pipe(Effect.orElseSucceed(() => false))))
            return yield* missing(`${what} is not at ${at}`);
        const git = (...args: ReadonlyArray<string>) =>
          collect(
            spawner,
            ChildProcess.make('git', ['-C', clone, ...args], {
              forceKillAfter: Duration.seconds(5),
            }),
          ).pipe(
            Effect.mapError((error) => missing(`git could not read its clone: ${error.message}`)),
          );
        const head = (yield* git('rev-parse', 'HEAD')).stdout.trim();
        if (head !== EARSHOT_PIN)
          return yield* missing(`its clone is at ${head}, not the pin ${EARSHOT_PIN}`);
        const changed = (yield* git('status', '--porcelain')).stdout.trim();
        if (changed !== '') return yield* missing(`its clone has changes:\n${changed}`);
      });

      const fit = Effect.fn('Earshot.fit')(function* (source: string) {
        yield* pinned;
        const failed = (reason: string) => EarshotFailed.make({ source, reason });
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const scratch = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
            const out = path.join(scratch, 'model.json');
            const real = yield* Effect.all({
              source: fs.realPath(source),
              clone: fs.realPath(clone),
              venv: fs.realPath(path.join(home, 'venv')),
              python: fs.realPath(python),
            });
            const install = path.dirname(path.dirname(real.python));
            const command = sandboxArgs(
              {
                reads: [...new Set([real.clone, real.venv, install, path.dirname(real.source)])],
                writes: [scratch],
                offline: true,
              },
              [python, '-I', '-B', '-c', DRIVER, real.clone, real.source, out],
            );
            const [program = 'sandbox-exec', ...args] = command;
            yield* Effect.log(`earshot.fit source=${source} commit=${EARSHOT_PIN}`);
            const ran = yield* collectWithin(
              spawner,
              'earshot',
              ChildProcess.make(program, args, {
                cwd: scratch,
                env: {
                  PATH: '/usr/bin:/bin',
                  HOME: scratch,
                  HF_HUB_OFFLINE: '1',
                  TRANSFORMERS_OFFLINE: '1',
                  HF_HOME: path.join(scratch, 'hf'),
                  NUMBA_CACHE_DIR: path.join(scratch, 'numba'),
                  MPLCONFIGDIR: path.join(scratch, 'matplotlib'),
                  PYTHONDONTWRITEBYTECODE: '1',
                },
                forceKillAfter: Duration.seconds(5),
              }),
              EARSHOT_LIMIT,
            );
            if (ran.exitCode !== 0)
              return yield* failed(
                `it exited ${ran.exitCode}: ${tailOf(ran.stderr) || tailOf(ran.stdout)}`,
              );
            return yield* fs.readFileString(out);
          }),
        ).pipe(
          Effect.catchTags({
            PlatformError: (error) => Effect.fail(failed(error.message)),
            ProcessTimedOut: (error) => Effect.fail(failed(error.message)),
          }),
        );
      });

      return Earshot.of({ commit: EARSHOT_PIN, fit });
    }),
  );

  static readonly layerTest = (model: (source: string) => string, asked: Array<string> = []) =>
    Layer.succeed(
      Earshot,
      Earshot.of({
        commit: EARSHOT_PIN,
        fit: (source) => Effect.sync(() => (asked.push(source), model(source))),
      }),
    );
}
