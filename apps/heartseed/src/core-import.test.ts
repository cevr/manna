/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport -- the test reads the app's own source files from disk, synchronously, outside any Effect. */

/**
 * The app reads `@manna/core` through `@manna/core/bible` only, and names
 * no core asset (`src/test/core-reads.ts` says why, and how a source is
 * read). `core-import.property.test.ts` holds the reader over generated
 * spellings of every module name.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import { coreReads } from './test/core-reads';

/** The source files the app may hold, TypeScript and JavaScript both. */
const SOURCES = new Bun.Glob('{src,app}/**/*.{ts,tsx,js,jsx,mjs}');

const ROOT = `${import.meta.dir}/..`;
/** The guard's own files, which name core modules and assets as data. */
const GUARD = new Set([
  `src/${import.meta.file}`,
  'src/core-import.property.test.ts',
  'src/test/core-reads.ts',
]);
/** The route types One writes (git-ignored) from the routes under `app`: no task hashes them, so the scan leaves them out. */
const GENERATED = 'app/routes.d.ts';

describe('the app’s reads of @manna/core', () => {
  it('imports @manna/core/bible only, and names no core asset, in src and app', () => {
    const files = [...SOURCES.scanSync(ROOT)].filter(
      (file) => !GUARD.has(file) && file !== GENERATED,
    );
    expect(files).toEqual(expect.arrayContaining(['app/index.tsx', 'src/display.ts']));
    const found = files.flatMap((file) =>
      coreReads(file, readFileSync(`${ROOT}/${file}`, 'utf8')).map(
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
      "const note = '@manna/core/hymnal'; // '@manna/core'",
      "type Hymnal = typeof import('@manna/core/\\x68ymnal');",
    ].join('\n');
    expect(coreReads('src/a.ts', source)).toEqual([
      { line: 2, name: '@manna/core/hymnal' },
      { line: 3, name: '@manna/core' },
      { line: 4, name: '@manna/core/bible/service' },
      { line: 5, name: '@manna/core/assets/kjv.json' },
      { line: 6, name: '@manna/core/assets/kjv.json' },
      { line: 7, name: '@manna/core/hymnal/store' },
      { line: 9, name: '@manna/core/hymnal' },
    ]);
  });

  it('reads JSX in a .tsx file, and names a source that does not parse rather than passing it', () => {
    expect(
      coreReads(
        'app/a.tsx',
        "import { A } from '@manna/core/hymnal';\nexport const B = () => <A />;",
      ),
    ).toEqual([{ line: 1, name: '@manna/core/hymnal' }]);
    expect(
      coreReads('src/a.ts', 'import a from `@manna/core/hymnal`;').map(({ name }) =>
        name.startsWith('does not parse: '),
      ),
    ).toEqual([true]);
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
