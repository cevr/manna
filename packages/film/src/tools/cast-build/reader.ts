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
// `CastReader.sources` names the reader's files by role, each a closure
// derived from the Python's local imports, as CPython's `ast` reads them in
// one `python3` spawn (`scanOf`, `rolesOf`): `train`, what a train
// runs (modal_app.py's closure; the Modal image installs `modal_app.PACKAGES`,
// not the lock), which keys the checkpoint; `read`, what a local read runs
// (read.py's closure and the environment, pyproject.toml and uv.lock); `eval`,
// what a local eval runs (read.py's and eval.py's closures and the
// environment). An edit to a read or eval file so re-runs the reads and evals,
// and leaves the checkpoint's key, and so the checkpoint, as it is.

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

/** The reader's Python project: `packages/film/reader/`. */
const READER_DIR = `${import.meta.dir}/../../../reader`;

/** The reader's train settings: a fixed step count on one GPU type, no wall-clock stop. */
interface TrainConfig {
  readonly steps: number;
  readonly batch: number;
  readonly lr: number;
  readonly seed: number;
  readonly gpu: string;
  readonly precision: string;
  /** The backbone's name (`facebook/dinov2-small`), and the input it reads in px. */
  readonly backbone: string;
  readonly inputSide: { readonly width: number; readonly height: number };
}

interface TrainJob {
  /** The training set's hash: its tar on the data volume is `/sets/<trainset>.tar`. */
  readonly trainset: string;
  /** The reader's key: its checkpoint on the volume is `/readers/<key>.pt`, once promoted. */
  readonly key: string;
  /** This train's own name: it writes its checkpoint on the volume at `/runs/<key>/<run>.pt`, never at the key's. */
  readonly run: string;
  /** The set's shards, one tar per drawing, in the set's order. */
  readonly shards: ReadonlyArray<string>;
  readonly config: TrainConfig;
}

/** What a read reads: a clip (an mp4 mapped onto the canvas) or a folder of canvas PNGs. */
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

/** A train's yield: the checkpoint's bytes, the fit's result (train.py's JSON: steps, sec_per_step, last_loss…) and its Modal app id. */
interface Trained {
  readonly checkpoint: Uint8Array;
  /** The last line of the train's stdout that is a JSON object ('' when none is). */
  readonly result: string;
  readonly app: Option.Option<string>;
}

/**
 * A train's stdout read: `modal run` prints the app's URL (`…/apps/…/ap-<id>`)
 * and its own lines around the fit's JSON, so the result is the last line
 * that reads as a JSON object, not the last line.
 */
const trainedOf = (stdout: string): Omit<Trained, 'checkpoint'> => ({
  result:
    stdout
      .split('\n')
      .map((l) => l.trim())
      .findLast((l) => l.startsWith('{') && l.endsWith('}')) ?? '',
  app: Option.map(Option.fromNullishOr(/\bap-[A-Za-z0-9]+/.exec(stdout)), (m) => m[0]),
});

/** The reader's files by role, each sorted: what a train runs, what a read runs, what an eval runs (`rolesOf`). */
export interface ReaderSources {
  readonly train: ReadonlyArray<string>;
  readonly read: ReadonlyArray<string>;
  readonly eval: ReadonlyArray<string>;
}

/** A reader folder whose roles cannot be derived from its imports: a scan fault (`SCAN`), no python3, or an entry script missing. */
export class ReaderScanFailed extends Schema.TaggedError<ReaderScanFailed>()('ReaderScanFailed', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `reader scan ${this.file}: ${this.reason}`;
  }
}

/** The local environment a read or an eval runs under: the project's pins and the lock its venv is made from. */
const ENVIRONMENT = ['pyproject.toml', 'uv.lock'];
/** Each role's entry scripts, whose local-import closures it runs. */
const ENTRIES = {
  train: ['modal_app.py'],
  read: ['read.py'],
  eval: ['read.py', 'eval.py'],
} as const satisfies Record<keyof ReaderSources, ReadonlyArray<string>>;
/** The roles that run locally, under the environment; a train runs in the Modal image. */
const LOCAL: ReadonlySet<keyof ReaderSources> = new Set(['read', 'eval']);

