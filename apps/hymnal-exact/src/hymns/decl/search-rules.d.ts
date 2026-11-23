/**
 * `@manna/hymnal-app/hymns/search-rules` as Exact's type check reads it (the
 * app's `tsconfig.json` maps it here, as it does `text.d.ts`): the current
 * app's search over back-matter indexes given at run time, never the
 * bundled ones. The source's index and found hymn hold `effect`'s `Option`,
 * whose declarations this repo cannot stage (two copies of rolldown), so
 * these name only what this app reads: the index, passed through, and each
 * found hymn.
 */

import type { Lookups } from './lookups';
import type { HymnText } from './text';

/** A set of hymns, indexed once for every query after. */
export interface SearchIndex {
  hymns: Array<HymnText>;
}

/** The index of `all`, searching the back-matter indexes `indexes`. */
export declare const indexOf: (all: ReadonlyArray<HymnText>, indexes: Lookups) => SearchIndex;

/** The hymns `query` finds, in rank order, each with the line it was found by when that is not its title (an `effect` Option, by its shapes). */
export declare const find: (
  index: SearchIndex,
  query: string,
) => Array<{
  hymn: HymnText;
  line: { readonly _tag: 'Some'; readonly value: string } | { readonly _tag: 'None' };
}>;
