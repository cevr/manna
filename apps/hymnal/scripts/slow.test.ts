/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals -- the guard reads the app's package.json and lists its slow files from disk, synchronously, at the file's top. */

import { describe, expect, it } from 'bun:test';
import { Effect } from 'effect';
import { it as test } from 'effect-bun-test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { runAll, scriptsOf, summaryOf } from './slow.ts';

const app = join(import.meta.dir, '..');
const scripts: Record<string, string> = JSON.parse(
  readFileSync(join(app, 'package.json'), 'utf8'),
).scripts;

const slowFiles = [
  ...new Bun.Glob('{src,infra,scripts}/**/*.slow.test.{ts,tsx}').scanSync({ cwd: app }),
].map((file) => `./${file}`);

const groups = scriptsOf(scripts, ['test:slow:']);

const named = groups.flatMap(
  (name) => (scripts[name] ?? '').match(/\.\/[\w./-]+\.slow\.test\.tsx?\b/g) ?? [],
);

const fake = (codes: Record<string, number>) => {
  const seen: Array<string> = [];
  const run = (script: string) =>
    Effect.sync(() => {
      seen.push(script);
      return codes[script] ?? 0;
    });
  return { seen, run };
};

/** The runner run as `test:slow` runs it, over `names`: its exit code and its closing line. */
const cli = (names: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const run = Bun.spawn(['bun', join(import.meta.dir, 'slow.ts'), ...names], {
      cwd: app,
      stdout: 'pipe',
      stderr: 'ignore',
      timeout: 4_000,
      killSignal: 'SIGKILL',
    });
    const [code, out] = yield* Effect.all(
      [Effect.promise(() => run.exited), Effect.promise(() => new Response(run.stdout).text())],
      { concurrency: 2 },
    );
    return { code, last: out.trim().split('\n').at(-1) };
  });

describe('the slow tests’ runner, run as a command', () => {
  test.effect('exits 1 when a script it runs fails, and 0 when none did', () =>
    Effect.map(
      Effect.all([cli(['test:no-such-script']), cli([])], { concurrency: 2 }),
      ([failing, passing]) => {
        expect(failing).toEqual({ code: 1, last: '  exit 1: bun run test:no-such-script' });
        expect(passing).toEqual({ code: 0, last: 'slow: all 0 scripts passed' });
      },
    ),
  );
});

describe('the slow tests’ runner', () => {
  it('runs every script after one that fails, and names each failed one', () => {
    const { seen, run } = fake({ a: 1, c: 2 });
    const ran = Effect.runSync(runAll(['a', 'b', 'c'], run));
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(summaryOf(ran).split('\n')).toEqual([
      'slow: 2 of 3 scripts failed',
      '  exit 1: bun run a',
      '  exit 2: bun run c',
    ]);
  });

  it('says all passed when none failed', () => {
    const { run } = fake({});
    expect(summaryOf(Effect.runSync(runAll(['a'], run)))).toBe('slow: all 1 scripts passed');
  });

  it('takes a name that ends in : for every script under it, in order', () => {
    expect(scriptsOf({ 'x:a': '', y: '', 'x:b': '', 'xa:c': '' }, ['x:', 'y', 'z'])).toEqual([
      'x:a',
      'x:b',
      'y',
      'z',
    ]);
  });

  it('runs test:slow and test:offline, with no && chain left to stop at a failure', () => {
    expect(scripts['test:slow']).toBe('bun scripts/slow.ts test:slow: test:browser');
    expect(scripts['test:offline']).toBe('bun scripts/slow.ts test:slow:offline test:slow:http');
    expect(groups.filter((name) => (scripts[name] ?? '').includes('&&'))).toEqual([]);
  });

  it('names every slow file under src, infra and scripts in one test:slow: script', () => {
    expect(slowFiles.length).toBeGreaterThanOrEqual(40);
    expect(named.toSorted()).toEqual(slowFiles.toSorted());
  });
});
