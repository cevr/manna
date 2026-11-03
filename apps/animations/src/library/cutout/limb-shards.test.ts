import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Result } from 'effect';
import { expect, it } from 'effect-bun-test';
import { posesFor, shardOf } from './limb-shards.ts';
import { refusalErrors } from './limb-census.ts';

it.effect(
  'the actual shard files derive their index from their own file and cover 0..n-1 once',
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const names = (yield* fs.readDirectory(import.meta.dir)).filter((n) =>
        /^limb-sweep-\d+\.slow\.test\.ts$/.test(n),
      );
      const indices: Array<number> = [];
      for (const name of names) {
        const source = yield* fs.readFileString(import.meta.dir + '/' + name);
        expect(source).toMatch(/sweep\(import\.meta\.file\)/);
        indices.push(Result.getOrThrow(shardOf(name, names)).index);
      }
      expect(indices.toSorted((a, b) => a - b)).toEqual(
        Array.from({ length: names.length }, (_, i) => i),
      );
      for (const view of [0, 7, 49]) {
        const poses = indices.flatMap((index) => posesFor(view, { index, count: names.length }));
        expect(poses.length).toBe(72);
        expect(new Set(poses.map((p) => p.join('/'))).size).toBe(72);
      }
      expect(
        Result.isFailure(
          shardOf('limb-sweep-1.slow.test.ts', [
            'limb-sweep-1.slow.test.ts',
            'limb-sweep-3.slow.test.ts',
          ]),
        ),
      ).toBe(true);
    }).pipe(Effect.provide(BunServices.layer)),
);

it.effect('an orphan refusal and every declaration refusal fail the census', () =>
  Effect.sync(() => {
    const typo = { part: 'armLeft', kind: 'declaration', message: 'missing wristLeft in skin' };
    expect(refusalErrors([typo], [])).toEqual([
      'orphan refusal: missing wristLeft in skin',
      'declaration: missing wristLeft in skin',
    ]);
    expect(refusalErrors([typo], [{ part: 'armLeft' }])).toEqual([
      'declaration: missing wristLeft in skin',
    ]);
    expect(refusalErrors([{ ...typo, kind: 'off-part' }], [{ part: 'armLeft' }])).toEqual([]);
  }),
);
