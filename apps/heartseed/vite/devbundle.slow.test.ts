/**
 * The One dev server answers a Debug build's bundle request with Hermes
 * bytecode: `one dev` started in the app, with `HERMESC_PATH` set to
 * react-native's hermesc (what `sim boot` hands it), serves
 * `/index.bundle?platform=ios&dev=true&bytecode=hermes` as status 200 whose
 * first 8 bytes are Hermes bytecode's magic.
 *
 * Its seams: the dev server as a child process in a process group of its
 * own, and its HTTP answer. It catches every module of the app's iOS dev
 * bundle, and vxrn's runtime and transforms, that Hermes cannot compile (the
 * request answers 500 with hermesc's error), and a server that never comes
 * up. It misses the simulator's run of the bytecode: the live rows on
 * `verify-heartseed` launch it.
 */

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Duration, Effect, FileSystem, Layer, Option, Path, Schedule, Stream } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/** How long the server may take to answer at all. */
const UP_MS = 120_000;
/** How often the server is asked whether it answers yet. */
const POLL_MS = 500;
/** How long the bundle request may take: a cold build of the whole app and its compile. */
const BUNDLE_MS = 240_000;
/** The timeout of the test, which spawns the dev server: its start, the bundle and the stop (effect/requireSpawnBudget). */
const SPAWNS_MS = UP_MS + BUNDLE_MS + 30_000;

/** The ports a dev-server check may take, the first free one taken. */
const PORTS: ReadonlyArray<number> = Array.from({ length: 10 }, (_, i) => 8280 + i);

/** hermesc's folder in hermes-compiler, by host. */
const HERMES_BIN: ReadonlyMap<string, string> = new Map([
  ['darwin', 'osx-bin'],
  ['linux', 'linux64-bin'],
]);

/** Hermes bytecode's magic, the first 8 bytes of every `.hbc`. */
const HERMES_MAGIC = 'c61fbc03c103191f';

/** The request a Debug build's launch makes. */
const BUNDLE = '/index.bundle?platform=ios&dev=true&bytecode=hermes';

/** How much of the server's output a failure carries. */
const TAIL_CHARS = 4000;

/** A package's real directory, resolved from `from` as the dev server finds it. */
const packageDir = Effect.fn('test.devserver.packageDir')(function* (name: string, from: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return path.dirname(yield* fs.realPath(Bun.resolveSync(`${name}/package.json`, from)));
});

/** react-native's hermesc, the compiler `sim boot` hands the dev server. */
const hermesc = Effect.fn('test.devserver.hermesc')(function* (app: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const bin = yield* Option.match(Option.fromNullishOr(HERMES_BIN.get(process.platform)), {
    onNone: () => Effect.die(`no hermesc for platform ${process.platform}`),
    onSome: Effect.succeed,
  });
  const reactNative = yield* fs.realPath(path.join(app, 'node_modules/react-native'));
  const compiler = path.join(
    yield* packageDir('hermes-compiler', reactNative),
    'hermesc',
    bin,
    'hermesc',
  );
  if (!(yield* fs.exists(compiler))) return yield* Effect.die(`no hermesc at ${compiler}`);
  return compiler;
});

/** Something answers HTTP on `port`, whatever its status. */
const answers = (port: number) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    return yield* Effect.isSuccess(
      client.get(`http://127.0.0.1:${port}/`).pipe(Effect.timeout('1 second')),
    );
  });

/** The first port of 8280-8289 that nothing answers on. */
const freePort = Effect.gen(function* () {
  const taken = yield* Effect.forEach(PORTS, answers, { concurrency: PORTS.length });
  const index = taken.indexOf(false);
  if (index < 0) return yield* Effect.die('every port of 8280-8289 already answers');
  return PORTS[index] ?? PORTS[0] ?? 8280;
});

/** The bundle's status, its size, its first 8 bytes and, when it failed, its `error:` line. */
interface Answer {
  readonly status: number;
  readonly bytes: number;
  readonly head: string;
  readonly error: string;
}

/** Start `one dev` on `port` in this scope, its group stopped when the scope closes; the bundle's answer and the server's pid. */
const serve = Effect.fn('test.devserver.serve')(function* (app: string, port: number) {
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const client = yield* HttpClient.HttpClient;
  const compiler = yield* hermesc(app);
  const server = yield* spawner.spawn(
    ChildProcess.make(
      path.join(app, 'node_modules/.bin/one'),
      ['dev', '--port', String(port), '--host', '127.0.0.1'],
      {
        cwd: app,
        env: { HERMESC_PATH: compiler },
        extendEnv: true,
        forceKillAfter: '5 seconds',
      },
    ),
  );
  const output: Array<string> = [];
  const keep = (text: string) => Effect.sync(() => void output.push(text));
  yield* Effect.forkScoped(Stream.runForEach(Stream.decodeText(server.stdout), keep));
  yield* Effect.forkScoped(Stream.runForEach(Stream.decodeText(server.stderr), keep));
  const tail = () => output.join('').slice(-TAIL_CHARS);
  const exited = server.exitCode.pipe(
    Effect.flatMap((code) => Effect.die(`one dev exited ${code} before it answered:\n${tail()}`)),
  );
  const up = answers(port).pipe(
    Effect.filterOrFail((answered) => answered),
    Effect.retry({ schedule: Schedule.spaced(Duration.millis(POLL_MS)), times: UP_MS / POLL_MS }),
    Effect.timeoutOrElse({
      duration: Duration.millis(UP_MS),
      orElse: () => Effect.die(`one dev did not answer on ${port} in ${UP_MS} ms:\n${tail()}`),
    }),
  );
  yield* Effect.raceFirst(up, exited);
  const answer: Answer = yield* client.get(`http://127.0.0.1:${port}${BUNDLE}`).pipe(
    Effect.flatMap((response) =>
      Effect.map(response.arrayBuffer, (buffer) => {
        const body = Buffer.from(buffer);
        const text = Option.match(
          Option.liftPredicate(response.status, (status) => status !== 200),
          { onNone: () => '', onSome: () => body.toString('utf8') },
        );
        return {
          status: response.status,
          bytes: body.length,
          head: body.subarray(0, 8).toString('hex'),
          error: text.split('\n').find((line) => line.includes('error:')) ?? text.slice(0, 400),
        };
      }),
    ),
    Effect.timeoutOrElse({
      duration: Duration.millis(BUNDLE_MS),
      orElse: () => Effect.die(`the bundle took over ${BUNDLE_MS} ms:\n${tail()}`),
    }),
    Effect.orDie,
  );
  return { answer, pid: Number(server.pid) };
});

/** The process group `pid` leads is gone: signal 0 finds no member. */
const groupGone = (pid: number) =>
  Effect.try({
    try: () => process.kill(-pid, 0),
    catch: (error) => error instanceof Error && 'code' in error && error.code === 'ESRCH',
  }).pipe(Effect.match({ onSuccess: () => false, onFailure: (gone) => gone }));

const Host = Layer.merge(BunServices.layer, FetchHttpClient.layer);

describe('the dev server', () => {
  it.live.layer(Host)(
    'answers a Debug build’s bundle request with Hermes bytecode',
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const app = path.resolve(import.meta.dir, '..');
        const port = yield* freePort;
        const { answer, pid } = yield* Effect.scoped(serve(app, port));
        expect({ status: answer.status, head: answer.head, error: answer.error }).toEqual({
          status: 200,
          head: HERMES_MAGIC,
          error: '',
        });
        expect(answer.bytes).toBeGreaterThan(1_000_000);
        expect(yield* groupGone(pid)).toBe(true);
      }),
    SPAWNS_MS,
  );
});
