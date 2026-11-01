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
// derived from the Python's local imports (`rolesOf`): `train`, what a train
// runs (modal_app.py's closure; the Modal image installs `modal_app.PACKAGES`,
// not the lock), which keys the checkpoint; `read`, what a local read runs
// (read.py's closure and the environment, pyproject.toml and uv.lock); `eval`,
// what a local eval runs (read.py's and eval.py's closures and the
// environment). An edit to a read or eval file so re-runs the reads and evals,
// and leaves the checkpoint's key, and so the checkpoint, as it is.

import { Config, Context, Duration, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { sha256Hex } from '../digest.ts';
import { collectWithin } from '../process.ts';

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

/** A reader folder whose roles cannot be derived from its imports: a dynamic import, or an entry script missing. */
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

/** A word that names a dynamic import, which hides an edge from the scan. */
const DYNAMIC = /\b(importlib|__import__|runpy)\b/;

/**
 * A Python file read for its imports: its text, the place reached, the line
 * it is on, the bracket depth, the code kept, each character with its line,
 * and the reason the read stopped, when it names one.
 */
interface Cursor {
  readonly text: string;
  i: number;
  line: number;
  depth: number;
  readonly code: Array<string>;
  readonly lines: Array<number>;
  fault: Option.Option<string>;
}

/** A word that may stand before a quote as its string's prefix (`r`, `b`, `f`, `rb`, `fr`…); with `f` or `t`, a formatted string. */
const PREFIX = /^[rRbBuUfFtT]{1,2}$/;
/** A character outside brackets that ends a statement: a newline, a `;`, or the `:` before a one-line suite (`if x: import y`). */
const ENDS: ReadonlySet<string> = new Set(['\n', ';', ':']);

const isQuote = (c: string) => c === '"' || c === "'";

/** The prefix of the string whose quote is at `quote`: the word just before it, when it is one; else ''. */
const prefixAt = (text: string, quote: number) => {
  const word = /\w*$/.exec(text.slice(Math.max(0, quote - 2), quote))?.[0] ?? '';
  if (PREFIX.test(word) && !/\w/.test(text.charAt(quote - word.length - 1))) return word;
  return '';
};

/** The quotes that close the string opening at `at`: three when it opens with three. */
const closeAt = (text: string, at: number) => {
  const quote = text.charAt(at);
  if (text.startsWith(quote.repeat(3), at)) return quote.repeat(3);
  return quote;
};

/** Keeps `s` as code, each character on the cursor's line. */
const keep = (cur: Cursor, s: string) => {
  for (const c of s) {
    cur.code.push(c);
    cur.lines.push(cur.line);
  }
};

/** Past the comment whose `#` is at the cursor, to its line's end. */
const pastComment = (cur: Cursor) => {
  cur.i = cur.text.indexOf('\n', cur.i);
  if (cur.i < 0) cur.i = cur.text.length;
};

/** How bracket character `c` moves the depth: an opening one 1, a closing one -1, any other 0. */
const bracketStep = (c: string) => {
  if ('([{'.includes(c)) return 1;
  if (')]}'.includes(c)) return -1;
  return 0;
};

/**
 * Past a formatted string's field, its `{` read: an expression, whose
 * strings nest, whose comments run to the line's end and whose brackets
 * count, then, after a `:` outside its brackets, its format spec
 * (`pastSpec`). False when it, or a string in it, does not end, or its spec
 * holds a quote.
 */
const pastField = (cur: Cursor): boolean => {
  let depth = 0;
  while (cur.i < cur.text.length) {
    const c = cur.text.charAt(cur.i);
    if (isQuote(c)) {
      if (!pastString(cur)) return false;
      continue;
    }
    if (c === '#') {
      pastComment(cur);
      continue;
    }
    if (c === '\n') cur.line++;
    cur.i++;
    if (depth === 0 && c === '}') return true;
    if (depth === 0 && c === ':') return pastSpec(cur);
    depth += bracketStep(c);
  }
  return false;
};

/**
 * Past a formatted string's format spec, its `:` read: plain text up to the
 * field's `}`, in which a `{` opens a nested field (`pastField`, whose
 * strings are strings). A quote in the spec itself is a character to
 * Python, which the scan does not read: it fails, naming the line, rather
 * than take the quote for a string's and lose its place. False when the
 * spec does not end, or holds a quote.
 */
function pastSpec(cur: Cursor): boolean {
  while (cur.i < cur.text.length) {
    const c = cur.text.charAt(cur.i);
    if (isQuote(c)) {
      cur.fault = Option.some(
        `line ${cur.line}: a quote in a formatted string's format spec, which the scan does not read`,
      );
      return false;
    }
    if (c === '\n') cur.line++;
    cur.i++;
    if (c === '}') return true;
    if (c === '{' && !pastField(cur)) return false;
  }
  return false;
}

/**
 * One step in a string's body: an escape (two characters), a newline
 * (which ends a one-quote string: false), a formatted string's `{{` or its
 * field, or a character.
 */
const stringStep = (cur: Cursor, close: string, formatted: boolean): boolean => {
  const c = cur.text.charAt(cur.i);
  const next = cur.text.charAt(cur.i + 1);
  if (c === '\\') {
    if (next === '\n') cur.line++;
    cur.i += 2;
    return true;
  }
  if (c === '\n') {
    cur.line++;
    cur.i++;
    return close.length === 3;
  }
  if (formatted && c === '{' && next === '{') {
    cur.i += 2;
    return true;
  }
  cur.i++;
  if (formatted && c === '{') return pastField(cur);
  return true;
};

/** Past the string whose first quote is at the cursor, its lines counted. False when it does not end. */
function pastString(cur: Cursor): boolean {
  const formatted = /[fFtT]/.test(prefixAt(cur.text, cur.i));
  const close = closeAt(cur.text, cur.i);
  cur.i += close.length;
  while (cur.i < cur.text.length) {
    if (cur.text.startsWith(close, cur.i)) {
      cur.i += close.length;
      return true;
    }
    if (!stringStep(cur, close, formatted)) return false;
  }
  return false;
}

/** What code character `c` is kept as: outside brackets a statement's end is a newline; inside them a newline is a space. */
const keptAs = (c: string, depth: number) => {
  if (depth === 0 && ENDS.has(c)) return '\n';
  if (c === '\n') return ' ';
  return c;
};

/**
 * One step in code: a comment (skipped to its line's end), a backslash
 * that joins the next line, a string (kept as `""`), or a character
 * (`keptAs`). False when a string does not end.
 */
const codeStep = (cur: Cursor): boolean => {
  const c = cur.text.charAt(cur.i);
  if (c === '#') {
    pastComment(cur);
    return true;
  }
  if (c === '\\' && cur.text.charAt(cur.i + 1) === '\n') {
    keep(cur, ' ');
    cur.line++;
    cur.i += 2;
    return true;
  }
  if (isQuote(c)) {
    if (!pastString(cur)) return false;
    keep(cur, '""');
    return true;
  }
  if ('([{'.includes(c)) cur.depth++;
  if (')]}'.includes(c)) cur.depth = Math.max(0, cur.depth - 1);
  keep(cur, keptAs(c, cur.depth));
  if (c === '\n') cur.line++;
  cur.i++;
  return true;
};

/**
 * Python file `file`'s code, as an import can stand in it, and the line
 * each of its characters is on: every string a `""` (its prefix, escapes,
 * triple quotes and a formatted string's fields, whose strings nest, read
 * through), every comment gone, a backslash at a line's end outside a
 * string joining the next line, a newline inside brackets a space, and
 * each statement on its own line (`ENDS`). A string that does not end
 * fails the scan: it has lost its place, and an import may hide in what it
 * took for a string. A quote in a format spec (`f"{x:'>3}"`) fails it too,
 * before it can lose its place (`pastSpec`).
 */
const codeOf = (file: string, src: string) =>
  Effect.gen(function* () {
    const cur: Cursor = {
      text: src.replace(/\r\n?/g, '\n'),
      i: 0,
      line: 1,
      depth: 0,
      code: [],
      lines: [],
      fault: Option.none(),
    };
    while (cur.i < cur.text.length) {
      const line = cur.line;
      if (!codeStep(cur))
        return yield* ReaderScanFailed.make({
          file,
          reason: Option.getOrElse(cur.fault, () => `line ${line}: a string that does not end`),
        });
    }
    return { code: cur.code.join(''), lines: cur.lines };
  });

/** A module path, by its first name: `a` of `a.b.c`. */
const DOTTED = /^\s*(\w+)(?:\s*\.\s*\w+)*\s*$/;
/** `import a.b as c, d`: its items. */
const PLAIN = /^\s*import\s+(.*)$/;
/** `from .x.y import …`: its dots, its module (none in `from . import a`) and what it imports. */
const FROM = /^\s*from\b\s*(\.*)\s*(\w+(?:\s*\.\s*\w+)*)?\s*\bimport\b(.*)$/;
/** One name a `from … import` list imports, with its optional alias. */
const NAME = /^\s*(\w+)(?:\s+as\s+\w+)?\s*$/;

/** The first names of `import`'s items (`a.b as c, d` names `a` and `d`); none when one cannot be read. */
const plainNames = (items: string): Option.Option<ReadonlyArray<string>> => {
  const names = items
    .split(',')
    .map((item) => DOTTED.exec(item.replace(/\s+as\s+\w+\s*$/, ''))?.[1] ?? '');
  return Option.liftPredicate(names, (n) => !n.includes(''));
};

/** The names a `from … import` list imports, `*` or names, parenthesized or not; none when it cannot be read. */
const fromNames = (list: string): Option.Option<ReadonlyArray<string>> => {
  if (/^\s*\*\s*$/.test(list)) return Option.some([]);
  const inParens = Option.fromNullishOr(/^\s*\((.*)\)\s*$/.exec(list));
  const items = Option.match(inParens, {
    onNone: () => list.split(','),
    // a parenthesized list may end with a comma
    onSome: (m) => (m[1] ?? '').replace(/,\s*$/, '').split(','),
  });
  const names = items.map((item) => NAME.exec(item)?.[1] ?? '');
  return Option.liftPredicate(names, (n) => !n.includes(''));
};

/**
 * The modules one statement imports: none when it is no import statement,
 * `[]` modules read for an unreadable one (`readable` false).
 */
const statementImports = (
  statement: string,
): Option.Option<{ readonly modules: ReadonlyArray<string>; readonly readable: boolean }> => {
  const read = (names: Option.Option<ReadonlyArray<string>>) =>
    Option.some({ modules: Option.getOrElse(names, () => []), readable: Option.isSome(names) });
  const plain = Option.fromNullishOr(PLAIN.exec(statement));
  if (Option.isSome(plain)) return read(plainNames(plain.value[1] ?? ''));
  const from = Option.fromNullishOr(FROM.exec(statement));
  if (Option.isNone(from)) return Option.none();
  const [, dots = '', module = '', list = ''] = from.value;
  const names = fromNames(list);
  if (module !== '') return read(Option.map(names, () => [DOTTED.exec(module)?.[1] ?? '']));
  // `from . import *` names no module the scan can follow
  return read(Option.filter(names, (n) => dots !== '' && n.length > 0));
};

/**
 * Every module `text` (Python file `file`) imports, by its first name:
 * each `import a, b.c as d` names `a` and `b`; each `from x.y import …`
 * names `x`; a relative `from .x import …` names `x`, and `from . import
 * a, b` names `a` and `b`. An import is read wherever a statement can
 * start (`codeOf`): a line's start, indented or not (an import inside a
 * function is an edge too), after a `;`, in a one-line suite. Strings and
 * comments are not code, so an import in one is no edge. The scan fails
 * closed, naming the line: an `import` keyword in code that no import
 * statement it reads holds, an import statement it cannot read, or a
 * string that does not end. It never guesses an edge from a word, since
 * the reader's files name each other in plain words (`read`, `train`,
 * `model`).
 */
export const importsOf = (file: string, text: string) =>
  Effect.gen(function* () {
    const { code, lines } = yield* codeOf(file, text);
    const fail = (at: number, reason: string) =>
      ReaderScanFailed.make({ file, reason: `line ${lines[at] ?? 0}: ${reason}` });
    const modules: Array<string> = [];
    const held = new Set<number>();
    let start = 0;
    for (const statement of code.split('\n')) {
      const keyword = start + statement.search(/\bimport\b/);
      const found = statementImports(statement);
      if (Option.isSome(found) && !found.value.readable)
        return yield* fail(keyword, `an import the scan cannot read: ${statement.trim()}`);
      if (Option.isSome(found)) {
        modules.push(...found.value.modules);
        held.add(keyword);
      }
      start += statement.length + 1;
    }
    for (const word of code.matchAll(/\bimport\b/g))
      if (!held.has(word.index))
        return yield* fail(
          word.index,
          '`import` in code where no import statement the scan reads starts',
        );
    return modules;
  });

/**
 * The reader's files by role, by name, from `py`: every `.py` file of its
 * folder by name and its text. Each role is the closure of its entries over
 * their local imports (an import naming a `<name>.py` of `py`, followed
 * transitively), with the environment for a local role, sorted. A file that
 * imports dynamically (`importlib`, `__import__`, `runpy`) fails the scan, as
 * does a missing entry, and a file in a role that imports a name of
 * `folders` (the folder's own folders): a package of the reader's, whose
 * files the scan does not follow.
 */
export const rolesOf = (
  py: ReadonlyMap<string, string>,
  folders: ReadonlySet<string> = new Set(),
): Effect.Effect<ReaderSources, ReaderScanFailed> =>
  Effect.gen(function* () {
    for (const [file, text] of py) {
      const dynamic = Option.fromNullishOr(DYNAMIC.exec(text));
      if (Option.isSome(dynamic))
        return yield* ReaderScanFailed.make({
          file,
          reason: `it names ${dynamic.value[1]}, a dynamic import the scan cannot follow`,
        });
    }
    const closureOf = (role: keyof ReaderSources) =>
      Effect.gen(function* () {
        const seen = new Set<string>();
        const queue: Array<string> = [...ENTRIES[role]];
        for (const entry of queue)
          if (!py.has(entry))
            return yield* ReaderScanFailed.make({
              file: entry,
              reason: `missing: the ${role} role's entry`,
            });
        while (queue.length > 0) {
          const file = queue.shift() ?? '';
          if (seen.has(file)) continue;
          seen.add(file);
          for (const name of yield* importsOf(file, py.get(file) ?? '')) {
            if (folders.has(name))
              return yield* ReaderScanFailed.make({
                file,
                reason: `it imports ${name}, a folder of the reader's: a package the scan does not follow`,
              });
            if (py.has(`${name}.py`)) queue.push(`${name}.py`);
          }
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
    const roles = yield* rolesOf(py, folders);
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
