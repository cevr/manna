/**
 * The data module never bundles the current app's 13 MB meaning table: no
 * module `app.ts` reaches, by any import a bundler keeps and however its
 * specifier names it, is the table's module (`apps/hymnal/src/hymns/meaning.ts`).
 * About's `More like this` reads the table the build writes (`nearest.ts`,
 * `make.ts`) instead. The walker is tried on the build's own module first,
 * so one that finds nothing cannot pass.
 */

import { describe, expect, it } from 'bun:test';

import { reachedFrom } from '../test/graph.testing.ts';

const MEANING = 'apps/hymnal/src/hymns/meaning.ts';

describe('the data module ships no meaning table', () => {
  it('finds the table through the build-time module that does import it', () => {
    const { reached } = reachedFrom('apps/hymnal-exact/src/abouthymn/make.ts');
    expect(reached.has('apps/hymnal-exact/src/abouthymn/nearest.ts')).toBe(true);
    expect(reached.has(MEANING)).toBe(true);
  });

  it('no module app.ts reaches is the table, About among them', () => {
    const { reached, unresolved } = reachedFrom('apps/hymnal-exact/app.ts');
    expect(reached.has('apps/hymnal-exact/src/abouthymn/about.ts')).toBe(true);
    expect(reached.has(MEANING)).toBe(false);
    expect(unresolved.filter((specifier) => !/\.gen(?:\.ts)?$|^virtual:/u.test(specifier))).toEqual(
      [],
    );
  });
});
