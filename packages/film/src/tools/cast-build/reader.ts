import {
  Config,
  Context,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
  Stream,
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { sha256Hex } from '../digest.ts';
import { collectWithin, isNotFound } from '../process.ts';

const READER_DIR = `${import.meta.dir}/../../../reader`;

interface TrainConfig {
  readonly steps: number;
  readonly batch: number;
  readonly lr: number;
  readonly seed: number;
  readonly gpu: string;
  readonly precision: string;
  readonly backbone: string;
  readonly inputSide: { readonly width: number; readonly height: number };
}

interface TrainJob {
  readonly trainset: string;
  readonly key: string;
  readonly run: string;
  readonly shards: ReadonlyArray<string>;
  readonly config: TrainConfig;
}

type Frames = { readonly clip: string } | { readonly pngs: string };

class ReaderMissing extends Schema.TaggedError<ReaderMissing>()('ReaderMissing', {
  venv: Schema.String,
  install: Schema.String,
}) {
  override get message() {
    return `the reader's environment is not at ${this.venv}; make it with:\n${this.install}`;
  }
}

class ReaderFailed extends Schema.TaggedError<ReaderFailed>()('ReaderFailed', {
  what: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `reader ${this.what}: ${this.reason}`;
  }
}

export type ReaderError = ReaderMissing | ReaderFailed;

interface Trained {
  readonly checkpoint: Uint8Array;
  readonly result: string;
  readonly app: Option.Option<string>;
}

const trainedOf = (stdout: string): Omit<Trained, 'checkpoint'> => ({
  result:
    stdout
      .split('\n')
      .map((l) => l.trim())
      .findLast((l) => l.startsWith('{') && l.endsWith('}')) ?? '',
  app: Option.map(Option.fromNullishOr(/\bap-[A-Za-z0-9]+/.exec(stdout)), (m) => m[0]),
});

interface ReaderSources {
  readonly train: ReadonlyArray<string>;
  readonly read: ReadonlyArray<string>;
  readonly eval: ReadonlyArray<string>;
}

class ReaderScanFailed extends Schema.TaggedError<ReaderScanFailed>()('ReaderScanFailed', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `reader scan ${this.file}: ${this.reason}`;
  }
}

const ENVIRONMENT = ['pyproject.toml', 'uv.lock'];
const ENTRIES = {
  train: ['modal_app.py'],
  read: ['read.py'],
  eval: ['read.py', 'eval.py'],
} as const satisfies Record<keyof ReaderSources, ReadonlyArray<string>>;
const LOCAL: ReadonlySet<keyof ReaderSources> = new Set(['read', 'eval']);

const SCAN = String.raw`
import ast, json, sys, warnings

warnings.simplefilter("ignore")
LOADERS = {"importlib", "runpy", "pkgutil", "__import__", "import_module"}
BUILTINS = {"exec", "eval", "compile"}
DYNAMIC = LOADERS | BUILTINS


def fail(file, line, reason):
    print(json.dumps({"file": file, "reason": "line %d: %s" % (line, reason)}))
    sys.exit(1)


job = json.load(sys.stdin)
folders = set(job["folders"])
found = {}
for file, text in sorted(job["files"].items()):
    try:
        tree = ast.parse(text, filename=file)
    except (SyntaxError, ValueError) as e:
        fail(file, getattr(e, "lineno", None) or 0, "CPython cannot parse it: %s" % getattr(e, "msg", e))
    names, faults = set(), []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.level > 0:
            faults.append((node.lineno, "a relative import, which the scan does not follow"))
            continue
        if isinstance(node, ast.Import):
            firsts = [alias.name.split(".")[0] for alias in node.names]
        elif isinstance(node, ast.ImportFrom):
            firsts = [node.module.split(".")[0]]
            for alias in node.names:
                if alias.name in DYNAMIC:
                    faults.append((node.lineno, "it imports %s, a dynamic import the scan cannot follow" % alias.name))
        elif isinstance(node, ast.Name) and node.id in DYNAMIC:
            faults.append((node.lineno, "it names %s, a dynamic import the scan cannot follow" % node.id))
            continue
        elif isinstance(node, ast.Attribute) and node.attr in LOADERS:
            faults.append((node.lineno, "it names %s, a dynamic import the scan cannot follow" % node.attr))
            continue
        elif isinstance(node, ast.Constant) and isinstance(node.value, str) and node.value in LOADERS:
            faults.append((node.lineno, "it holds the string %s, a dynamic import the scan cannot follow" % node.value))
            continue
        else:
            continue
        for name in firsts:
            if name in DYNAMIC:
                faults.append((node.lineno, "it imports %s, a dynamic import the scan cannot follow" % name))
            elif name in folders:
                faults.append((node.lineno, "it imports %s, a folder of the reader's: a package the scan does not follow" % name))
        names.update(firsts)
    if faults:
        fail(file, *min(faults))
    found[file] = sorted(names)
print(json.dumps(found))
`;

