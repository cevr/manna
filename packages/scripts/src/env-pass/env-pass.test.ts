import { describe, expect, it } from 'effect-bun-test';
import { Config, Effect, Option } from 'effect';
import { gapsOf, splitReported } from './gaps.ts';
import { isTestSupport, productOf, readsThrough, resolverOf } from './graph.ts';
import { envReads, importsOf } from './reads.ts';
import { declaredFor, passes } from './turbo.ts';

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

  it.effect("resolves a relative import and a workspace package's export to the repo's file", () =>
    Effect.sync(() => {
      const resolve = resolverOf(
        new Set([
          'packages/a/src/x.test.ts',
          'packages/a/src/rig.ts',
          'packages/a/src/lib/index.ts',
          'packages/core/src/search/index.ts',
          'packages/core/src/part/one.ts',
          'packages/b/src/x.ts',
        ]),
        [
          {
            name: '@manna/core',
            dir: 'packages/core',
            exports: {
              './search': './src/search/index.ts',
              './part/*': './src/part/*.ts',
            },
          },
          { name: '@manna/b', dir: 'packages/b', exports: {} },
        ],
      );
      const from = 'packages/a/src/x.test.ts';
      expect(
        [
          './rig.js',
          './rig',
          './lib',
          '@manna/core/search',
          '@manna/core/part/one',
          '@manna/b/src/x',
        ]
          .map((specifier) => resolve(from, specifier))
          .map(Option.getOrElse(() => 'none')),
      ).toEqual([
        'packages/a/src/rig.ts',
        'packages/a/src/rig.ts',
        'packages/a/src/lib/index.ts',
        'packages/core/src/search/index.ts',
        'packages/core/src/part/one.ts',
        'packages/b/src/x.ts',
      ]);
      expect(
        ['effect', 'node:fs', './missing', '../../../../out'].map((specifier) =>
          Option.isNone(resolve(from, specifier)),
        ),
      ).toEqual([true, true, true, true]);
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
          ['a/cli.ts', { reads: ['ADMIN_TOKEN'], deps: [], entry: true }],
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
