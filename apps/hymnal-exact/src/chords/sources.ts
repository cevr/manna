/**
 * The chords' sources, as `app.ts` registers them over the shipped chords
 * (`chords.gen.ts`, one string per hymn, decoded only for the hymn asked):
 * `chordsPage(n, on, moves, style, placement)` the page's chords in the
 * kept chord style and placement, Simple on the beat when the two are
 * absent (`page.ts`, each hymn's kept move read by `move.ts`),
 * `chordsGrip(token)` a chord's shape (`shape.ts`).
 */

import { decodeHymn } from '@manna/hymnal-app/hymns/chords';

import type { Book } from '../hymns/book.ts';
import { type ChordsShipped, chordsPageAt } from './page.ts';
import { gripPageOf } from './shape.ts';

export const chordsSources = (
  book: Book,
  bundled: ReadonlyArray<readonly [number, string]>,
  decode: ChordsShipped['decode'] = (encoded, placement) => decodeHymn(encoded, placement),
) => {
  const shipped = { encoded: new Map(bundled), decode };
  return {
    chordsPage: ([route, on, moves, style, placement]: readonly [
      string,
      boolean,
      ReadonlyArray<string>,
      string?,
      string?,
    ]) => chordsPageAt(book, shipped, route, on, moves, style, placement),
    chordsGrip: ([token]: readonly [string]) => gripPageOf(token),
  };
};
