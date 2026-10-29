/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport -- the test reads the app's own source files from disk, synchronously, outside any Effect. */

/**
 * The app reads `@manna/core` through `@manna/core/bible` only: the Bible
 * canon and its reference parser, which import `effect` alone. Any other
 * core module would bring Bun-only code into the phone's bundle.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

/** A module name `@manna/core` or below it, in an import, export or `import()`. */
const CORE_IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"](@manna\/core(?:\/[^'"]*)?)['"]/g;

const ALLOWED = '@manna/core/bible';

/** Each `@manna/core` module `source` imports other than `@manna/core/bible`, by its line. */
const coreImports = (source: string) =>
  [...source.matchAll(CORE_IMPORT)]
    .filter((match) => match[1] !== ALLOWED)
    .map((match) => ({ line: source.slice(0, match.index).split('\n').length, name: match[1] }));

const ROOT = `${import.meta.dir}/..`;
const SELF = `src/${import.meta.file}`;

describe('the app’s imports of @manna/core', () => {
  it('reads @manna/core/bible only, in src and app', () => {
    const files = ['src', 'app'].flatMap((folder) => [
      ...new Bun.Glob(`${folder}/**/*.{ts,tsx}`).scanSync(ROOT),
    ]);
    // This file names the modules it refuses, in its own cases.
    const scanned = files.filter((file) => file !== SELF);
    expect(files.length).toBeGreaterThan(100);
    const found = scanned.flatMap((file) =>
      coreImports(readFileSync(`${ROOT}/${file}`, 'utf8')).map(
        (at) => `${file}:${at.line} ${at.name}`,
      ),
    );
    expect(found).toEqual([]);
  });

  it('finds every other core module, imported, exported or loaded', () => {
    const source = [
      "import { parseBibleQuery } from '@manna/core/bible';",
      "import { HymnalService } from '@manna/core/hymnal';",
      "export * from '@manna/core';",
      "const db = await import('@manna/core/bible/service');",
      "import '@manna/core/sqlite';",
    ].join('\n');
    expect(coreImports(source)).toEqual([
      { line: 2, name: '@manna/core/hymnal' },
      { line: 3, name: '@manna/core' },
      { line: 4, name: '@manna/core/bible/service' },
      { line: 5, name: '@manna/core/sqlite' },
    ]);
  });
});
