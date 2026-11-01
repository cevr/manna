// The cast reader's Python, run as the build runs it: its pytest cases in
// its uv environment (`uv.lock`'s, under `FILM_READER_HOME`); and, with no
// environment there, a refusal that names the line making one; and the
// committed folder's roles, as its imports derive them. Slow: it starts
// Python and imports torch.

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
});
