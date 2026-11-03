import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Config, Effect, Layer, Option, Path, Result, Schema, Stream } from 'effect';
import { Command, Flag } from 'effect/cli';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import { RECORDING_SET, RECORDING_SETS, setHolds } from '@manna/hymnal/recordings';

import { HashBun } from './hash-bun.ts';
import { SDAH_HYMNS } from './plan.ts';
import { TargetR2Writes } from './r2.ts';
import { hymnsOf, keysOf, Renderer, stream, StreamFailed } from './stream-job.ts';

export class StreamIncomplete extends Schema.TaggedError<StreamIncomplete>()('StreamIncomplete', {
  failed: Schema.Finite,
}) {
  override get message() {
    return `audio stream: ${this.failed} hymns failed; their lines in stream.log say why, and a rerun tries them again`;
  }
}

const renderCache = Effect.gen(function* () {
  const path = yield* Path.Path;
  const home = yield* Config.String('HOME');
  return yield* Config.String('HYMN_RENDER_CACHE').pipe(
    Config.withDefault(path.join(home, '.cache', 'manna-hymn-render')),
  );
});

const renderLive = (load: number) =>
  Layer.effect(
    Renderer,
    Effect.gen(function* () {
      const cache = yield* renderCache;
      const spawner = yield* ChildProcessSpawner;
      const path = yield* Path.Path;
      const pkg = path.resolve(import.meta.dir, '../../../../packages/hymnal');
      const script = path.join(pkg, 'scripts/render/render.ts');
      const run = (args: ReadonlyArray<string>) =>
        Effect.gen(function* () {
          const child = yield* spawner.spawn(
            ChildProcess.make(process.execPath, [script, ...args], {
              cwd: pkg,
              env: { HYMN_RENDER_CACHE: cache },
              extendEnv: true,
              forceKillAfter: '5 seconds',
            }),
          );
          const [stdout, stderr, code] = yield* Effect.all(
            [
              Stream.mkString(Stream.decodeText(child.stdout)),
              Stream.mkString(Stream.decodeText(child.stderr)),
              child.exitCode,
            ],
            { concurrency: 3 },
          );
          return { code: Number(code), tail: `${stdout}\n${stderr}`.trim().slice(-3000) };
        }).pipe(
          Effect.scoped,
          Effect.mapError((error) => StreamFailed.make({ reason: `render.ts: ${error.message}` })),
        );
      const dirs = (set: string, out: string, work: string, transpose: number) => [
        '--set',
        set,
        '--transpose',
        String(transpose),
        '--out',
        out,
        '--work',
        work,
      ];
      return Renderer.of({
        render: ({ set, hymn, transpose, out, work }) =>
          run([
            '--hymns',
            String(hymn),
            ...dirs(set, out, work, transpose),
            '--load',
            String(load),
            '--skip-manifest',
          ]),
        manifest: ({ set, transpose, out, work }) =>
          run([...dirs(set, out, work, transpose), '--manifest-only']),
      });
    }),
  );

const audioStream = Command.make('audio-stream', {
  set: Flag.String('set').pipe(
    Flag.withDefault(RECORDING_SET),
    Flag.withDescription(
      `The set whose key sets are streamed, one of ${RECORDING_SETS.map((s) => s.name).join(', ')}`,
    ),
  ),
  keys: Flag.String('keys').pipe(
    Flag.withDescription('all (+1, -1, +2, -2, ... +6), or transposes such as 2,-3'),
  ),
  hymns: Flag.String('hymns').pipe(
    Flag.optional,
    Flag.withDescription(
      'Hymn numbers, unpadded and comma-separated (default every hymn the set holds)',
    ),
  ),
  parallel: Flag.Int('parallel').pipe(
    Flag.withDefault(4),
    Flag.withDescription('Hymns rendered at once'),
  ),
  load: Flag.Finite('load').pipe(
    Flag.withDefault(12),
    Flag.withDescription('The 1-minute load over which a hymn waits to render'),
  ),
}).pipe(
  Command.withDescription(
    'Render the Warm band in the other keys and stream each hymn to R2: render, check, upload, verify, delete',
  ),
  Command.withHandler((flags) =>
    Effect.gen(function* () {
      const cache = yield* renderCache;
      const keys = keysOf(flags.keys);
      if (Result.isFailure(keys)) return yield* StreamFailed.make({ reason: keys.failure });
      const hymns = Option.match(flags.hymns, {
        onNone: () => Result.succeed(SDAH_HYMNS.filter((hymn) => setHolds(flags.set, hymn))),
        onSome: hymnsOf,
      });
      if (Result.isFailure(hymns)) return yield* StreamFailed.make({ reason: hymns.failure });
      if (flags.parallel < 1)
        return yield* StreamFailed.make({ reason: `--parallel ${flags.parallel}: at least 1` });
      const { failed } = yield* stream({
        cache,
        set: flags.set,
        keys: keys.success,
        hymns: hymns.success,
        parallel: flags.parallel,
      });
      if (failed > 0) return yield* StreamIncomplete.make({ failed });
    }).pipe(Effect.provide(Layer.mergeAll(HashBun, TargetR2Writes, renderLive(flags.load)))),
  ),
);

Command.run(audioStream, { version: '1.0.0' }).pipe(
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
