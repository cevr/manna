/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport -- the test reads the app's own source files from disk, synchronously, outside any Effect. */

/**
 * The app reads `@manna/core` through `@manna/core/bible` only: the Bible
 * canon and its reference parser, which import `effect` alone. Any other
 * core module would bring Bun-only code into the phone's bundle, and the
 * corpus (`@manna/core/assets/*`, the 7.8 MB KJV) is read only when the app
 * is bundled, by `vite/passage.ts`.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

/** A module name `@manna/core` or below it, in an import, export, `import()` or `require()`. */
const CORE_IMPORT =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"](@manna\/core(?:\/[^'"]*)?)['"]/gu;

const ALLOWED = '@manna/core/bible';

/** Each `@manna/core` module `source` imports other than `@manna/core/bible`, and each naming of a core asset, by its line. */
const coreReads = (source: string) =>
  [
    ...[...source.matchAll(CORE_IMPORT)]
      .filter((match) => match[1] !== ALLOWED)
      .map((match) => ({ index: match.index, name: match[1] })),
    ...[...source.matchAll(/@manna\/core\/assets\/[^'"`\s]*/gu)].map((match) => ({
      index: match.index,
      name: match[0],
    })),
  ]
    .map(({ index, name }) => ({ line: source.slice(0, index).split('\n').length, name }))
    .toSorted((a, b) => a.line - b.line);

/** The source files the app may hold, TypeScript and JavaScript both. */
const SOURCES = new Bun.Glob('{src,app}/**/*.{ts,tsx,js,jsx,mjs}');

const ROOT = `${import.meta.dir}/..`;
const SELF = `src/${import.meta.file}`;
/** The route types One writes (git-ignored) from the routes under `app`: no task hashes them, so the scan leaves them out. */
const GENERATED = 'app/routes.d.ts';

describe('the app’s reads of @manna/core', () => {
  it('imports @manna/core/bible only, and names no core asset, in src and app', () => {
    const files = [...SOURCES.scanSync(ROOT)].filter((file) => file !== SELF && file !== GENERATED);
    expect(files).toEqual(expect.arrayContaining(['app/index.tsx', 'src/display.ts']));
    const found = files.flatMap((file) =>
      coreReads(readFileSync(`${ROOT}/${file}`, 'utf8')).map(
        (at) => `${file}:${at.line} ${at.name}`,
      ),
    );
    expect(found).toEqual([]);
  });

  it('finds every other core module and every asset, imported, exported, loaded or resolved', () => {
    const source = [
      "import { parseBibleQuery } from '@manna/core/bible';",
      "import { HymnalService } from '@manna/core/hymnal';",
      "export * from '@manna/core';",
      "const db = await import('@manna/core/bible/service');",
      "import kjv from '@manna/core/assets/kjv.json';",
      "const file = Bun.resolveSync('@manna/core/assets/kjv.json', dir);",
      "const store = require('@manna/core/hymnal/store');",
    ].join('\n');
    expect(coreReads(source)).toEqual([
      { line: 2, name: '@manna/core/hymnal' },
      { line: 3, name: '@manna/core' },
      { line: 4, name: '@manna/core/bible/service' },
      { line: 5, name: '@manna/core/assets/kjv.json' },
      { line: 5, name: '@manna/core/assets/kjv.json' },
      { line: 6, name: '@manna/core/assets/kjv.json' },
      { line: 7, name: '@manna/core/hymnal/store' },
    ]);
  });

  it('scans JavaScript files as well as TypeScript, in src and app', () => {
    const paths = [
      'src/a.ts',
      'src/a.tsx',
      'app/a.js',
      'app/a.jsx',
      'src/a/b.mjs',
      'vite/a.ts',
      'src/a.json',
    ];
    expect(paths.filter((path) => SOURCES.match(path))).toEqual(paths.slice(0, 5));
  });
});
