// The film's cast build keys each stage on the files its code runs, read by
// its own scanner (`@manna/film`'s `cast-build/imports.ts`, which needs no
// Bun API); the gate's lint keys its plugins by this one, over Bun's
// transpiler and resolver. Both are one view of a closure: for each stage
// kind, and for a film's `rigs/cast.ts` (which the fit render loads by its
// path), they name the same repository files: the lint gate's closure of the
// film scanner's files is those files, so the film's scanner missed no
// import. Slow: it reads each closure off the disk.

import { describe, expect, it } from 'effect-bun-test';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Path } from 'effect';
import { filmCastSources, stageSources } from '@manna/film/cast-build/sources';

import { importClosure } from './closure.js';

const ROOT = new URL('../../../../', import.meta.url).pathname;

describe("the cast build's stage closures", () => {
  it.effect.layer(BunServices.layer)(
    'name the same files as the lint gate’s scanner, for each stage kind and the film’s cast',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.realPath(ROOT);
        const film = path.join(root, 'apps/animations/src/films/in-its-order');
        const closures = {
          ...(yield* stageSources),
          'in-its-order rigs/cast.ts': yield* filmCastSources(film),
        };
        for (const [kind, inputs] of Object.entries(closures)) {
          const files = inputs.flatMap((i) => {
            if (i._tag === 'File') return [i.path];
            return [];
          });
          const scanned = files.map((f) => path.relative(root, f));
          const gate = yield* importClosure(root, files);
          expect({ kind, scanned }).toEqual({ kind, scanned: gate });
        }
        // the film's cast closure runs past its own folder (the rigs it builds on)
        expect(closures['in-its-order rigs/cast.ts'].length).toBeGreaterThan(1);
      }),
  );
});
