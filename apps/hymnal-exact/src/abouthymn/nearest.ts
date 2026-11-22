/* oxlint-disable effect/noGlobals -- a build-time host module under Bun (`make.ts` writes its text): it writes the table the data module bundles as JSON text, as src/hymns/make.ts writes the book; it runs under Bun, never in the data module. */

/**
 * The About sheet's `More like this` for every hymn, as the build writes it
 * (`make.ts`): the current app's `moreLike(number, MORE_LIKE)` over its
 * meaning table, taken at build time so the data module ships 695 rows of
 * numbers, not the 13 MB table. Bun reads this module, never the data
 * module.
 */

import { moreLike } from '@manna/hymnal-app/hymns/meaning';
import { MORE_LIKE } from '@manna/hymnal-app/reader/about-rules';
import { readWords } from '@manna/hymnal-app/vite/words';

/** Each hymn's number and the hymns most like it, the nearest first. */
export const nearestRows = (): ReadonlyArray<readonly [number, ReadonlyArray<number>]> =>
  readWords().map((hymn) => [hymn.number, moreLike(hymn.number, MORE_LIKE)] as const);

/** The module text `nearest.gen.ts` holds for `rows`. */
export const nearestText = (
  rows: ReadonlyArray<readonly [number, ReadonlyArray<number>]>,
): string =>
  `/** Each hymn's More like this, written by src/abouthymn/make.ts; ignored. */\nexport default ${JSON.stringify(rows)} as ReadonlyArray<readonly [number, ReadonlyArray<number>]>;\n`;
