// The film's cast build keys each stage on the files its code runs, read by
// its own scanner (`@manna/film`'s `cast-build/imports.ts`, which needs no
// Bun API); the gate's lint keys its plugins by this one, over Bun's
// transpiler and resolver. Both are one view of a closure: for each stage
// kind's entries they name the same repository files. Slow: it reads each
// closure off the disk.

import { describe, expect, it } from 'effect-bun-test';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Path } from 'effect';
import {
  STAGE_ENTRIES,
  type SourcedStage,
  sourceFiles,
  stageEntryFiles,
} from '@manna/film/cast-build/sources';

import { importClosure } from './closure.js';

const ROOT = new URL('../../../../', import.meta.url).pathname;

describe("the cast build's stage closures", () => {
  it.effect.layer(BunServices.layer)(
    'name the same files as the lint gate’s scanner, for each stage kind',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.realPath(ROOT);
        for (const kind of Object.keys(STAGE_ENTRIES) as ReadonlyArray<SourcedStage>) {
          const film = (yield* sourceFiles(kind)).map((f) => path.relative(root, f));
          const gate = yield* importClosure(root, stageEntryFiles(kind));
          expect({ kind, film }).toEqual({ kind, film: gate });
        }
      }),
  );
});
