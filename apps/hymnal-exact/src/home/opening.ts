/**
 * How a found hymn opens in the port: the current app's `openingAt`, read
 * from the address of the screen it was chosen on, and the address of the
 * hymn's page to push or put in that screen's place.
 */

import { type Opening, openingAt } from '@manna/hymnal-app/home/opening';

/** What the view does with a chosen hymn: how it opens, and the page's address. */
export interface OpeningMove {
  readonly how: Opening;
  readonly path: string;
}

/** How hymn `n`, chosen on the screen at `url`, opens. */
export const openingMove = (url: string, n: number): OpeningMove => ({
  how: openingAt(url, n),
  path: `/hymns/${n}`,
});
