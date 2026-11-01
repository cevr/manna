// Each stage kind names the source files whose code makes its bytes, and
// each of those files exists, so a code change reaches the stage's key.

import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem } from 'effect';
import { STAGE_SOURCES, type SourcedStage, sourceFiles } from './sources.ts';

describe('stage sources', () => {
  it.effect('names at least one file for every stage kind, and every file exists', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      for (const kind of Object.keys(STAGE_SOURCES) as ReadonlyArray<SourcedStage>) {
        expect({ kind, count: sourceFiles(kind).length }).not.toEqual({ kind, count: 0 });
        const missing = [];
        for (const file of sourceFiles(kind)) if (!(yield* fs.exists(file))) missing.push(file);
        expect({ kind, missing }).toEqual({ kind, missing: [] });
      }
    }).pipe(Effect.provide(BunFileSystem.layer)),
  );

  it.effect(
    'keys renders on the sampler and the puppet, and the clip eval on the chain and its fit',
    () =>
      Effect.sync(() => {
        const ends = (kind: SourcedStage) => sourceFiles(kind).map((f) => f.split('/src/').at(-1));
        expect(ends('renders')).toEqual(
          expect.arrayContaining([
            'core/pose-sample.ts',
            'core/puppet.ts',
            'tools/cast-build/renders.ts',
          ]),
        );
        expect(ends('chain')).toEqual(
          expect.arrayContaining([
            'tools/cast-build/chain.ts',
            'tools/cast-build/chain-fit.ts',
            'core/pose-fit.ts',
          ]),
        );
        expect(ends('fit')).toEqual(
          expect.arrayContaining(['tools/cast-render.ts', 'core/fit-rows.ts']),
        );
      }),
  );
});
