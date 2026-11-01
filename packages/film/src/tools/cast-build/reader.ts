// The cast reader's driver: the Python in `packages/film/reader/` (the model,
// its train, read and eval), run from its own environment, as `earshot.ts`
// keeps one:
//
// - a uv virtualenv outside the repo, `FILM_READER_HOME` (else
//   ~/.cache/bible-film/reader), one per `uv.lock`: `venv-<its sha256, 12
//   hex>`, made by `uv sync --frozen` from the lock, wheels only (the
//   project sets `no-build`); a missing one is refused with the line that
//   makes it;
// - run as `python -I -B` (no user site, no current folder, no bytecode
//   written) through a driver that puts the reader's folder first on
//   `sys.path` and runs one of its scripts as `__main__`;
// - the train runs on Modal (`modal run modal_app.py::train`), so only the
//   train stage calls it, inside its `ctx.spend('modal', …)`; reads and
//   evals run on this machine's CPU and spend nothing.
//
// `CastReader.sources` names the files a train ships and is keyed by: every
// file of the reader's folder but its tests.

import { Config, Context, Duration, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { sha256Hex } from '../digest.ts';
import { collectWithin } from '../process.ts';

/** The reader's Python project: `packages/film/reader/`. */
export const READER_DIR = `${import.meta.dir}/../../../reader`;

/** The reader's train settings: a fixed step count on one GPU type, no wall-clock stop. */
export interface TrainConfig {
  readonly steps: number;
  readonly batch: number;
  readonly lr: number;
  readonly seed: number;
  readonly gpu: string;
  readonly precision: string;
}

export interface TrainJob {
  /** The training set's hash: its tar on the data volume is `/sets/<trainset>.tar`. */
  readonly trainset: string;
  /** The reader's key: its checkpoint on the volume is `/readers/<key>.pt`. */
  readonly key: string;
  /** The set's shards, one tar per drawing, in the set's order. */
  readonly shards: ReadonlyArray<string>;
  readonly config: TrainConfig;
}

/** What a read reads: a clip (an mp4 mapped onto the canvas) or a folder of canvas PNGs. */
export type Frames = { readonly clip: string } | { readonly pngs: string };

export class ReaderMissing extends Schema.TaggedError<ReaderMissing>()('ReaderMissing', {
  venv: Schema.String,
  install: Schema.String,
}) {
  override get message() {
    return `the reader's environment is not at ${this.venv}; make it with:\n${this.install}`;
  }
}

export class ReaderFailed extends Schema.TaggedError<ReaderFailed>()('ReaderFailed', {
  what: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `reader ${this.what}: ${this.reason}`;
  }
}

export type ReaderError = ReaderMissing | ReaderFailed;

interface CastReaderService {
  /** The files a train ships and its key hashes, sorted: every file of the reader's folder but its tests. */
  readonly sources: ReadonlyArray<string>;
  /** `frames` read by the checkpoint at `ckpt`: read.py's JSON (every class's probability per frame); each frame as mapped onto the canvas written to `mapped` as `<id>.png`, when named. */
  readonly read: (
    ckpt: string,
    frames: Frames,
    mapped?: string,
  ) => Effect.Effect<string, ReaderError>;
  /** The held samples of `shard` (a drawing's renders tar) read by `ckpt` and scored: eval.py's JSON. */
  readonly evaluate: (ckpt: string, shard: string) => Effect.Effect<string, ReaderError>;
  /** One reader trained on Modal: the checkpoint's bytes and the train's result JSON. It spends. */
  readonly train: (
    job: TrainJob,
  ) => Effect.Effect<{ readonly checkpoint: Uint8Array; readonly result: string }, ReaderError>;
  /** The reader's pytest cases, run in its environment: pytest's output. */
  readonly test: Effect.Effect<string, ReaderError>;
}

/**
 * The driver, run as `python -I -B -c`: the reader's folder, a script's
 * name and the script's arguments.
 */
const DRIVER = `
import runpy, sys
folder, script = sys.argv[1:3]
sys.path.insert(0, folder)
sys.argv = [script + '.py', *sys.argv[3:]]
runpy.run_path(folder + '/' + script + '.py', run_name='__main__')
`;

const READ_LIMIT = Duration.minutes(30);
const TRAIN_LIMIT = Duration.hours(3);

/** read.py's arguments for `frames`, each made absolute by `resolve` (the scripts run in the reader's folder). */
const frameArgs = (frames: Frames, resolve: (p: string) => string): ReadonlyArray<string> => {
  if ('clip' in frames) return ['--mp4', resolve(frames.clip)];
  return ['--pngs', resolve(frames.pngs)];
};

/** The last lines a run printed, for its failure. */
const tailOf = (text: string) => text.trim().split('\n').slice(-6).join('\n');

/** The reader's source files: every file of `dir` but its tests and caches, sorted. */
const sourcesIn = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const names = yield* fs.readDirectory(dir);
    return names
      .filter((n) => /\.(py|toml|lock)$/.test(n))
      .toSorted()
      .map((n) => `${dir}/${n}`);
  });