const SCAN_LIMIT = Duration.seconds(30);

const ScanJob = Schema.fromJsonString(
  Schema.Struct({
    files: Schema.Record(Schema.String, Schema.String),
    folders: Schema.Array(Schema.String),
  }),
);
const ScanImports = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.Array(Schema.String)),
);
const ScanFault = Schema.fromJsonString(
  Schema.Struct({ file: Schema.String, reason: Schema.String }),
);

type Imports = ReadonlyMap<string, ReadonlyArray<string>>;

const scanBroke = (reason: string) => ReaderScanFailed.make({ file: 'python3', reason });

export const scanOf = (py: ReadonlyMap<string, string>, folders: ReadonlySet<string>) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const job = yield* Schema.encodeEffect(ScanJob)({
      files: Object.fromEntries(py),
      folders: [...folders].toSorted(),
    }).pipe(Effect.mapError((e) => scanBroke(`its input did not encode: ${e.message}`)));
    const ran = yield* collectWithin(
      spawner,
      'reader scan',
      ChildProcess.make('python3', ['-I', '-B', '-c', SCAN], {
        stdin: Stream.make(new TextEncoder().encode(job)),
        forceKillAfter: Duration.seconds(5),
      }),
      SCAN_LIMIT,
    ).pipe(
      Effect.catchTags({
        PlatformError: (e) => {
          if (isNotFound(e))
            return scanBroke(
              "no python3 on PATH: the scan reads the reader's imports with CPython",
            );
          return scanBroke(e.message);
        },
        ProcessTimedOut: (e) => scanBroke(e.message),
      }),
    );
    const said = tailOf(ran.stderr) || tailOf(ran.stdout);
    if (ran.exitCode === 0) {
      const answer = yield* Schema.decodeEffect(ScanImports)(ran.stdout).pipe(
        Effect.mapError(() => scanBroke(`the scan answered no imports: ${said}`)),
      );
      const imports: Imports = new Map(Object.entries(answer));
      const answered = [...imports.keys()].toSorted().join(', ');
      if (answered !== [...py.keys()].toSorted().join(', '))
        return yield* scanBroke(
          `the scan answered for ${answered}, not for each file it was given`,
        );
      return imports;
    }
    const fault = yield* Schema.decodeEffect(ScanFault)(ran.stdout).pipe(
      Effect.mapError(() => scanBroke(`it exited ${ran.exitCode}: ${said}`)),
    );
    return yield* ReaderScanFailed.make(fault);
  });

export const rolesOf = (imports: Imports): Effect.Effect<ReaderSources, ReaderScanFailed> =>
  Effect.gen(function* () {
    const closureOf = (role: keyof ReaderSources) =>
      Effect.gen(function* () {
        const seen = new Set<string>();
        const queue: Array<string> = [...ENTRIES[role]];
        for (const entry of queue)
          if (!imports.has(entry))
            return yield* ReaderScanFailed.make({
              file: entry,
              reason: `missing: the ${role} role's entry`,
            });
        while (queue.length > 0) {
          const file = queue.shift() ?? '';
          if (seen.has(file)) continue;
          seen.add(file);
          for (const name of imports.get(file) ?? [])
            if (imports.has(`${name}.py`)) queue.push(`${name}.py`);
        }
        return [...seen, ...ENVIRONMENT.filter(() => LOCAL.has(role))].toSorted();
      });
    return {
      train: yield* closureOf('train'),
      read: yield* closureOf('read'),
      eval: yield* closureOf('eval'),
    };
  });

const sourcesIn = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const py = new Map<string, string>();
    const folders = new Set<string>();
    for (const name of (yield* fs.readDirectory(dir)).toSorted()) {
      if (name.endsWith('.py')) py.set(name, yield* fs.readFileString(`${dir}/${name}`));
      else if ((yield* fs.stat(`${dir}/${name}`)).type === 'Directory') folders.add(name);
    }
    const roles = yield* rolesOf(yield* scanOf(py, folders));
    const at = (files: ReadonlyArray<string>) => files.map((n) => `${dir}/${n}`);
    return { train: at(roles.train), read: at(roles.read), eval: at(roles.eval) };
  });

