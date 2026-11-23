/**
 * The hymnal's search (`search-rules.ts`) over the bundled back-matter
 * indexes: `indexOf` searches them unless given others, and `hymnIndex` is
 * the index of every hymn, built as search mode opens, never at start.
 */

import { Option } from 'effect';

import { hymns } from './hymns';
import { type Lookups, lookups } from './indexes';
import { type SearchIndex, indexOf as indexWith } from './search-rules';
import type { HymnText } from './text';

export * from './search-rules';

/** The index of `all`, searching the back-matter indexes `indexes` (the bundled ones by default). */
export const indexOf = (all: ReadonlyArray<HymnText>, indexes: Lookups = lookups()): SearchIndex =>
  indexWith(all, indexes);

/** The app's index of every hymn, built the first time it is asked for and kept. */
export const hymnIndex: () => SearchIndex = (() => {
  let built = Option.none<SearchIndex>();
  return () =>
    Option.getOrElse(built, () => {
      const index = indexOf(hymns);
      built = Option.some(index);
      return index;
    });
})();
