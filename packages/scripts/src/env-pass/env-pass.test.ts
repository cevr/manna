import { describe, expect, it } from 'effect-bun-test';
import { Config, Effect, Match, Option } from 'effect';
import { gapsOf, splitReported } from './gaps.ts';
import { aliasesFor, isTestSupport, productOf, readsThrough, resolverOf } from './graph.ts';
import { preloadModules } from './preload.ts';
import { envReads, importsOf } from './reads.ts';
import { declaredFor, passes } from './turbo.ts';

/** A tsconfig as `aliasesFor` reads it. */
type Tsconfig = Parameters<typeof aliasesFor>[0] extends ReadonlyMap<string, infer T> ? T : never;

/** A call of `Config.<key>` with the variable `name` at its name's place, other arguments plain values. */
const configCall = (key: string, at: number, name: string) =>
  `Config.${key}(${[...Array.from({ length: at }, () => 'x'), `'${name}'`].join(', ')})`;

describe('env-pass', () => {
  it.effect('reads Config.Int and Config.Port, which the old reader missed', () =>
    Effect.sync(() => {
      expect(envReads('a.ts', "yield* Config.Int('HYMN_PROBE_SEED');")).toEqual([
        'HYMN_PROBE_SEED',
      ]);
      expect(envReads('a.ts', "yield* Config.Port('HYMN_PROBE_PORT');")).toEqual([
        'HYMN_PROBE_PORT',
      ]);
    }),
  );

  it.effect('reads every constructor the installed effect/Config exports that takes a name', () =>
    Effect.sync(() => {
      const named = Object.entries(Config).flatMap(([key, value]) => {
        const parameters = (/^[^(]*\(([^)]*)\)/.exec(String(value))?.[1] ?? '')
          .split(',')
          .map((parameter) => parameter.trim());
        const at = parameters.findIndex((parameter) =>
          ['name', 'path', 'pathOrOptions'].includes(parameter),
        );
        if (at < 0) return [];
        return [[key, at] as const];
      });
      expect(named.map(([key]) => key)).toEqual(
        expect.arrayContaining(['String', 'Int', 'Port', 'Literal', 'Record', 'schema']),
      );
      for (const [key, at] of named)
        expect(envReads('a.ts', configCall(key, at, `P_${key.toUpperCase()}`))).toEqual([
          `P_${key.toUpperCase()}`,
        ]);
      expect(envReads('a.ts', "Config.Literal('prod', 'STAGE')")).toEqual(['STAGE']);
      expect(envReads('a.ts', "Config.succeed('NOT_READ'); Config.nested(c, 'PREFIX')")).toEqual(
        [],
      );
    }),
  );

  it.effect(
    'reads process.env, Bun.env and import.meta.env, and no name in a string, a comment or set by the file',
    () =>
      Effect.sync(() => {
        const text = [
          "const a = process.env.A_ONE ?? '';",
          "const b = process.env['B_TWO'];",
          'const c = Bun.env.C_THREE;',
          'const d = import.meta.env.D_FOUR;',
          'const { E_FIVE, ...rest } = process.env;',
          "const f = Config.option(Config.String('F_SIX'));",
          "const g = 'process.env.G_IN_STRING';",
          '// process.env.H_IN_COMMENT',
          'const i = process.env[name];',
          "const saved = process.env['J_OWN']; process.env['J_OWN'] = 'x';",
          'delete process.env.K_GONE; const k = process.env.K_GONE;',
        ].join('\n');
        expect(envReads('a.ts', text)).toEqual([
          'A_ONE',
          'B_TWO',
          'C_THREE',
          'D_FOUR',
          'E_FIVE',
          'F_SIX',
        ]);
      }),
  );

  it.effect(
    "hands a task turbo's own variables, its workspace's list or the root's, and the globals",
    () =>
      Effect.sync(() => {
        const root = {
          globalPassThroughEnv: ['G_ALL'],
          tasks: { 'test:slow': { passThroughEnv: ['ROOT_ONE'] } },
        };
        const own = Option.some({
          tasks: { 'test:slow': { env: ['$TURBO_EXTENDS$', 'WS_*', '!WS_NOT'] } },
        });
        const merged = declaredFor(root, own, 'test:slow');
        expect(
          ['ROOT_ONE', 'WS_SEED', 'G_ALL', 'HOME', 'PATH'].every((name) => passes(merged, name)),
        ).toBe(true);
        expect(['WS_NOT', 'TMPDIR', 'OTHER'].some((name) => passes(merged, name))).toBe(false);
        const replaced = declaredFor(
          root,
          Option.some({ tasks: { 'test:slow': { passThroughEnv: ['X'] } } }),
          'test:slow',
        );
        expect(passes(replaced, 'ROOT_ONE')).toBe(false);
        expect(passes(declaredFor(root, Option.none(), 'test:slow'), 'ROOT_ONE')).toBe(true);
      }),
  );

  it.effect('names each task that runs a test and is not handed a variable it reads', () =>
    Effect.sync(() => {
      const root = { tasks: { test: {}, 'test:slow': {} } };
      const turbos = new Map([
        ['packages/a', { tasks: { 'test:slow': { passThroughEnv: ['SEED'] } } }],
      ]);
      expect(
        gapsOf(root, turbos, [
          {
            file: 'packages/a/x.test.ts',
            dir: 'packages/a',
            tasks: ['test', 'test:slow'],
            reads: new Map([
              ['HOME', 'packages/a/x.test.ts'],
              ['SEED', 'packages/a/x.test.ts'],
            ]),
          },
        ]),
      ).toEqual([
        {
          dir: 'packages/a',
          task: 'test',
          file: 'packages/a/x.test.ts',
          name: 'SEED',
          by: 'packages/a/x.test.ts',
        },
      ]);
    }),
  );

  it.effect('takes the modules a module loads, and no type-only import', () =>
    Effect.sync(() => {
      const text = [
        "import { a, type B } from './a.ts';",
        "import type { C } from './c.ts';",
        "import './side.ts';",
        "import D, {\n  e,\n} from '@manna/core/search';",
        "export * from './all.js';",
        "export { f } from '../f';",
        "export type { G } from './g.ts';",
        "const h = await import('./h.tsx');",
      ].join('\n');
      expect(importsOf(text)).toEqual([
        './a.ts',
        './side.ts',
        '@manna/core/search',
        './all.js',
        '../f',
        './h.tsx',
      ]);
    }),
  );

  it.effect(
    "resolves an import as bun does: relative, the nearest tsconfig's paths, a workspace package's export",
    () =>
      Effect.sync(() => {
        const resolve = resolverOf({
          files: new Set([
            'packages/a/src/x.test.ts',
            'packages/a/src/rig.ts',
            'packages/a/src/view.tsx',
            'packages/a/src/lib/index.ts',
            'packages/a/src/data.json',
            'packages/core/src/search/index.ts',
            'packages/core/src/search/embedder-bun.ts',
            'packages/core/src/part/one.ts',
            'packages/b/src/x.ts',
            'apps/h/src/reader/seek.test.tsx',
            'apps/h/src/test/seek-page.ts',
          ]),
          packages: [
            {
              name: '@manna/core',
              dir: 'packages/core',
              exports: {
                './search': './src/search/index.ts',
                './search/bun': './src/search/embedder-bun.ts',
                './part/*': './src/part/*.ts',
              },
            },
            { name: '@manna/b', dir: 'packages/b', exports: {} },
          ],
          aliasesFor: aliasesFor(
            new Map<string, Tsconfig>([
              [
                'tsconfig.json',
                { compilerOptions: { paths: { '@manna/core/*': ['./packages/core/src/*'] } } },
              ],
              ['packages/a/tsconfig.json', { extends: '../../tsconfig.json' }],
              [
                'apps/h/tsconfig.json',
                {
                  extends: '../../tsconfig.json',
                  compilerOptions: { paths: { '~/*': ['./src/*'] } },
                },
              ],
            ]),
          ),
          installed: (_from, name) => name === 'effect',
          builtins: new Set(['fs']),
        });
        const from = 'packages/a/src/x.test.ts';
        const named = (at: string, specifier: string) =>
          Match.value(resolve(at, specifier)).pipe(
            Match.tag('Module', ({ file }) => file),
            Match.orElse(({ _tag }) => _tag),
          );
        expect(
          [
            './rig.js',
            './rig',
            './view.js',
            './lib',
            './data.json',
            '@manna/core/search',
            '@manna/core/search/bun',
            '@manna/core/part/one',
            '@manna/b/src/x',
            'effect',
            'effect/Schema',
            'fs',
            'node:fs',
            'bun:test',
            './missing',
            '../../../../out',
            '@manna/core/nothing',
            'not-installed',
            '~/test/seek-page',
          ].map((specifier) => named(from, specifier)),
        ).toEqual([
          'packages/a/src/rig.ts',
          'packages/a/src/rig.ts',
          'packages/a/src/view.tsx',
          'packages/a/src/lib/index.ts',
          'Other',
          'packages/core/src/search/index.ts',
          'packages/core/src/search/embedder-bun.ts',
          'packages/core/src/part/one.ts',
          'packages/b/src/x.ts',
          'Other',
          'Other',
          'Other',
          'Other',
          'Other',
          'Unresolved',
          'Unresolved',
          'Unresolved',
          'Unresolved',
          'Unresolved',
        ]);
        expect(
          ['~/test/seek-page', '~/test/missing'].map((specifier) =>
            named('apps/h/src/reader/seek.test.tsx', specifier),
          ),
        ).toEqual(['apps/h/src/test/seek-page.ts', 'Unresolved']);
      }),
  );

  it.effect(
    'a data file a tool writes resolves by its declaration beside it, and is unresolved without one',
    () =>
      Effect.sync(() => {
        const resolve = resolverOf({
          files: new Set(['apps/h/app.ts', 'apps/h/src/passage/today.d.json.ts']),
          packages: [],
          aliasesFor: aliasesFor(new Map()),
          installed: () => false,
          builtins: new Set(),
        });
        expect(
          ['./src/passage/today.json', './src/passage/other.json', './src/passage/today'].map(
            (specifier) => resolve('apps/h/app.ts', specifier)._tag,
          ),
        ).toEqual(['Other', 'Unresolved', 'Unresolved']);
      }),
  );

  it.effect(
    'a test that imports a helper reading a variable turbo does not pass is a gap; the product’s own settings are not',
    () =>
      Effect.sync(() => {
        const graph = new Map([
          [
            'a/x.test.ts',
            { reads: [], deps: ['a/walk.ts', 'a/service.ts', 'a/cli.ts'], entry: false },
          ],
          ['a/walk.ts', { reads: ['WALK_SEED'], deps: ['a/test/rig.ts'], entry: false }],
          ['a/test/rig.ts', { reads: ['RIG_DUMP'], deps: [], entry: false }],
          ['a/service.ts', { reads: ['API_KEY'], deps: [], entry: false }],
          ['a/main.ts', { reads: [], deps: ['a/service.ts'], entry: false }],
          ['a/cli.ts', { reads: ['ADMIN_TOKEN'], deps: ['a/test/rig.ts'], entry: true }],
        ]);
        const product = productOf(
          graph,
          (file) => file.endsWith('.test.ts') || isTestSupport(file),
        );
        expect([...product].toSorted()).toEqual(['a/cli.ts', 'a/main.ts', 'a/service.ts']);
        const reads = readsThrough('a/x.test.ts', graph, product);
        expect([...reads]).toEqual([
          ['WALK_SEED', 'a/walk.ts'],
          ['RIG_DUMP', 'a/test/rig.ts'],
        ]);
        expect(
          gapsOf({ tasks: { test: { env: ['RIG_DUMP'] } } }, new Map(), [
            { file: 'a/x.test.ts', dir: 'a', tasks: ['test'], reads },
          ]),
        ).toEqual([
          { dir: 'a', task: 'test', file: 'a/x.test.ts', name: 'WALK_SEED', by: 'a/walk.ts' },
        ]);
      }),
  );

  it.effect(
    "a rig a test imports through its tsconfig's paths alias is a gap when it reads a variable turbo does not pass",
    () =>
      Effect.sync(() => {
        const resolve = resolverOf({
          files: new Set(['h/src/r.test.tsx', 'h/src/test/rig.ts']),
          packages: [],
          aliasesFor: aliasesFor(
            new Map([['h/tsconfig.json', { compilerOptions: { paths: { '~/*': ['./src/*'] } } }]]),
          ),
          installed: () => false,
          builtins: new Set(),
        });
        const imports = new Map([
          ['h/src/r.test.tsx', ['~/test/rig']],
          ['h/src/test/rig.ts', []],
        ]);
        const readsIn = new Map([['h/src/test/rig.ts', ['RIG_SEED']]]);
        const graph = new Map(
          [...imports].map(([file, specifiers]) => [
            file,
            {
              reads: readsIn.get(file) ?? [],
              entry: false,
              deps: specifiers.flatMap((specifier) =>
                Match.value(resolve(file, specifier)).pipe(
                  Match.tag('Module', ({ file: dep }) => [dep]),
                  Match.orElse(() => []),
                ),
              ),
            },
          ]),
        );
        const product = productOf(
          graph,
          (file) => file.endsWith('.test.tsx') || isTestSupport(file),
        );
        expect(
          gapsOf({ tasks: { test: {} } }, new Map(), [
            {
              file: 'h/src/r.test.tsx',
              dir: 'h',
              tasks: ['test'],
              reads: readsThrough('h/src/r.test.tsx', graph, product),
            },
          ]),
        ).toEqual([
          {
            dir: 'h',
            task: 'test',
            file: 'h/src/r.test.tsx',
            name: 'RIG_SEED',
            by: 'h/src/test/rig.ts',
          },
        ]);
      }),
  );

  it.effect(
    "takes the paths of the tsconfig a tsconfig extends, from that one's folder, transitively, until one sets its own",
    () =>
      Effect.sync(() => {
        const aliases = aliasesFor(
          new Map<string, Tsconfig>([
            [
              'config/tsconfig.base.json',
              {
                compilerOptions: {
                  baseUrl: '..',
                  paths: { '#shared/*': ['packages/shared/src/*'] },
                },
              },
            ],
            ['tsconfig.json', { extends: './config/tsconfig.base.json' }],
            ['packages/a/tsconfig.json', { extends: '../../tsconfig.json' }],
            [
              'apps/h/tsconfig.json',
              {
                extends: '../../tsconfig.json',
                compilerOptions: { paths: { '~/*': ['./src/*'] } },
              },
            ],
            ['apps/loop/tsconfig.json', { extends: './tsconfig.json' }],
          ]),
        );
        expect(Option.getOrUndefined(aliases('packages/a/src/x.ts'))).toEqual({
          base: '',
          paths: { '#shared/*': ['packages/shared/src/*'] },
        });
        expect(Option.getOrUndefined(aliases('apps/h/src/x.ts'))).toEqual({
          base: 'apps/h',
          paths: { '~/*': ['./src/*'] },
        });
        expect(Option.isNone(aliases('apps/loop/src/x.ts'))).toBe(true);
        const resolve = resolverOf({
          files: new Set(['packages/shared/src/util.ts', 'apps/h/src/util.ts']),
          packages: [],
          aliasesFor: aliases,
          installed: () => false,
          builtins: new Set(),
        });
        expect(
          [
            ['packages/a/src/x.ts', '#shared/util'],
            ['apps/h/src/x.ts', '#shared/util'],
            ['apps/h/src/x.ts', '~/util'],
          ].map(([from = '', specifier = '']) =>
            Match.value(resolve(from, specifier)).pipe(
              Match.tag('Module', ({ file }) => file),
              Match.orElse(({ _tag }) => _tag),
            ),
          ),
        ).toEqual(['packages/shared/src/util.ts', 'Unresolved', 'apps/h/src/util.ts']);
      }),
  );

  it.effect(
    'a module a task preloads is an entry of that task: a variable it reads that turbo does not pass is a gap',
    () =>
      Effect.sync(() => {
        const workspace = {
          dir: 'a',
          scripts: {
            test: "bun test --no-isolate --parallel=3 --preload ./src/test/setup.ts --path-ignore-patterns='**/*.slow.test.*' ./src/x.test.ts",
            'test:slow': 'bun run test:slow:one && bun ./tool.ts --preload ./src/not.ts',
            'test:slow:one': 'bun -r=src/boot.ts test ./src/x.slow.test.ts',
            'test:e2e': 'bun run-suite.ts --preload ./src/suite.ts e2e',
          },
          bunfig: 'preload = ["./src/all.ts"]\n[test]\npreload = "./src/env.ts"\n',
          wrappers: ['run-suite.ts'],
          runs: new Map([
            ['test', ['test']],
            ['test:slow', ['test:slow']],
            ['test:e2e', ['test:e2e']],
          ]),
        };
        const resolve = resolverOf({
          files: new Set([
            'a/src/x.test.ts',
            'a/src/not.ts',
            'a/src/all.ts',
            'a/src/test/setup.ts',
            'a/src/test/clock.ts',
            'a/src/boot.ts',
            'a/src/env.ts',
          ]),
          packages: [],
          aliasesFor: () => Option.none(),
          installed: () => false,
          builtins: new Set(),
        });
        const { modules, unresolved } = preloadModules([workspace], resolve);
        expect(Object.fromEntries(modules)).toEqual({
          'a/src/all.ts': { dir: 'a', tasks: ['test', 'test:slow', 'test:e2e'] },
          'a/src/env.ts': { dir: 'a', tasks: ['test', 'test:slow', 'test:e2e'] },
          'a/src/test/setup.ts': { dir: 'a', tasks: ['test'] },
          'a/src/boot.ts': { dir: 'a', tasks: ['test:slow'] },
        });
        expect(unresolved).toEqual([{ dir: 'a', task: 'test:e2e', specifier: './src/suite.ts' }]);
        const graph = new Map([
          ['a/src/x.test.ts', { reads: [], deps: [], entry: false }],
          ['a/src/test/setup.ts', { reads: [], deps: ['a/src/test/clock.ts'], entry: false }],
          ['a/src/test/clock.ts', { reads: ['CLOCK_ZONE'], deps: [], entry: false }],
          ['a/src/boot.ts', { reads: ['BOOT_SEED'], deps: [], entry: false }],
          ['a/src/env.ts', { reads: ['ENV_SEED'], deps: [], entry: false }],
        ]);
        const ofTests = (file: string) => file.endsWith('.test.ts') || isTestSupport(file);
        expect(productOf(graph, ofTests).has('a/src/boot.ts')).toBe(true);
        const product = productOf(graph, (file) => ofTests(file) || modules.has(file));
        expect(
          gapsOf(
            { tasks: { test: { env: ['ENV_SEED'] }, 'test:slow': { env: ['ENV_SEED'] } } },
            new Map(),
            [...modules].map(([file, { dir, tasks }]) => ({
              file,
              dir,
              tasks,
              reads: readsThrough(file, graph, product),
            })),
          ),
        ).toEqual([
          {
            dir: 'a',
            task: 'test:e2e',
            file: 'a/src/env.ts',
            name: 'ENV_SEED',
            by: 'a/src/env.ts',
          },
          {
            dir: 'a',
            task: 'test',
            file: 'a/src/test/setup.ts',
            name: 'CLOCK_ZONE',
            by: 'a/src/test/clock.ts',
          },
          {
            dir: 'a',
            task: 'test:slow',
            file: 'a/src/boot.ts',
            name: 'BOOT_SEED',
            by: 'a/src/boot.ts',
          },
        ]);
      }),
  );

  it.effect('reports a known gap, and names a known one that is no gap any more', () =>
    Effect.sync(() => {
      const gap = {
        dir: 'f',
        task: 'test:slow',
        file: 'f/a.test.ts',
        name: 'X',
        by: 'f/a.test.ts',
      };
      const split = splitReported(
        [gap, { ...gap, name: 'Y' }],
        [
          { dir: 'f', task: 'test:slow', name: 'X' },
          { dir: 'f', task: 'test:slow', name: 'GONE' },
        ],
      );
      expect(split.open.map(({ name }) => name)).toEqual(['Y']);
      expect(split.reported.map(({ name }) => name)).toEqual(['X']);
      expect(split.stale.map(({ name }) => name)).toEqual(['GONE']);
    }),
  );
});
