/**
 * `bun run seeds <part> [--from 1] [--to 200] [--jobs 3] [--call k]`: the
 * seeds at which a walk part passes. The part is a `test:<part>` script that
 * names its test files under `src`. Its files run once as committed, with
 * `scripts/seed-pin.ts` preloaded after the part's own preload, which lists
 * each call of a function the files import by name from a `src/test` module
 * whose parameter is named `seed` (a number) or `seeds` (a list).
 * Then they run once for each seed of `--from`..`--to`, `--jobs` at a time,
 * with that call's seed pinned to it (a list to the window of its length
 * from it), and the part's own expectations judge each. It prints
 * `seed <n> meets|misses <ms> ms` as each ends, then
 * `seeds <part>: <n,n,…|none> of <from>-<to> (<k> meet), committed <seed>`.
 * It refuses with exit 2, `seeds <part>: refused, <why>`, a part with no
 * such script, one naming a folder or a file outside `src`, a committed run
 * that fails, one with no seeded call, and one with several unless `--call`
 * picks one. Each run is a process group of its own, ended at 60 s.
 */
import { BunRuntime, BunServices } from '@effect/platform-bun';
import {
  Array as Arr,
  Clock,
  Console,
  Effect,
  FileSystem,
  Option,
  Path,
  Schema,
  Stream,
} from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/** What a seed parameter takes: one seed, or a list of them. */
export type SeedKind = 'seed' | 'seeds';

/** The parameter a walk takes its seed by: its index and kind. */
export interface SeedParam {
  readonly index: number;
  readonly kind: SeedKind;
}

const OPENERS = '([{';
const CLOSERS = ')]}';
const QUOTES = `'"\``;

/**
 * The top-level pieces, split at commas, of the parenthesised list that
 * opens `text`, skipping nested brackets and quoted strings.
 */
const listPieces = (text: string): ReadonlyArray<string> => {
  const pieces: Array<string> = [];
  const open: Array<string> = [];
  let quote = '';
  let from = 1;
  for (let at = 0; at < text.length; at += 1) {
    const char = text.charAt(at);
    if (quote !== '') {
      if (char === '\\') at += 1;
      else if (char === quote) quote = '';
      continue;
    }
    if (QUOTES.includes(char)) quote = char;
    else if (OPENERS.includes(char)) open.push(CLOSERS.charAt(OPENERS.indexOf(char)));
    else if (char === open.at(-1)) {
      open.pop();
      if (open.length === 0) return [...pieces, text.slice(from, at)];
    } else if (char === ',' && open.length === 1) {
      pieces.push(text.slice(from, at));
      from = at + 1;
    }
  }
  return pieces;
};

const HEAD = /^\s*(?:async\b\s*)?(?:function\b\s*\*?\s*[\w$]*\s*)?/u;
const BARE_ARROW = /^([A-Za-z_$][\w$]*)\s*=>/u;
const PARAM_NAME = /^([A-Za-z_$][\w$]*)\s*(?:[=:?]|$)/u;

/** The parameters of the function whose source is `source`, as written. */
const paramsOf = (source: string): ReadonlyArray<string> => {
  const rest = source.slice(HEAD.exec(source)?.[0].length ?? 0);
  const bare = BARE_ARROW.exec(rest);
  if (bare) return [bare[1] ?? ''];
  if (!rest.startsWith('(')) return [];
  return listPieces(rest)
    .map((param) => param.trim())
    .filter((param) => param !== '');
};

/** The kind a parameter of this name takes, when it is a seed's. */
const kindNamed = (name: string): Option.Option<SeedKind> => {
  if (name === 'seed') return Option.some('seed');
  if (name === 'seeds') return Option.some('seeds');
  return Option.none();
};

/**
 * The first parameter of the function whose source is `source` named
 * exactly `seed` (a number) or `seeds` (a list): its index and kind. A
 * destructured parameter, a rest parameter and a name that only holds
 * `seed` are not one.
 */
export const seedParam = (source: string): Option.Option<SeedParam> =>
  Arr.findFirst(paramsOf(source), (param, index) =>
    Option.map(kindNamed(PARAM_NAME.exec(param)?.[1] ?? ''), (kind) => ({ index, kind })),
  );

