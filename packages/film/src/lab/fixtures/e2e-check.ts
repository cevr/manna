import { availableParallelism, loadavg } from 'node:os';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import {
  Array as Arr,
  Clock,
  Config,
  Console,
  DateTime,
  Duration,
  Effect,
  FileSystem,
  Match,
  Option,
  Path,
  Schedule,
  Schema,
  Stdio,
  Stream,
} from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import {
  type Judged,
  type Run,
  Recorded,
  aloneArgs,
  ancestorsIn,
  baseOfLog,
  baseOfRecord,
  blocks,
  failuresIn,
  finishedIn,
  heldByAncestor,
  loadWords,
  lockedBy,
  recordOf,
  runOf,
  verdictMarkdown,
  verdictOf,
} from './e2e-verdict.ts';

const LOCK = '/tmp/manna-e2e.lock';

const HELD = 'FILM_E2E_CHECK_LOCKED';

const ALONE = 3;

const LOAD_WAIT = Duration.minutes(20);
const LOAD_POLL = Duration.seconds(15);

const Scripts = Schema.fromJsonString(
  Schema.Struct({ scripts: Schema.Struct({ 'test:e2e': Schema.String }) }),
);

const RecordedJson = Schema.fromJsonString(Recorded);

class FlagRefused extends Schema.TaggedError<FlagRefused>()('FlagRefused', {
  message: Schema.String,
}) {}

const flagsOf = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const flags = { base: Option.none<string>(), log: Option.none<string>() };
    for (const [flag, ...value] of Arr.chunksOf(args, 2)) {
      const key = Match.value(flag).pipe(
        Match.when('--base', () => Option.some('base' as const)),
        Match.when('--log', () => Option.some('log' as const)),
        Match.orElse(() => Option.none()),
      );
      const given = Option.all([key, Arr.head(value)]);
      if (Option.isNone(given))
        return yield* FlagRefused.make({
          message: `test:e2e:check: unknown or valueless flag ${flag}: use --base <log> and --log <log>`,
        });
      const [name, path] = given.value;
      flags[name] = Option.some(path);
    }
    return flags;
  });

const exitOf = (
  command: string,
  args: ReadonlyArray<string>,
  options: ChildProcess.CommandOptions,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner;
      return yield* (yield* spawner.spawn(ChildProcess.make(command, args, options))).exitCode;
    }),
  );

const outputOf = (command: string, args: ReadonlyArray<string>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner;
      const child = yield* spawner.spawn(
        ChildProcess.make(command, args, { stderr: 'ignore', forceKillAfter: '5 seconds' }),
      );
      return yield* child.stdout.pipe(Stream.decodeText(), Stream.mkString);
    }),
  );

const processes = outputOf('ps', ['-A', '-o', 'pid=', '-o', 'ppid=', '-o', 'command=']);

const heldOutside = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const commands = ancestorsIn(yield* processes, process.pid);
  const paths = [LOCK, ...commands.flatMap((command) => Option.toArray(lockedBy(command)))];
  const resolved = new Map(
    yield* Effect.forEach(paths, (path) =>
      Effect.map(
        Effect.orElseSucceed(fs.realPath(path), () => path),
        (real) => [path, real] as const,
      ),
    ),
  );
  return heldByAncestor(commands, LOCK, (path) => resolved.get(path) ?? path);
});

const underLock = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    yield* Console.log(
      `test:e2e:check: taking the host's e2e lock (${LOCK}); a run that holds it makes this one wait`,
    );
    return yield* exitOf('lockf', ['-k', LOCK, process.execPath, import.meta.path, ...args], {
      env: { [HELD]: '1' },
      extendEnv: true,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    });
  });

const loadNow = Effect.sync(() => {
  const [load = 0] = loadavg();
  return { load, cores: availableParallelism() };
});

const quiet = Effect.gen(function* () {
  const started = yield* Clock.currentTimeMillis;
  const elapsed = Effect.map(Clock.currentTimeMillis, (now) => Math.round((now - started) / 1000));
  const limit = Duration.toSeconds(LOAD_WAIT);
  const busy = (host: { readonly load: number; readonly cores: number }) => host.load > host.cores;
  let polls = 0;
  const said = loadNow.pipe(
    Effect.tap((host) =>
      Effect.gen(function* () {
        const waited = yield* elapsed;
        polls += 1;
        if (busy(host) && polls % 4 === 1)
          yield* Console.log(
            `test:e2e:check: load ${host.load.toFixed(1)} on ${host.cores} cores: waiting for it to fall to ${host.cores} (waited ${waited} s of at most ${limit} s)`,
          );
      }),
    ),
  );
  const host = yield* said.pipe(
    Effect.repeat({ schedule: Schedule.spaced(LOAD_POLL), while: busy }),
    Effect.timeoutOption(LOAD_WAIT),
    Effect.flatMap(Option.match({ onSome: Effect.succeed, onNone: () => loadNow })),
  );
  const words = loadWords({ ...host, waited: yield* elapsed });
  yield* Console.log(`test:e2e:check: load ${words}`);
  return words;
});

