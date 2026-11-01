// The cast reader's Python, run as the build runs it: its pytest cases in
// its uv environment (`uv.lock`'s, under `FILM_READER_HOME`); and, with no
// environment there, a refusal that names the line making one. Slow: it
// starts Python and imports torch.

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Effect, Layer } from 'effect';
import { CastReader } from './reader.ts';

const live = CastReader.layer.pipe(Layer.provideMerge(BunServices.layer));

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

  it.effect('names its source files: the model, its scripts and the lock, never the tests', () =>
    Effect.gen(function* () {
      const names = (yield* CastReader).sources.map((s) => s.split('/').at(-1));
      expect(names).toEqual([
        'eval.py',
        'modal_app.py',
        'model.py',
        'pyproject.toml',
        'read.py',
        'train.py',
        'uv.lock',
      ]);
    }).pipe(Effect.provide(live)),
  );
});
