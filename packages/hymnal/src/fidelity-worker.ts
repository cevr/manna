import { HymnId } from '@manna/core/hymnal';
import { SourceHymnal, layerSourceText } from '../scripts/source-text.js';
import { BunWorkerRunner } from '@effect/platform-bun';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Cause, Effect, FileSystem, Layer, Result } from 'effect';
import * as WorkerRunner from 'effect/workers/WorkerRunner';

import { decodeOrders, sourceOf } from '../scripts/sources.js';
import { compile } from './compile.js';
import type { Hymn } from './hymn.js';

type Done =
  | { readonly number: number; readonly hymn: Hymn }
  | { readonly number: number; readonly failure: string };

const data = (file: string) => new URL(`../data/${file}`, import.meta.url).pathname;

const layer = Layer.merge(
  layerSourceText.pipe(Layer.provide(BunServices.layer)),
  BunServices.layer,
);

const compileAll = (numbers: readonly number[], send: (done: Done) => Effect.Effect<void>) =>
  Effect.gen(function* () {
    const orders = yield* Effect.cached(
      Effect.flatMap(
        Effect.flatMap(FileSystem.FileSystem, (fs) =>
          fs.readFileString(data('fixes/refrains.json')),
        ),
        decodeOrders,
      ),
    );
    for (const n of numbers) {
      const done = yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const row = yield* (yield* SourceHymnal).getHymn(HymnId.make(n));
        const midi = yield* fs.readFile(data(`midi/${String(n).padStart(3, '0')}.mid`));
        const result = yield* Effect.result(
          sourceOf({ number: n, name: row.name, verses: row.verses }, midi, yield* orders).pipe(
            Effect.flatMap(compile),
          ),
        );
        return Result.isSuccess(result)
          ? { number: n, hymn: result.success }
          : { number: n, failure: `compile failed: ${result.failure._tag}` };
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.succeed({ number: n, failure: `not compiled: ${Cause.pretty(cause)}` }),
        ),
      );
      yield* send(done);
    }
  });

const serve = Effect.gen(function* () {
  const runner = yield* (yield* WorkerRunner.WorkerRunnerPlatform).start<Done, readonly number[]>();
  return yield* runner.run((_port, numbers) => compileAll(numbers, (done) => runner.send(0, done)));
});

Effect.runFork(serve.pipe(Effect.provide(Layer.merge(BunWorkerRunner.layer, layer))));
