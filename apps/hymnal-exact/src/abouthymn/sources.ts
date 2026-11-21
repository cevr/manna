/**
 * The About-this-hymn sheet's source, as `app.ts` registers it:
 * `abouthymnPage(n)` answers `aboutAt`, the sheet for hymn `n`, its
 * `More like this` from `nearest` (`app.ts` passes the written
 * `nearest.gen.ts`).
 */

import type { Book } from '../hymns/book.ts';
import { aboutAt } from './about.ts';

export const abouthymnSources = (
  book: Book,
  nearest: ReadonlyArray<readonly [number, ReadonlyArray<number>]> = [],
) => {
  const table = new Map(nearest);
  return {
    abouthymnPage: ([number]: readonly [string]) => aboutAt(book, table, number),
  };
};