interface CastReaderService {
  readonly sources: ReaderSources;
  readonly read: (
    ckpt: string,
    frames: Frames,
    mapped?: string,
  ) => Effect.Effect<string, ReaderError>;
  readonly evaluate: (ckpt: string, shard: string) => Effect.Effect<string, ReaderError>;
  readonly train: (job: TrainJob) => Effect.Effect<Trained, ReaderError>;
  readonly promote: (key: string, run: string) => Effect.Effect<void, ReaderError>;
  readonly test: Effect.Effect<string, ReaderError>;
}

const DRIVER = `
import runpy, sys
folder, script = sys.argv[1:3]
sys.path.insert(0, folder)
sys.argv = [script + '.py', *sys.argv[3:]]
runpy.run_path(folder + '/' + script + '.py', run_name='__main__')
`;

const READ_LIMIT = Duration.minutes(30);
const TRAIN_LIMIT = Duration.hours(3);

const frameArgs = (frames: Frames, resolve: (p: string) => string): ReadonlyArray<string> => {
  if ('clip' in frames) return ['--mp4', resolve(frames.clip)];
  return ['--pngs', resolve(frames.pngs)];
};

const tailOf = (text: string) => text.trim().split('\n').slice(-6).join('\n');

export class CastReader extends Context.Service<CastReader, CastReaderService>()(
  '@manna/film/tools/cast-build/CastReader',
) {
  static readonly layerIn = (folder: string) =>
    Layer.effect(
      CastReader,
      Effect.gen(function* () {
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = path.resolve(folder);
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
              const out = path.join(scratch, `${job.key}-${job.run}.pt`);
              const c = job.config;
              const stdout = yield* python_(
                'train',
                [
                  '-m',
                  'modal',
                  'run',
                  `${path.join(dir, 'modal_app.py')}::train`,
                  ...['--trainset', job.trainset, '--key', job.key, '--run', job.run],
                  ...['--shards', job.shards.join(',')],
                  ...['--out', out, '--steps', String(c.steps), '--batch', String(c.batch)],
                  ...['--lr', String(c.lr), '--seed', String(c.seed), '--gpu', c.gpu],
                  ...['--precision', c.precision, '--backbone', c.backbone],
                  ...['--input-width', String(c.inputSide.width)],
                  ...['--input-height', String(c.inputSide.height)],
                ],
                TRAIN_LIMIT,
              );
              const checkpoint = yield* fs.readFile(out);
              return { checkpoint, ...trainedOf(stdout) };
            }),
          ).pipe(Effect.catchTag('PlatformError', failedAs('train')));
        });

        const promote = Effect.fn('CastReader.promote')(function* (key: string, run: string) {
          yield* python_(
            'promote',
            [
              '-m',
              'modal',
              'run',
              `${path.join(dir, 'modal_app.py')}::promote`,
              ...['--key', key, '--run', run],
            ],
            READ_LIMIT,
          );
        });

        const test = python_('test', ['-m', 'pytest', '-q'], READ_LIMIT);

        return CastReader.of({ sources, read, evaluate, train, promote, test });
      }),
    );

  static readonly layer = CastReader.layerIn(READER_DIR);

  static readonly layerTest = (
    answers: {
      readonly read?: string;
      readonly evaluate?: (shard: string) => string;
      readonly checkpoint?: Uint8Array;
      readonly training?: Effect.Effect<void>;
      readonly trainStdout?: string;
      readonly promoteFails?: string;
    },
    asked: Array<string> = [],
    sources: ReaderSources = { train: [], read: [], eval: [] },
  ) =>
    Layer.succeed(
      CastReader,
      CastReader.of({
        sources,
        read: (ckpt) => Effect.sync(() => (asked.push(`read ${ckpt}`), answers.read ?? '{}')),
        evaluate: (_, shard) =>
          Effect.sync(() => {
            asked.push(`evaluate ${shard}`);
            return answers.evaluate?.(shard) ?? '{}';
          }),
        train: (job) =>
          Effect.sync(() =>
            asked.push(`train ${job.key} run=${job.run} shards=${job.shards.length}`),
          ).pipe(
            Effect.andThen(answers.training ?? Effect.void),
            Effect.as({
              checkpoint: answers.checkpoint ?? new Uint8Array([1]),
              ...trainedOf(answers.trainStdout ?? ''),
            }),
          ),
        promote: (key, run) =>
          Effect.sync(() => void asked.push(`promote ${key} ${run}`)).pipe(
            Effect.andThen(
              Option.match(Option.fromUndefinedOr(answers.promoteFails), {
                onNone: () => Effect.void,
                onSome: (reason) => Effect.fail(ReaderFailed.make({ what: 'promote', reason })),
              }),
            ),
          ),
        test: Effect.succeed(''),
      }),
    );
}
