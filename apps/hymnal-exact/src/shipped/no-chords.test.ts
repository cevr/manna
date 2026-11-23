/**
 * The data module never bundles the hymns' chords: no module `app.ts`
 * reaches, by any import a bundler keeps, is the current app's chords
 * reader (`apps/hymnal/vite/chords.ts`, which `src/hymns/make.ts` runs at
 * build) or the writer of the shipped files (`files.ts`, `write.ts`), and no
 * specifier it leaves unresolved is a generated chords module; the data
 * module reaches the loader (`src/chords/load.ts`) and the first-use gate
 * (`src/chords/first-use.ts`) and reads each hymn's file at its first use.
 * The walker is tried on the build script first, so one that finds nothing
 * cannot pass.
 */

import { describe, expect, it } from 'bun:test';

import { reachedFrom } from '../test/graph.testing.ts';

const READER = 'apps/hymnal/vite/chords.ts';
const WRITERS = [
  'apps/hymnal-exact/src/shipped/files.ts',
  'apps/hymnal-exact/src/shipped/write.ts',
];

describe('the data module ships no chords', () => {
  it('finds the reader and the writers through the build script that runs them', () => {
    const { reached } = reachedFrom('apps/hymnal-exact/src/hymns/make.ts');
    expect(reached.has(READER)).toBe(true);
    for (const writer of WRITERS) expect(reached.has(writer)).toBe(true);
  });

  it('no module app.ts reaches is the reader or a writer, the loader and its gate among them', () => {
    const { reached, unresolved } = reachedFrom('apps/hymnal-exact/app.ts');
    expect(reached.has('apps/hymnal-exact/src/chords/load.ts')).toBe(true);
    expect(reached.has('apps/hymnal-exact/src/chords/first-use.ts')).toBe(true);
    expect(reached.has(READER)).toBe(false);
    for (const writer of WRITERS) expect(reached.has(writer)).toBe(false);
    expect(unresolved.filter((specifier) => specifier.includes('chords'))).toEqual([]);
  });
});

const INDEXES = [
  'apps/hymnal/vite/indexes.ts',
  'apps/hymnal/src/hymns/indexes.ts',
  'apps/hymnal/src/hymns/search.ts',
  'apps/hymnal-exact/src/hymns/indexes.gen.json',
];

/**
 * Nor the back-matter indexes: no module `app.ts` reaches is their reader,
 * the generated table, or the current app's modules over the bundled ones
 * (`hymns/indexes.ts`, `hymns/search.ts`); it reaches the rules over
 * indexes given (`lookups.ts`, `search-rules.ts`), the loader and its gate.
 * The walker is tried on the testing book first, which reaches the table.
 */
describe('the data module ships no indexes', () => {
  it('finds the table through the testing book and the current app through its search', () => {
    const testing = reachedFrom('apps/hymnal-exact/src/hymns/book.testing.ts');
    expect(testing.reached.has(INDEXES[3] ?? '')).toBe(true);
    expect(reachedFrom('apps/hymnal/src/hymns/search.ts').reached.has(INDEXES[1] ?? '')).toBe(true);
  });

  it('no module app.ts reaches is the indexes, the loader and its gate among them', () => {
    const { reached, unresolved } = reachedFrom('apps/hymnal-exact/app.ts');
    expect(reached.has('apps/hymnal-exact/src/indexes/load.ts')).toBe(true);
    expect(reached.has('apps/hymnal-exact/src/indexes/first-use.ts')).toBe(true);
    expect(reached.has('apps/hymnal/src/hymns/lookups.ts')).toBe(true);
    expect(reached.has('apps/hymnal/src/hymns/search-rules.ts')).toBe(true);
    for (const module of INDEXES) expect(reached.has(module)).toBe(false);
    expect(unresolved.filter((specifier) => specifier.includes('indexes'))).toEqual([]);
  });
});