/** The window of `length` seeds from `pin`. */
const windowOf = (pin: number, length: number) =>
  Array.from({ length }, (_, offset) => pin + offset);

/**
 * `args` with the seed at `at` pinned: a single seed becomes `pin`, a list
 * becomes the window of its length from `pin`. Every other argument is kept.
 */
export const pinned = (
  args: ReadonlyArray<unknown>,
  at: number,
  kind: SeedKind,
  pin: number,
): ReadonlyArray<unknown> =>
  args.map((arg, index) => {
    if (index !== at) return arg;
    if (kind === 'seed') return pin;
    if (!Array.isArray(arg)) return windowOf(pin, 0);
    return windowOf(pin, arg.length);
  });

/** A part's files and preloads, read from its script, or the reason it is refused. */
export type PartRead =
  | {
      readonly _tag: 'Part';
      readonly files: ReadonlyArray<string>;
      readonly preloads: ReadonlyArray<string>;
    }
  | { readonly _tag: 'Refused'; readonly why: string };

const TEST_FILE = /^\.\/src\/[\w./-]+\.test\.tsx?$/u;

/**
 * The test files (`./src/….test.ts(x)`) and preloads `script` names. A part
 * that names a folder or a file outside `src`, or that is not a `bun test`,
 * is refused: its files cannot be pinned one by one.
 */
export const partOf = (script: string): PartRead => {
  const [bun, test, ...words] = script
    .trim()
    .replaceAll(/--preload\s+/gu, '--preload=')
    .split(/\s+/u);
  if (bun !== 'bun' || test !== 'test') return { _tag: 'Refused', why: 'not a bun test' };
  const files: Array<string> = [];
  const preloads: Array<string> = [];
  for (const word of words) {
    if (word.startsWith('--preload=')) preloads.push(word.slice('--preload='.length));
    else if (word.startsWith('--')) continue;
    else if (!word.startsWith('./src/'))
      return { _tag: 'Refused', why: `names ${word}, outside src` };
    else if (!TEST_FILE.test(word)) return { _tag: 'Refused', why: `names the folder ${word}` };
    else files.push(word);
  }
  if (files.length === 0) return { _tag: 'Refused', why: 'names no test file' };
  return { _tag: 'Part', files, preloads };
};

/** `path` (from the app) with `.` and `..` segments resolved. */
const normal = (path: string) => {
  const kept: Array<string> = [];
  for (const segment of path.split('/')) {
    if (segment === '..') kept.pop();
    else if (segment !== '.' && segment !== '') kept.push(segment);
  }
  return kept.join('/');
};

const IMPORTED = /\bimport\s+\{([^}]*)\}\s*from\s+'(\.{1,2}\/[^']+)'/gu;

/** A function a test file imports by name from a `src/test` module, written `<module>:<name>`. */
export type Walk = `${string}:${string}`;

/**
 * The functions the test file at `file` imports by name from `src/test`
 * modules (paths from the app), given its `text`, each once. A type import
 * is none, and a renamed one is its exported name.
 */
