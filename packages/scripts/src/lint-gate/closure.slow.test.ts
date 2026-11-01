// The film's cast build keys each stage on the files its code runs, read by
// its own scanner (`@manna/film`'s `cast-build/imports.ts`, which needs no
// Bun API); the gate's lint keys its plugins by this one, over Bun's
// transpiler and resolver. Both are one view of a closure: for each stage
// kind they name the same repository files: the lint gate's closure of a
// stage's files is those files, so the film's scanner missed no import. Slow: it reads each
// closure off the disk.

import { describe, expect, it } from 'effect-bun-test';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Path } from 'effect';
import { stageSources } from '@manna/film/cast-build/sources';

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
        for (const [kind, inputs] of Object.entries(yield* stageSources)) {
          const files = inputs.flatMap((i) => {
            if (i._tag === 'File') return [i.path];
            return [];
          });
          const film = files.map((f) => path.relative(root, f));
          const gate = yield* importClosure(root, files);
          expect({ kind, film }).toEqual({ kind, film: gate });
        }
      }),
  );
});
