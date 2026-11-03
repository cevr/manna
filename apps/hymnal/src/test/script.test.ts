/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals -- the guard reads the app's package.json and the slow test files from disk, synchronously, at the file's top. */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every file `test:slow` runs spawns a `bun` script only through `runScript`
 * (`./script.ts`), which ends it at a limit. A bare synchronous spawn blocks
 * the event loop, so no case's timeout ends a script that hangs, and the run
 * waits on it for good. An asynchronous `Bun.spawn` stays under its case's
 * timeout, so it is not read here.
 */
const app = join(import.meta.dir, '../..');
const scripts: Record<string, string> = JSON.parse(
  readFileSync(join(app, 'package.json'), 'utf8'),
).scripts;
const listed =
  `${scripts['test:slow']} ${scripts['test:offline']}`.match(/\.\/[\w./-]+\.tsx?\b/g) ?? [];
const browser = [...new Bun.Glob('test/browser/**/*.{ts,tsx}').scanSync({ cwd: app })].map(
  (file) => `./${file}`,
);
const files = [...new Set([...listed, ...browser])];

const bareSpawn = /Bun\.spawnSync\(\s*\[\s*['"`]bun['"`]/;

describe('the slow tests’ scripts', () => {
  it('are read from test:slow, test:offline and test/browser', () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
    expect(files).toContain('./src/reader/HymnList.native.slow.test.ts');
  });

  it('a bare synchronous spawn of bun is seen, over lines', () => {
    expect(bareSpawn.test("Bun.spawnSync(\n  ['bun', script],")).toBe(true);
    expect(bareSpawn.test("Bun.spawn(['bun', script])")).toBe(false);
  });

  it('every file test:slow runs spawns bun only through runScript, never with a bare Bun.spawnSync', () => {
    const bare = files.filter((file) => bareSpawn.test(readFileSync(join(app, file), 'utf8')));
    expect(bare).toEqual([]);
  });
});
