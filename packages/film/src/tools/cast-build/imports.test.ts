// The import scanner over a tiny tree in memory: static imports, re-exports
// and literal dynamic imports followed to files, transitively, with or
// without an extension; packages and type-only imports not followed.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Path } from 'effect';
import { memoryFileSystem, text } from '../host/testing.ts';
import { ImportUnresolved, UndeclaredImport, declaredClosure } from './imports.ts';

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

/** The tree, with `b.ts` loading a module by a variable path. */
const loader = () =>
  new Map([...tree(), ['/src/b.ts', text('export const load = (f: string) => import(f);')]]);

describe('import closure', () => {
  it.effect(
    'reads static, re-export, side-effect and literal dynamic specifiers, not type-only ones',
    () =>
      // Each name the scanner must not read names no file, and a relative import of no file fails the closure.
      Effect.gen(function* () {
        expect(yield* declaredClosure(['/k/main.ts'], [])).toEqual(
          ['a', 'e', 'l', 'main', 's'].map((f) => `/k/${f}.ts`),
        );
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            memoryFileSystem(
              new Map([
                [
                  '/k/main.ts',
                  text(
                    "// import './commented'\n/** import('./doc') */\nimport a from './a';\nimport type { T } from './t';\nexport type { U } from './u';\nexport * from './e';\nimport './s';\nconst l = import('./l');",
                  ),
                ],
                ...['a', 'e', 's', 'l'].map((f) => [`/k/${f}.ts`, text('export {};')] as const),
              ]),
            ),
            Path.layer,
          ),
        ),
      ),
  );

  it.effect('follows local files transitively, and no package or type-only import', () =>
    Effect.gen(function* () {
      const files = yield* declaredClosure(['/src/a.ts'], []);
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

  it.effect('a `.js` name resolves to its `.ts` file, as Bun resolves it', () =>
    Effect.gen(function* () {
      const files = yield* declaredClosure(['/j/a.ts'], []);
      expect(files).toEqual(['/j/a.ts', '/j/b.ts', '/j/c.tsx']);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          memoryFileSystem(
            new Map([
              ['/j/a.ts', text("import { b } from './b.js';\nimport { c } from './c.jsx';")],
              ['/j/b.ts', text('export const b = 1;')],
              ['/j/c.tsx', text('export const c = 1;')],
            ]),
          ),
          Path.layer,
        ),
      ),
    ),
  );

  it.effect('a relative specifier that resolves to no file fails the closure', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(declaredClosure(['/u/a.ts'], []));
      expect(error).toEqual(ImportUnresolved.make({ file: '/u/a.ts', specifier: './gone.ts' }));
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          memoryFileSystem(new Map([['/u/a.ts', text("import { g } from './gone.ts';")]])),
          Path.layer,
        ),
      ),
    ),
  );

  it.effect(
    'a workspace package is followed to the file its exports name; another package is not',
    () =>
      Effect.gen(function* () {
        const files = yield* declaredClosure(['/w/app/a.ts'], []);
        expect(files).toEqual([
          '/w/app/a.ts',
          '/w/node_modules/@manna/x/src/index.ts',
          '/w/node_modules/@manna/x/src/tools/index.ts',
          '/w/node_modules/@manna/x/src/tools/t.ts',
        ]);
        const error = yield* Effect.flip(declaredClosure(['/w/app/gone.ts'], []));
        expect(error).toEqual(
          ImportUnresolved.make({ file: '/w/app/gone.ts', specifier: '@manna/x/missing' }),
        );
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            memoryFileSystem(
              new Map([
                [
                  '/w/app/a.ts',
                  text(
                    "import { Effect } from 'effect';\nimport { x } from '@manna/x';\nimport { t } from '@manna/x/tools';",
                  ),
                ],
                ['/w/app/gone.ts', text("import { m } from '@manna/x/missing';")],
                [
                  '/w/node_modules/@manna/x/package.json',
                  text('{"exports":{".":"./src/index.ts","./tools":"./src/tools/index.ts"}}'),
                ],
                ['/w/node_modules/@manna/x/src/index.ts', text('export const x = 1;')],
                ['/w/node_modules/@manna/x/src/tools/index.ts', text("export * from './t.ts';")],
                ['/w/node_modules/@manna/x/src/tools/t.ts', text('export const t = 1;')],
              ]),
            ),
            Path.layer,
          ),
        ),
      ),
  );

  it.effect('records each dynamic import whose specifier is not a string literal', () =>
    Effect.gen(function* () {
      const undeclared = (body: string) =>
        Effect.flip(declaredClosure(['/v/a.ts'], [])).pipe(
          Effect.provide(
            Layer.mergeAll(
              memoryFileSystem(
                new Map([
                  ['/v/a.ts', text(body)],
                  ['/v/l.ts', text('export {};')],
                ]),
              ),
              Path.layer,
            ),
          ),
        );
      expect(yield* undeclared("const l = import('./l');\nconst m = import(file);")).toEqual(
        UndeclaredImport.make({ file: '/v/a.ts', argument: 'file' }),
      );
      expect(yield* undeclared('const t = import(`./x.ts`);')).toEqual(
        UndeclaredImport.make({ file: '/v/a.ts', argument: '`./x.ts`' }),
      );
      // only one plain string literal is static: a concatenation or a cast names no file
      expect(yield* undeclared("const p = import('./parts/' + name + '.ts');")).toEqual(
        UndeclaredImport.make({ file: '/v/a.ts', argument: "'./parts/' + name + '.ts'" }),
      );
      expect(yield* undeclared("const b = import('./b.ts' as string);")).toEqual(
        UndeclaredImport.make({ file: '/v/a.ts', argument: "'./b.ts' as string" }),
      );
      // A method named import is no import.
      expect(yield* Effect.flip(undeclared("const l = import('./l');\nthis.import(y);"))).toEqual([
        '/v/a.ts',
        '/v/l.ts',
      ]);
    }),
  );

  it.effect('a closure with a variable import in an undeclared file fails', () =>
    Effect.gen(function* () {
      const declared = yield* declaredClosure(['/src/a.ts'], ['/src/b.ts']);
      expect(declared).toEqual([
        '/src/a.ts',
        '/src/b.ts',
        '/src/data.json',
        '/src/lib/c/index.ts',
        '/src/side.ts',
      ]);
      const undeclared = yield* Effect.flip(declaredClosure(['/src/a.ts'], []));
      expect(undeclared).toEqual(UndeclaredImport.make({ file: '/src/b.ts', argument: 'f' }));
    }).pipe(Effect.provide(Layer.mergeAll(memoryFileSystem(loader()), Path.layer))),
  );
});
