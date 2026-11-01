// The cast reader's Python, run as the build runs it: its pytest cases in
// its uv environment (`uv.lock`'s, under `FILM_READER_HOME`); and, with no
// environment there, a refusal that names the line making one; and the
// committed folder's roles, as its imports derive them; the train config
// against model.py's defaults; and the unit tests' own file, which reads no
// real folder. Slow: it starts Python and imports torch, and it reads the
// repo's files.

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Effect, FileSystem, Layer, Schema } from 'effect';
import { CastReader } from './reader.ts';
import { trainStage } from './stages.ts';

const live = CastReader.layer.pipe(Layer.provideMerge(BunServices.layer));

/** The train config's backbone and input, as its JSON names them. */
const decodeTrainConfig = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      backbone: Schema.String,
      inputSide: Schema.Struct({ width: Schema.Finite, height: Schema.Finite }),
    }),
  ),
);

/** A file of this folder's, read off disk. */
const fileHere = (name: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(new URL(name, import.meta.url).pathname);
  });

describe('cast reader (Python)', () => {
  it.live(
    "its pytest cases pass in the lock's environment",
    () =>
      Effect.gen(function* () {
        const out = yield* (yield* CastReader).test;
        expect(out).toMatch(/\d+ passed/);
        expect(out).not.toMatch(/failed|error/);
      }).pipe(Effect.provide(live)),
    // oxlint-disable-next-line film/tests-keep-their-strength -- the reader runs pytest in its Python environment, a spawn inside the service the test provides (spawn budget).
    120_000,
  );

  it.effect('with no environment it refuses, naming the uv line that makes one', () =>
    Effect.gen(function* () {
      const failed = yield* Effect.flip((yield* CastReader).test);
      expect(failed._tag).toBe('ReaderMissing');
      expect(failed.message).toContain('/nonexistent/reader-probe-x/venv-');
      expect(failed.message).toContain('uv sync --frozen');
    }).pipe(
      Effect.provide(
        live.pipe(
          Layer.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({
                FILM_READER_HOME: '/nonexistent/reader-probe-x',
                HOME: '/nonexistent',
              }),
            ),
          ),
        ),
      ),
    ),
  );

  it.effect(
    "names the committed folder's files by role, from their imports: what trains, reads and evals, never the tests",
    () =>
      Effect.gen(function* () {
        const { sources } = yield* CastReader;
        const names = (files: ReadonlyArray<string>) => files.map((s) => s.split('/').at(-1));
        expect(names(sources.train)).toEqual(['modal_app.py', 'model.py', 'train.py']);
        expect(names(sources.read)).toEqual(['model.py', 'pyproject.toml', 'read.py', 'uv.lock']);
        expect(names(sources.eval)).toEqual([
          'eval.py',
          'model.py',
          'pyproject.toml',
          'read.py',
          'uv.lock',
        ]);
      }).pipe(Effect.provide(live)),
  );

  it.effect("the train config's backbone and input, in its key, are model.py's defaults", () =>
    Effect.gen(function* () {
      const model = yield* fileHere('../../../reader/model.py');
      // the config is the train key's (`graph.ts` keys every stage by its config)
      const train = decodeTrainConfig(
        trainStage([], [], '/nonexistent/reader.lock.json').config ?? '',
      );
      expect(train.backbone).toBe('facebook/dinov2-small');
      expect(model).toContain(`BACKBONE = "${train.backbone}"`);
      expect(model).toContain(`IN_W, IN_H = ${train.inputSide.width}, ${train.inputSide.height}`);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  // review reader-key r1 M3: the unit tests once wrote and read a host folder; they stay on an in-memory disk
  it.effect(
    'the cast reader unit tests read no real folder: reader.test.ts takes no Bun platform layer and names no file by its URL',
    () =>
      Effect.gen(function* () {
        const unit = yield* fileHere('./reader.test.ts');
        expect(unit).not.toMatch(/@effect\/platform-bun|node:fs|import\.meta/);
      }).pipe(Effect.provide(BunServices.layer)),
  );
});
