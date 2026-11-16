/**
 * The chords' sources, as `app.ts` registers them over the shipped chords
 * (`chords.gen.ts`, one string per hymn, decoded only for the hymn asked):
 * `chordsPage(n, on, moves)` the page's chords (`page.ts`),
 * `chordsMove(moves, n, step)` the kept moves after a press (`move.ts`),
 * `chordsGrip(token)` a chord's shape (`shape.ts`).
 */

import { decodeHymn } from '@manna/hymnal-app/hymns/chords';

import type { Book } from '../hymns/book.ts';
import { movesAfter } from './move.ts';
import { chordsPageAt } from './page.ts';
import { gripPageOf } from './shape.ts';

export const chordsSources = (
  book: Book,
  bundled: ReadonlyArray<readonly [number, string]>,
  decode: (encoded: string) => ReturnType<typeof decodeHymn> = (encoded) => decodeHymn(encoded),
) => {
  const shipped = { encoded: new Map(bundled), decode };
  return {
    chordsPage: ([route, on, moves]: readonly [string, boolean, ReadonlyArray<string>]) =>
      chordsPageAt(book, shipped, route, on, moves),
    chordsMove: ([moves, number, step]: readonly [ReadonlyArray<string>, number, string]) => ({
      moves: movesAfter(moves, number, step),
    }),
    chordsGrip: ([token]: readonly [string]) => gripPageOf(token),
  };
};