export const walksOf = (file: string, text: string): ReadonlyArray<Walk> => {
  const folder = file.replace(/^\.\//u, '').split('/').slice(0, -1).join('/');
  const walks = [...text.matchAll(IMPORTED)].flatMap((match) => {
    const module = normal(`${folder}/${match[2] ?? ''}`);
    if (!module.startsWith('src/test/')) return [];
    return (match[1] ?? '')
      .split(',')
      .map((name) => name.trim().split(/\s+as\s+/u)[0] ?? '')
      .filter((name) => /^[A-Za-z_$][\w$]*$/u.test(name))
      .map((name): Walk => `${module}:${name}`);
  });
  return [...new Set(walks)];
};

/** One call the committed run made to a seeded walk. */
export interface Call {
  /** Its place among the run's seeded calls, from 1. */
  readonly index: number;
  readonly fn: string;
  readonly kind: SeedKind;
  /** The committed seed as printed: a number, or a list `[a,b,…]`. */
  readonly committed: string;
}

const CALL_LINE = /^seed-pin call (\d+) (\S+) (seeds?) (\S+)$/gmu;

/** The seeded calls `seed-pin.ts` printed in a committed run's `output`, in order. */
export const callsIn = (output: string): ReadonlyArray<Call> =>
  [...output.matchAll(CALL_LINE)].flatMap((match) =>
    Option.toArray(
      Option.map(kindNamed(match[3] ?? ''), (kind) => ({
        index: Number(match[1]),
        fn: match[2] ?? '',
        kind,
        committed: match[4] ?? '',
      })),
    ),
  );

/** The call to pin, or why none is. */
export type Decision =
  | { readonly _tag: 'Pin'; readonly call: Call }
  | { readonly _tag: 'Refused'; readonly why: string };

const named = (call: Call) => `${call.index} ${call.fn} ${call.committed}`;

/**
 * Which of the committed run's `calls` to pin: the one `chosen` names (from
 * 1), or the only one. No call, several with none chosen, or a choice past
 * them is refused.
 */
export const decide = (calls: ReadonlyArray<Call>, chosen: Option.Option<number>): Decision => {
  if (calls.length === 0)
    return { _tag: 'Refused', why: 'no call took a parameter named seed or seeds' };
  if (Option.isNone(chosen) && calls.length > 1)
    return {
      _tag: 'Refused',
      why: `${calls.length} calls take a seed; name one with --call: ${calls.map(named).join('; ')}`,
    };
  const at = Option.getOrElse(chosen, () => 1);
  return Option.match(
    Option.filter(Arr.get(calls, at - 1), () => at >= 1),
    {
      onNone: (): Decision => ({
        _tag: 'Refused',
        why: `--call ${at} is not one of the ${calls.length} calls`,
      }),
      onSome: (call): Decision => ({ _tag: 'Pin', call }),
    },
  );
};

/** The seeds of `seeds` at which `run` meets, ascending: each run once, at most `jobs` at a time. */
export const searchWith = <E, R>(
  seeds: ReadonlyArray<number>,
  jobs: number,
  run: (seed: number) => Effect.Effect<boolean, E, R>,
) =>
  Effect.forEach(seeds, (seed) => Effect.map(run(seed), (meets) => ({ seed, meets })), {
    concurrency: jobs,
  }).pipe(
    Effect.map((results) =>
      results
        .filter((result) => result.meets)
        .map((result) => result.seed)
        .toSorted((left, right) => left - right),
    ),
  );

/** The seeds of a committed call, in order: one, or the list's. */
const seedsOf = (call: Call) =>
  call.committed
    .replaceAll(/[[\]]/gu, '')
    .split(',')
    .filter((each) => each !== '')
    .map(Number);

/** What `seed-pin.ts` prints as the pinned seed of `call` at `pin`: the number, or the window `[a,b,…]`. */
export const pinnedText = (call: Call, pin: number) => {
  if (call.kind === 'seed') return String(pin);
  return `[${windowOf(pin, seedsOf(call).length).join(',')}]`;
};

/** A committed seed as the final line shows it: the seed, or a list as `first-last`. */
const shown = (call: Call) => {
  const seeds = seedsOf(call);
  return [...new Set([seeds[0], seeds.at(-1)])].join('-');
};

/** A part's run: its exit code and its output. */
interface Ran {
  readonly code: number;
  readonly out: string;
}

const PIN = './scripts/seed-pin.ts';

/** The part's files run once in `app`, `seed-pin.ts` preloaded with `env`, as a process group ended at 60 s. */
const runPart = (
  app: string,
  part: { readonly files: ReadonlyArray<string>; readonly preloads: ReadonlyArray<string> },
  env: Record<string, string>,
) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const preloads = [...part.preloads, PIN].flatMap((file) => ['--preload', file]);
    const handle = yield* spawner.spawn(
      ChildProcess.make('bun', ['test', '--no-isolate', ...preloads, ...part.files], {
        cwd: app,
        env,
        extendEnv: true,
        forceKillAfter: '5 seconds',
      }),
    );
    const [out, code] = yield* Effect.all(
      [Stream.mkString(Stream.decodeText(handle.all)), handle.exitCode],
      { concurrency: 2 },
    );
    return { code: Number(code), out } satisfies Ran;
  }).pipe(
    Effect.scoped,
    Effect.timeoutOption('60 seconds'),
    Effect.map(Option.getOrElse((): Ran => ({ code: -1, out: 'timed out' }))),
  );