export class CastReader extends Context.Service<CastReader, CastReaderService>()(
  '@manna/film/tools/cast-build/CastReader',
) {
  /** The reader in its uv environment under `FILM_READER_HOME` (else ~/.cache/bible-film/reader). */
  static readonly layer = Layer.effect(
    CastReader,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = path.resolve(READER_DIR);
      const userHome = yield* Config.String('HOME').pipe(Config.withDefault('~'));
      const home = yield* Config.String('FILM_READER_HOME').pipe(
        Config.withDefault(path.join(userHome, '.cache', 'bible-film', 'reader')),
      );
      const sources = yield* sourcesIn(dir);
      const lock = yield* fs.readFile(path.join(dir, 'uv.lock'));
      const venv = path.join(home, `venv-${sha256Hex(lock).slice(0, 12)}`);
      const python = path.join(venv, 'bin', 'python');
      const install = `cd ${dir} && UV_PROJECT_ENVIRONMENT=${venv} uv sync --frozen --python 3.12`;
      const env = { HOME: userHome, PATH: '/usr/bin:/bin', PYTHONDONTWRITEBYTECODE: '1' };

      const ready = Effect.gen(function* () {
        const there = yield* fs.exists(python).pipe(Effect.orElseSucceed(() => false));
        if (!there) return yield* ReaderMissing.make({ venv, install });
      });

      /** `python -I -B` with `args`, its stdout on success. */
      const python_ = (what: string, args: ReadonlyArray<string>, limit: Duration.Duration) =>
        Effect.gen(function* () {
          yield* ready;
          const ran = yield* collectWithin(
            spawner,
            `reader ${what}`,
            ChildProcess.make(python, ['-I', '-B', ...args], {
              cwd: dir,
              env,
              forceKillAfter: Duration.seconds(5),
            }),
            limit,
          ).pipe(
            Effect.catchTags({
              PlatformError: (e) => ReaderFailed.make({ what, reason: e.message }),
              ProcessTimedOut: (e) => ReaderFailed.make({ what, reason: e.message }),
            }),
          );
          if (ran.exitCode !== 0)
            return yield* ReaderFailed.make({
              what,
              reason: `it exited ${ran.exitCode}: ${tailOf(ran.stderr) || tailOf(ran.stdout)}`,
            });
          return ran.stdout;
        });
      const script = (name: string, args: ReadonlyArray<string>, limit: Duration.Duration) =>
        python_(name, ['-c', DRIVER, dir, name, ...args], limit);

      const failedAs = (what: string) => (e: { readonly message: string }) =>
        ReaderFailed.make({ what, reason: e.message });

      const read = Effect.fn('CastReader.read')(function* (
        ckpt: string,
        frames: Frames,
        mapped?: string,
      ) {
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const scratch = yield* fs.makeTempDirectoryScoped();
            const out = path.join(scratch, 'read.json');
            const source = frameArgs(frames, (p) => path.resolve(p));
            yield* script(
              'read',
              [
                '--ckpt',
                path.resolve(ckpt),
                ...source,
                '--out',
                out,
                '--device',
                'cpu',
                '--all-probs',
                ...Option.match(Option.fromUndefinedOr(mapped), {
                  onNone: () => [],
                  onSome: (m) => ['--save-mapped', path.resolve(m)],
                }),
              ],
              READ_LIMIT,
            );
            return yield* fs.readFileString(out);
          }),
        ).pipe(Effect.catchTag('PlatformError', failedAs('read')));
      });

      const evaluate = Effect.fn('CastReader.evaluate')(function* (ckpt: string, shard: string) {
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const scratch = yield* fs.makeTempDirectoryScoped();
            const untar = yield* collectWithin(
              spawner,
              'tar',
              ChildProcess.make('/usr/bin/tar', ['-xf', shard, '-C', scratch, 'held'], {
                forceKillAfter: Duration.seconds(5),
              }),
              READ_LIMIT,
            );
            if (untar.exitCode !== 0)
              return yield* ReaderFailed.make({ what: 'eval', reason: tailOf(untar.stderr) });
            const held = path.join(scratch, 'held');
            const readOut = path.join(scratch, 'read.json');
            const evalOut = path.join(scratch, 'eval.json');
            yield* script(
              'read',
              ['--ckpt', path.resolve(ckpt), '--pngs', held, '--out', readOut, '--device', 'cpu'],
              READ_LIMIT,
            );
            yield* script(
              'eval',
              ['--read', readOut, '--truth', held, '--out', evalOut],
              READ_LIMIT,
            );
            return yield* fs.readFileString(evalOut);
          }),
        ).pipe(
          Effect.catchTags({
            PlatformError: failedAs('eval'),
            ProcessTimedOut: failedAs('eval'),
          }),
        );
      });

      const train = Effect.fn('CastReader.train')(function* (job: TrainJob) {
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const scratch = yield* fs.makeTempDirectoryScoped();
            const out = path.join(scratch, `${job.key}.pt`);
            const c = job.config;
            const stdout = yield* python_(
              'train',
              [
                '-m',
                'modal',
                'run',
                `${path.join(dir, 'modal_app.py')}::train`,
                ...['--trainset', job.trainset, '--key', job.key, '--shards', job.shards.join(',')],
                ...['--out', out, '--steps', String(c.steps), '--batch', String(c.batch)],
                ...['--lr', String(c.lr), '--seed', String(c.seed), '--gpu', c.gpu],
                ...['--precision', c.precision],
              ],
              TRAIN_LIMIT,
            );
            const checkpoint = yield* fs.readFile(out);
            return { checkpoint, result: stdout.trim().split('\n').at(-1) ?? '' };
          }),
        ).pipe(Effect.catchTag('PlatformError', failedAs('train')));
      });

      const test = python_('test', ['-m', 'pytest', '-q'], READ_LIMIT);

      return CastReader.of({ sources, read, evaluate, train, test });
    }),
  );

  /**
   * A reader that answers from `answers` and runs nothing; `asked` records
   * each call as `<what> <argument>`.
   */
  static readonly layerTest = (
    answers: {
      readonly read?: string;
      readonly evaluate?: string;
      readonly checkpoint?: Uint8Array;
    },
    asked: Array<string> = [],
    sources: ReadonlyArray<string> = [],
  ) =>
    Layer.succeed(
      CastReader,
      CastReader.of({
        sources,
        read: (ckpt) => Effect.sync(() => (asked.push(`read ${ckpt}`), answers.read ?? '{}')),
        evaluate: (_, shard) =>
          Effect.sync(() => (asked.push(`evaluate ${shard}`), answers.evaluate ?? '{}')),
        train: (job) =>
          Effect.sync(() => {
            asked.push(`train ${job.key} shards=${job.shards.length}`);
            return { checkpoint: answers.checkpoint ?? new Uint8Array([1]), result: '{}' };
          }),
        test: Effect.succeed(''),
      }),
    );
}
