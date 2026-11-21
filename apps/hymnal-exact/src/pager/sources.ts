/* oxlint-disable effect/noNullish -- Exact's data module cannot import effect (docs/exact.md): a route that names no hymn is undefined. */

/**
 * The pager's sources, as `app.ts` registers them:
 *
 * - `pagerAround(route, from)`: the hymns drawn for the route's hymn, it and
 *   one each side (`around`), from the list the reader opened it from, else
 *   every hymn. Numbers only: each page's words are `hymnPage`'s, asked per
 *   page, so a page kept across a settle keeps its answer.
 * - `pagerPlaces()`: the current app's measures of the pager: the strip at
 *   the left edge whose pans go back (`backEdge`), in points.
 * - `pagerSettle(numbers, offset, width)`: the hymn the pages drawn show once
 *   the pager rests at `offset` (`settled`).
 */

import { backEdge } from '@manna/hymnal-app/reader/pager';

import type { Book } from '../hymns/book.ts';
import { hymnAt } from '../hymn/page.ts';
import { around, settled } from './pager.ts';

export const pagerSources = (book: Book) => {
  const every = book.hymns.map((hymn) => hymn.number);
  return {
    pagerAround: ([route, from]: readonly [string, ReadonlyArray<number>]) => {
      const hymn = hymnAt(book, route);
      if (hymn === undefined) return { number: 0, numbers: [] };
      return around(from, hymn.number, every);
    },
    pagerPlaces: () => ({ edge: backEdge }),
    pagerSettle: ([numbers, offset, width]: readonly [ReadonlyArray<number>, number, number]) => ({
      number: settled(offset, width, numbers),
    }),
  };
};
