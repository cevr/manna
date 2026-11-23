/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's data module cannot import effect (docs/exact.md): an `about` the view has not passed is a plain `undefined`. */

/**
 * The list's sources, as `app.ts` registers them: `hymnRows(query, about)`
 * answers `rowsOf` with the hymns `about` names when they were asked for
 * this `query` (the current app's `aboutShown`), so an older query's hymns
 * never stand under a newer query's matches; with no `about`, the matches
 * alone.
 */

import type { Book, HymnText } from '../hymns/book.ts';
import type { AboutAnswer } from '../results/table.ts';
import { revealSources } from './reveal.ts';
import { rowsOf } from './rows.ts';

/** The hymns of `about` shown under `query`'s matches: none unless it was asked for `query`. */
export const aboutShownOf = (
  book: Book,
  query: string,
  about: AboutAnswer | undefined,
): ReadonlyArray<HymnText> =>
  about?.query === query
    ? about.numbers.flatMap((n) => book.hymns.filter((hymn) => hymn.number === n))
    : [];

export const listSources = (book: Book) => ({
  hymnRows: ([query, about]: readonly [string, AboutAnswer?]) =>
    rowsOf(book, query, aboutShownOf(book, query, about)),
  ...revealSources(),
});
