/* oxlint-disable effect/noNodeBuiltinImport -- the test reads the app's own source files, by path under Bun. */

/**
 * The data module never bundles the current app's 13 MB meaning table: no
 * module `app.ts` reaches by its relative imports imports
 * `@manna/hymnal-app/hymns/meaning`. About's `More like this` reads the
 * table the build writes (`nearest.ts`, `make.ts`) instead. The walker is
 * tried on the build's own module first, so one that finds nothing cannot
 * pass.
 */

import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const app = new URL('../../', import.meta.url).pathname;
const MEANING = '@manna/hymnal-app/hymns/meaning';
const SPECIFIER = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/gu;

/** The file a relative specifier names, none or one, if it is one of the app's sources. */
const filesOf = (from: string, specifier: string): Array<string> =>
  [specifier, `${specifier}.ts`, `${specifier}.d.ts`]
    .map((name) => resolve(dirname(from), name))
    .filter((path) => path.endsWith('.ts') && existsSync(path))
    .slice(0, 1);

/** The modules reached from `entry` by relative imports, and each of them that imports the meaning table. */
const walk = (entry: string) => {
  const seen = new Set<string>();
  const users: Array<string> = [];
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    const specifiers = [...readFileSync(file, 'utf8').matchAll(SPECIFIER)].map((m) => m[1] ?? '');
    if (specifiers.includes(MEANING)) users.push(file.slice(app.length));
    for (const specifier of specifiers.filter((s) => s.startsWith('.')))
      for (const next of filesOf(file, specifier)) visit(next);
  };
  visit(entry);
  return { reached: new Set([...seen].map((file) => file.slice(app.length))), users };
};

describe('the data module ships no meaning table', () => {
  it('finds the build-time module that does import it', () => {
    expect(walk(`${app}src/abouthymn/make.ts`).users).toEqual(['src/abouthymn/nearest.ts']);
  });

  it('no module app.ts reaches imports it, About among them', () => {
    const { reached, users } = walk(`${app}app.ts`);
    expect(reached.has('src/abouthymn/about.ts')).toBe(true);
    expect(users).toEqual([]);
  });
});
