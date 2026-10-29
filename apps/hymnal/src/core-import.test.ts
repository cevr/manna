/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport -- the test reads the app's own source files from disk, synchronously, outside any Effect. */

/**
 * The app reads `@manna/core` through `@manna/core/bible` only: the Bible
 * canon and its reference parser, which import `effect` alone. Any other
 * core module would bring Bun-only code into the phone's bundle.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

/** A module name `@manna/core` or below it, in an import, export, `import()` or `require()`. */
const CORE_IMPORT =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"](@manna\/core(?:\/[^'"]*)?)['"]/g;

const ALLOWED = '@manna/core/bible';

/** Each `@manna/core` module `source` imports other than `@manna/core/bible`, by its line. */
const coreImports = (source: string) =>
  [...source.matchAll(CORE_IMPORT)]
    .filter((match) => match[1] !== ALLOWED)
    .map((match) => ({ line: source.slice(0, match.index).split('\n').length, name: match[1] }));

/** The source files the app may hold, TypeScript and JavaScript both. */
const SOURCES = new Bun.Glob('{src,app}/**/*.{ts,tsx,js,jsx,mjs}');

const ROOT = `${import.meta.dir}/..`;
const SELF = `src/${import.meta.file}`;

describe('the app’s imports of @manna/core', () => {
  it('reads @manna/core/bible only, in src and app, in TypeScript and JavaScript', () => {
    const files = [...SOURCES.scanSync(ROOT)];
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
      "const store = require('@manna/core/hymnal/store');",
    ].join('\n');
    expect(coreImports(source)).toEqual([
      { line: 2, name: '@manna/core/hymnal' },
      { line: 3, name: '@manna/core' },
      { line: 4, name: '@manna/core/bible/service' },
      { line: 5, name: '@manna/core/sqlite' },
      { line: 6, name: '@manna/core/hymnal/store' },
    ]);
  });

  it('scans JavaScript files as well as TypeScript, in src and app', () => {
    const paths = [
      'src/a.ts',
      'src/a.tsx',
      'app/a.js',
      'app/a.jsx',
      'src/a/b.mjs',
      'test/a.ts',
      'src/a.json',
    ];
    expect(paths.filter((path) => SOURCES.match(path))).toEqual(paths.slice(0, 5));
  });
});
