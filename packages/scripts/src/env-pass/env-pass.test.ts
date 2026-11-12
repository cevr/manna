import { describe, expect, it } from 'effect-bun-test';
import { Config, Effect, Option } from 'effect';
import { gapsOf } from './gaps.ts';
import { CONFIG_NAME_AT, envReads } from './reads.ts';
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
      const named = Object.entries(Config).filter(([, value]) =>
        /^[^(]*\([^)]*\b(?:name|path|pathOrOptions)\b/.test(String(value)),
      );
      expect(named.map(([key]) => key)).toEqual(
        expect.arrayContaining(['String', 'Int', 'Port', 'Literal', 'Record', 'schema']),
      );
      expect(Object.keys(CONFIG_NAME_AT).toSorted()).toEqual(named.map(([key]) => key).toSorted());
      for (const [key, at] of Object.entries(CONFIG_NAME_AT))
        expect(envReads('a.ts', configCall(key, at, `P_${key.toUpperCase()}`))).toEqual([
          `P_${key.toUpperCase()}`,
        ]);
      expect(envReads('a.ts', "Config.Literal('prod', 'STAGE')")).toEqual(['STAGE']);
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
            reads: ['HOME', 'SEED'],
          },
        ]),
      ).toEqual([{ dir: 'packages/a', task: 'test', file: 'packages/a/x.test.ts', name: 'SEED' }]);
    }),
  );
});
