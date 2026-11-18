/* oxlint-disable effect/noNullish -- Exact's data module cannot import effect (docs/exact.md): a hymn the shipped chords do not hold is undefined in their map. */

/**
 * The hymn page's sources, as `app.ts` registers them: `hymnPage(n)` answers
 * `shownAt`, its syllables from the shipped chords (`chords.gen.ts`, one
 * string per hymn), decoded only for the hymn asked.
 */

import { decodeHymn } from '@manna/hymnal-app/hymns/chords';

import type { Book } from '../hymns/book.ts';
import { shownAt } from './page.ts';

export const hymnSources = (
  book: Book,
  bundled: ReadonlyArray<readonly [number, string]> = [],
  decode: typeof decodeHymn = decodeHymn,
) => {
  const encoded = new Map(bundled);
  const chords = (hymn: number) => {
    const shipped = encoded.get(hymn);
    if (shipped === undefined) return undefined;
    const decoded = decode(shipped);
    if (decoded._tag === 'None') return undefined;
    return decoded.value;
  };
  return {
    hymnPage: ([number]: readonly [string]) => shownAt(book, number, chords),
  };
};