/**
 * The scan, run as `python3 -I -B -c`: CPython's own parser reads each
 * file of the reader folder, so no string, comment or formatted string can
 * hide an import from it. Its stdin is `{"files": {name: text}, "folders":
 * [name]}`. It prints `{name: [first names]}` and exits 0: every module
 * each file imports, wherever the import stands (indented, in a function,
 * in a one-line suite), by its first name (`import a.b as c, d` names `a`
 * and `d`; `from x.y import z` names `x`). On a file's earliest fault it
 * prints `{"file", "reason"}` (the reason starts `line N:`) and exits 1: a
 * file CPython cannot parse; a relative import; a dynamic load, which hides
 * an edge (a name, attribute, string or imported name of `importlib`,
 * `runpy`, `pkgutil`, `__import__` or `import_module`, or a bare name
 * `exec`, `eval` or `compile`; an attribute `.eval()` is a method, not the
 * builtin); or an import of one of the folder's own folders (a package the
 * scan does not follow). A load whose module name is built at run time from
 * no such name (a `sys.path` edit to a subfolder) is not seen; the folder
 * holds none.
 */
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

/** The scan's limit: CPython parses a few small files in well under a second. */
const SCAN_LIMIT = Duration.seconds(30);

/** What the scan reads on its stdin: the folder's `.py` files by name and text, and its folders' names. */
const ScanJob = Schema.fromJsonString(
  Schema.Struct({
    files: Schema.Record(Schema.String, Schema.String),
    folders: Schema.Array(Schema.String),
  }),
);
/** The scan's answer: each file's imports by first name, sorted. */
const ScanImports = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.Array(Schema.String)),
);
/** The scan's fault: the file and the reason, which names the line. */
const ScanFault = Schema.fromJsonString(
  Schema.Struct({ file: Schema.String, reason: Schema.String }),
);

/** Each `.py` file of a reader folder, by name, and the modules it imports, by first name (`SCAN`). */
export type Imports = ReadonlyMap<string, ReadonlyArray<string>>;

/** A scan that ended with no answer of `SCAN`'s: a failure that names python3 and what it printed. */
const scanBroke = (reason: string) => ReaderScanFailed.make({ file: 'python3', reason });

/**
 * The imports of `py` (a reader folder's `.py` files by name and text),
 * read by CPython in one spawn (`SCAN`), with `folders` (the folder's own
 * folders) refused as imports. It fails with the scan's fault (its file,
 * and the reason with the line), or, when python3 cannot run, answers no
 * JSON of the scan's or leaves a file out, a failure naming python3: never
 * with an import left out.
 */
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

/**
 * The reader's files by role, by name, from `imports` (`scanOf`). Each role
 * is the closure of its entries over their local imports (an import naming
 * a `<name>.py` of the folder, followed transitively), with the environment
 * for a local role, sorted. A missing entry fails the scan.
 */
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

/** The roles of the reader folder `dir`, from its `.py` files and the names of its folders (whose files are not read), as absolute paths. */
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
  /** The reader's files by role, as absolute paths, each sorted (`rolesOf`). */
  readonly sources: ReaderSources;
  /** `frames` read by the checkpoint at `ckpt`: read.py's JSON (every class's probability per frame); each frame as mapped onto the canvas written to `mapped` as `<id>.png`, when named. */
  readonly read: (
    ckpt: string,
    frames: Frames,
    mapped?: string,
  ) => Effect.Effect<string, ReaderError>;
  /** The held samples of `shard` (a drawing's renders tar) read by `ckpt` and scored: eval.py's JSON. */
  readonly evaluate: (ckpt: string, shard: string) => Effect.Effect<string, ReaderError>;
  /** One reader trained on Modal: the checkpoint's bytes, the fit's result JSON and the Modal app it ran in. It spends. */
  readonly train: (job: TrainJob) => Effect.Effect<Trained, ReaderError>;
  /** Make run `run`'s checkpoint the key's: `/runs/<key>/<run>.pt` copied to `/readers/<key>.pt` on the volume. It runs no GPU. */
  readonly promote: (key: string, run: string) => Effect.Effect<void, ReaderError>;
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

export class CastReader extends Context.Service<CastReader, CastReaderService>()(
  '@manna/film/tools/cast-build/CastReader',
) {
  /** The reader in folder `folder`, in its uv environment under `FILM_READER_HOME` (else ~/.cache/bible-film/reader). */
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

  /** The reader of `packages/film/reader/`, in its uv environment. */
  static readonly layer = CastReader.layerIn(READER_DIR);

  /**
   * A reader that answers from `answers` and runs nothing; `asked` records
   * each call as `<what> <argument>`. An eval answers what `answers.evaluate`
   * makes of the shard ('{}' without it). A train runs
   * `answers.training` before it answers: what happens while it runs; it
   * reads `answers.trainStdout` as the live train reads `modal run`'s
   * stdout. A promote fails with `answers.promoteFails` as its reason, when
   * it is given.
   */
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