const check = (flags: Effect.Success<ReturnType<typeof flagsOf>>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner;
    const stdio = yield* Stdio.Stdio;
    const pkg = path.resolve(import.meta.dir, '..', '..', '..');
    const root = path.resolve(pkg, '..', '..');
    const suite = (yield* Effect.flatMap(
      fs.readFileString(path.join(pkg, 'package.json')),
      Schema.decodeUnknownEffect(Scripts),
    )).scripts['test:e2e'];
    const stamp = DateTime.formatIso(yield* DateTime.now).replace(/[:.]/g, '-');
    const log = path.resolve(
      // oxlint-disable-next-line effect/noRepoTempDirectory -- the check's log and verdict are its output, kept under tmp/e2e for the reader (CLAUDE.md), never a test's scratch
      Option.getOrElse(flags.log, () => path.join(root, 'tmp', 'e2e', `${stamp}.log`)),
    );
    yield* fs.makeDirectory(path.dirname(log), { recursive: true });
    const base = yield* Option.match(flags.base, {
      onNone: () => Effect.succeedNone,
      onSome: (b) =>
        Effect.gen(function* () {
          const record = `${path.resolve(b)}.verdict.json`;
          if (yield* fs.exists(record)) {
            const recorded = yield* Effect.flatMap(
              fs.readFileString(record),
              Schema.decodeUnknownEffect(RecordedJson),
            );
            return Option.some({ path: b, reruns: true, base: baseOfRecord(recorded) });
          }
          const text = yield* fs.readFileString(b);
          return Option.some({ path: b, reruns: false, base: baseOfLog(text) });
        }),
    });
    const load = yield* quiet;

    const started = yield* Clock.currentTimeMillis;
    const exit = yield* Effect.scoped(
      Effect.gen(function* () {
        const file = yield* fs.open(log, { flag: 'w' });
        const child = yield* spawner.spawn(
          ChildProcess.make('bun', ['run', 'test:e2e'], {
            cwd: pkg,
            stdin: 'inherit',
            forceKillAfter: '5 seconds',
          }),
        );
        yield* child.all.pipe(
          Stream.tap((chunk) => file.writeAll(chunk)),
          Stream.run(stdio.stdout({ endOnDone: false })),
        );
        return yield* child.exitCode;
      }),
    );
    const seconds = Math.round(((yield* Clock.currentTimeMillis) - started) / 1000);
    const text = yield* fs.readFileString(log);
    const finished = finishedIn(text);

    const aloneLog = `${log}.alone.log`;
    yield* fs.writeFileString(aloneLog, '');
    const rerun = (failure: Judged['failure'], k: number) =>
      Effect.scoped(
        Effect.gen(function* () {
          yield* Console.log(`test:e2e:check: alone ${k}/${ALONE}: ${failure.name}`);
          const [command = 'bun', ...rest] = aloneArgs(suite, failure);
          const child = yield* spawner.spawn(
            ChildProcess.make(command, rest, { cwd: pkg, forceKillAfter: '5 seconds' }),
          );
          const out = yield* child.all.pipe(Stream.decodeText(), Stream.mkString);
          yield* fs.writeFileString(
            aloneLog,
            `\n=== ${failure.name} (alone ${k}/${ALONE})\n${out}`,
            {
              flag: 'a',
            },
          );
          return runOf(yield* child.exitCode, out);
        }),
      );
    const judged: ReadonlyArray<Judged> = yield* Effect.forEach(failuresIn(text), (failure) =>
      Effect.map(
        Option.match(failure.file, {
          onNone: () => Effect.succeed<ReadonlyArray<Run>>([]),
          onSome: () => Effect.forEach(Arr.range(1, ALONE), (k) => rerun(failure, k)),
        }),
        (alone) => ({
          failure,
          alone,
          verdict: verdictOf(
            failure,
            alone,
            Option.map(base, (b) => b.base),
          ),
        }),
      ),
    );

    const verdictPath = `${log}.verdict.md`;
    yield* fs.writeFileString(
      verdictPath,
      verdictMarkdown({
        log,
        base: Option.map(base, (b) => ({ path: b.path, reruns: b.reruns })),
        exit,
        seconds,
        load,
        finished,
        judged,
      }),
    );
    yield* fs.writeFileString(
      `${log}.verdict.json`,
      yield* Schema.encodeEffect(RecordedJson)(recordOf(finished, judged)),
    );
    const blocked = blocks({ exit, finished, judged });
    yield* Console.log(
      `test:e2e:check: ${Match.value(blocked).pipe(
        Match.when(true, () => 'blocked'),
        Match.orElse(() => 'clear'),
      )}; verdict ${verdictPath}`,
    );
    return Number(blocked);
  });

const main = Effect.gen(function* () {
  const args = yield* (yield* Stdio.Stdio).args;
  const flags = yield* flagsOf(args);
  if (Option.isSome(yield* Config.option(Config.String(HELD)))) return yield* check(flags);
  if (yield* heldOutside) {
    yield* Console.log(
      `test:e2e:check: an outer lockf already holds ${LOCK}: running in its hold (the check takes the lock itself, so it need not be wrapped)`,
    );
    return yield* check(flags);
  }
  return yield* underLock(args);
}).pipe(
  Effect.catchTag('FlagRefused', (e) => Effect.as(Console.error(e.message), 2)),
  Effect.flatMap((code) =>
    Effect.sync(() => {
      process.exitCode = code;
    }),
  ),
  Effect.provide(BunServices.layer),
);

BunRuntime.runMain(main);
