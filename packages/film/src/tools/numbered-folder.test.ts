import { describe, expect, it } from 'effect-bun-test';
import { Deferred, Effect, FileSystem, Layer, Path, Ref } from 'effect';
import { memoryFileSystem } from './host/testing.ts';
import { reserveNumbered } from './numbered-folder.ts';

/** The in-memory file system, its folder reads held until `runs` of them have begun: runs that read the root at once. */
const readingAtOnce = (folders: Set<string>, runs: number) =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const begun = yield* Ref.make(0);
      const all = yield* Deferred.make<true>();
      return {
        ...fs,
        readDirectory: (path, options) =>
          Effect.gen(function* () {
            const read = yield* fs.readDirectory(path, options);
            if ((yield* Ref.updateAndGet(begun, (n) => n + 1)) >= runs)
              yield* Deferred.succeed(all, true);
            yield* Deferred.await(all);
            return read;
          }),
      };
    }),
  ).pipe(Layer.provide(memoryFileSystem(new Map(), folders)));

/** `effect` run over `fs` and the paths. */
const over =
  (fs: Layer.Layer<FileSystem.FileSystem>) =>
  <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
    effect.pipe(Effect.provide([fs, Path.layer]));

describe('a numbered folder', () => {
  const together = new Set<string>();
  it.effect('two runs that read the root at once take two folders', () =>
    Effect.gen(function* () {
      const [a, b] = yield* Effect.all([reserveNumbered('/out/r'), reserveNumbered('/out/r')], {
        concurrency: 'unbounded',
      });
      expect([a.n, b.n].sort()).toEqual([1, 2]);
      expect(together.has('/out/r/1') && together.has('/out/r/2')).toBe(true);
    }).pipe(over(readingAtOnce(together, 2))),
  );

  const taken = new Set(['/out/r', '/out/r/3', '/out/r/notes']);
  it.effect('takes the number past every one there', () =>
    Effect.gen(function* () {
      expect(yield* reserveNumbered('/out/r')).toEqual({ n: 4, dir: '/out/r/4' });
    }).pipe(over(memoryFileSystem(new Map(), taken))),
  );
});
