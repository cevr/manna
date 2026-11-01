// The import scanner over a tiny tree in memory: static imports, re-exports
// and literal dynamic imports followed to files, transitively, with or
// without an extension; packages and type-only imports not followed.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Path } from 'effect';
import { memoryFileSystem, text } from '../host/testing.ts';
import { importClosure, specifiersOf } from './imports.ts';

const tree = () =>
  new Map<string, Uint8Array>([
    [
      '/src/a.ts',
      text(
        [
          "import { Effect } from 'effect';",
          "import {\n  b,\n  type B,\n} from './b.ts';",
          "import type { T } from './types.ts';",
          "export { c } from './lib/c';",
          "import './side.ts';",
        ].join('\n'),
      ),
    ],
    ['/src/b.ts', text("export const b = () => import('./lazy.ts');")],
    ['/src/lib/c/index.ts', text("export * from '../../data.json';\nexport const c = 1;")],
    ['/src/side.ts', text('globalThis.x = 1;')],
    ['/src/lazy.ts', text('export const lazy = 1;')],
    ['/src/types.ts', text('export type T = number;')],
    ['/src/data.json', text('{}')],
    ['/src/unused.ts', text('export const u = 1;')],
  ]);

describe('import closure', () => {
  it.effect(
    'reads static, re-export, side-effect and literal dynamic specifiers, not type-only ones',
    () =>
      Effect.sync(() => {
        expect(
          specifiersOf(
            "import a from './a';\nimport type { T } from './t';\nexport type { U } from './u';\nexport * from './e';\nimport './s';\nconst l = import('./l');",
          ),
        ).toEqual(['./a', './e', './s', './l']);
      }),
  );

  it.effect('follows local files transitively, and no package or type-only import', () =>
    Effect.gen(function* () {
      const files = yield* importClosure(['/src/a.ts']);
      expect(files).toEqual([
        '/src/a.ts',
        '/src/b.ts',
        '/src/data.json',
        '/src/lazy.ts',
        '/src/lib/c/index.ts',
        '/src/side.ts',
      ]);
    }).pipe(Effect.provide(Layer.mergeAll(memoryFileSystem(tree()), Path.layer))),
  );
});
