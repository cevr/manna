/**
 * The book the data module reads: the current app's hymns (`hymns.ts`, its
 * `virtual:hymnal`, which the build maps to `words.gen.json`) and its
 * search index, built by the current app's `hymnIndex` on the first query
 * and kept, never at launch.
 */

import { hymns } from '@manna/hymnal-app/hymns/hymns';
import { type SearchIndex, hymnIndex } from '@manna/hymnal-app/hymns/search';
import type { HymnText } from '@manna/hymnal-app/hymns/text';

export type { HymnText, Section } from '@manna/hymnal-app/hymns/text';

/** Hymns in number order, and their search index, made only when a query asks for it. */
export interface Book {
  readonly hymns: ReadonlyArray<HymnText>;
  readonly index: () => SearchIndex;
}

/** The whole hymnal the app ships. */
export const book: Book = { hymns, index: hymnIndex };