/** Why the search will not run: its line, and exit 2. */
class Refused extends Schema.TaggedError<Refused>()('Refused', { why: Schema.String }) {}

const Package = Schema.fromJsonString(
  Schema.Struct({ scripts: Schema.Record(Schema.String, Schema.String) }),
);

const verdictOf = (met: boolean) => {
  if (met) return 'meets';
  return 'misses';
};

const search = Effect.fn('SeedSearch.search')(function* (flags: {
  readonly part: string;
  readonly from: number;
  readonly to: number;
  readonly jobs: number;
  readonly call: Option.Option<number>;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const app = path.dirname(path.dirname(yield* path.fromFileUrl(new URL(import.meta.url))));
  const pkg = yield* Schema.decodeEffect(Package)(
    yield* fs.readFileString(path.join(app, 'package.json')),
  );
  const script = Option.fromUndefinedOr(pkg.scripts[`test:${flags.part}`]);
  if (Option.isNone(script)) return yield* Refused.make({ why: `no script test:${flags.part}` });
  const read = partOf(script.value);
  if (read._tag === 'Refused') return yield* Refused.make({ why: read.why });
  const texts = yield* Effect.forEach(read.files, (file) =>
    fs.readFileString(path.join(app, file)),
  );
  const walks = read.files.flatMap((file, index) => walksOf(file, texts[index] ?? ''));
  const env = { HEARTSEED_SEED_WALKS: [...new Set(walks)].join(',') };
  const committed = yield* runPart(app, read, env);
  if (committed.code !== 0)
    return yield* Refused.make({ why: `the committed run fails (exit ${committed.code})` });
  const decision = decide(callsIn(committed.out), flags.call);
  if (decision._tag === 'Refused') return yield* Refused.make({ why: decision.why });
  const { call } = decision;
  const count = Math.max(0, flags.to - flags.from + 1);
  const seeds = windowOf(flags.from, count);
  const meets = yield* searchWith(seeds, Math.max(1, flags.jobs), (seed) =>
    Effect.gen(function* () {
      const started = yield* Clock.currentTimeMillis;
      const ran = yield* runPart(app, read, {
        ...env,
        HEARTSEED_SEED_PIN: String(seed),
        HEARTSEED_SEED_CALL: String(call.index),
      });
      const line = `seed-pin ${call.fn} ${call.committed} -> ${pinnedText(call, seed)}`;
      const met = ran.code === 0 && ran.out.split('\n').includes(line);
      const took = (yield* Clock.currentTimeMillis) - started;
      yield* Console.log(`seed ${seed} ${verdictOf(met)} ${took} ms`);
      return met;
    }),
  );
  yield* Console.log(
    `seeds ${flags.part}: ${meets.join(',') || 'none'} of ${flags.from}-${flags.to} (${meets.length} meet), committed ${shown(call)}`,
  );
});

const command = Command.make(
  'seeds',
  {
    part: Argument.String('part').pipe(
      Argument.withDescription('the part, as its test:<part> script names it'),
    ),
    from: Flag.Int('from').pipe(Flag.withDefault(1)),
    to: Flag.Int('to').pipe(Flag.withDefault(200)),
    jobs: Flag.Int('jobs').pipe(Flag.withDefault(3)),
    call: Flag.Int('call').pipe(
      Flag.optional,
      Flag.withDescription('which seeded call of the committed run to pin, from 1'),
    ),
  },
  (flags) =>
    search(flags).pipe(
      Effect.catchTag('Refused', (refused) =>
        Console.log(`seeds ${flags.part}: refused, ${refused.why}`).pipe(
          Effect.andThen(
            Effect.sync(() => {
              process.exitCode = 2;
            }),
          ),
        ),
      ),
    ),
);

if (import.meta.main) {
  Command.run(command, { version: '1.0.0' }).pipe(Effect.provide(BunServices.layer), (program) =>
    BunRuntime.runMain(program),
  );
}
