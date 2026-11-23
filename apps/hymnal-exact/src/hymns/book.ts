/* oxlint-disable effect/noNullish -- Exact's data module cannot import effect (docs/exact.md): a lookup or index not built yet is a plain `undefined`. */

/**
 * The book the data module reads: the current app's hymns (`hymns.ts`, its
 * `virtual:hymnal`, which the build maps to `words.gen.json`), the
 * back-matter indexes `indexes` answers (the app's are read the first time
 * a source needs them, `src/indexes/load.ts`), their lookups, and the
 * search index over both, built by the current app's search on the first
 * query and kept, never at launch. The lookups and the index are built
 * again when the indexes are, so a search made before the indexes were
 * read finds by the hymns' words alone, and one after by their indexes too.
 */

import { hymns } from '@manna/hymnal-app/hymns/hymns';
import { type HymnIndexes, type Lookups, lookupsOf } from '@manna/hymnal-app/hymns/lookups';
import { type SearchIndex, indexOf } from '@manna/hymnal-app/hymns/search-rules';
import type { HymnText } from '@manna/hymnal-app/hymns/text';

export type { HymnText, Section } from '@manna/hymnal-app/hymns/text';

/** Hymns in number order, their indexes, and what is built of them only when asked for. */
export interface Book {
  readonly hymns: ReadonlyArray<HymnText>;
  readonly indexes: () => HymnIndexes;
  readonly lookups: () => Lookups;
  readonly index: () => SearchIndex;
}

/** The whole hymnal the app ships, over the indexes `indexes` answers now. */
export const bookOf = (indexes: () => HymnIndexes): Book => {
  let of: HymnIndexes | undefined;
  let lookups: Lookups | undefined;
  let index: SearchIndex | undefined;
  /** The lookups over the indexes now, built again when they are not those last built over. */
  const lookupsNow = (): Lookups => {
    const now = indexes();
    if (lookups === undefined || of !== now) {
      of = now;
      lookups = lookupsOf(now);
      index = undefined;
    }
    return lookups;
  };
  return {
    hymns,
    indexes,
    lookups: lookupsNow,
    index: () => {
      const over = lookupsNow();
      index ??= indexOf(hymns, over);
      return index;
    },
  };
};
