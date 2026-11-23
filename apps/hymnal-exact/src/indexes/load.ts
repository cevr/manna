/* oxlint-disable effect/noTernary, effect/noNullish, effect/noTryCatch, effect/noRuntimeTypeof, effect/noGlobals -- Exact's data module cannot import effect (docs/exact.md): the shipped file is JSON text read plainly, one whose text is not the indexes is refused as undefined, and a read has no files or module where the host gives none. */

/**
 * The hymnal's back-matter indexes (topics, Scripture references, metres
 * and tunes, as the current app's `vite/indexes.ts` derives them), shipped
 * as one file (`indexes/all` for iOS, `modules/web/indexes/all.js` for the
 * web; written by `src/hymns/make.ts`) and read the first time a source
 * needs them (`src/shipped/load.ts`), never bundled: a search, the Topics,
 * Scripture and Metres tabs, a hymn page's head line and the About sheet
 * answer once they are read (`first-use.ts`). Until then, and after a read
 * that fails, the indexes are `NO_INDEXES`, and the next ask reads again.
 */

import type { HymnIndexes } from '@manna/hymnal-app/hymns/lookups';

import { readerOf, type AppModule, type ShippedFiles, shippedLoader } from '../shipped/load.ts';

/** The shipped folder of the indexes, and its one file's name. */
export const INDEXES = 'indexes';
export const ALL = 'all';

/** Indexes with nothing in them: what a source reads before the file is. */
export const NO_INDEXES: HymnIndexes = { topics: [], references: [], metres: [], tunes: [] };

/** Whether `value` holds the four lists the indexes are made of, as `make.ts` writes them. */
const isIndexes = (value: unknown): value is HymnIndexes =>
  typeof value === 'object' &&
  value !== null &&
  ['topics', 'references', 'metres', 'tunes'].every((name) =>
    Array.isArray(Reflect.get(value, name)),
  );

/** `text`'s indexes, or undefined when it is not JSON of the four lists. */
const indexesIn = (text: string): HymnIndexes | undefined => {
  try {
    const value: unknown = JSON.parse(text);
    return isIndexes(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

/** The loader over the indexes `given` from the start (a test's; none in the app). */
export const indexesLoader = (given?: HymnIndexes) =>
  shippedLoader<string, HymnIndexes>(
    new Map(given === undefined ? [] : [[ALL, given]]),
    String,
    indexesIn,
  );

export type IndexesLoader = ReturnType<typeof indexesLoader>;

/** The indexes `loader` has read, or `NO_INDEXES` before it has. */
export const indexesOf = (loader: IndexesLoader): HymnIndexes => loader.kept.get(ALL) ?? NO_INDEXES;

/** The read a source makes of the indexes, through its `storage` and `native`. */
export const indexesReader = (storage?: ShippedFiles | null, native?: AppModule | null) =>
  readerOf(INDEXES, storage, native);
