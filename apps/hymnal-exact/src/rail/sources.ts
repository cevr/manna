/* oxlint-disable effect/noNullish -- Exact's data module cannot import effect (docs/exact.md): marks not made yet are a plain `undefined`. */

/**
 * The rail's sources, as `app.ts` registers them: `railPlaces()` answers
 * its measures and labels once, `railTo(before, y, length)` the hymn under
 * a touch (`touchAt`). The marks are made on the first call from the
 * book's Sections, never at load.
 */

import type { Book } from '../hymns/book.ts';
import { rowsOf } from '../list/rows.ts';
import { type At, type Mark, marksOf, type Places, placesOf, touchAt } from './rail.ts';

export const railSources = (book: Book) => {
  let made: ReadonlyArray<Mark> | undefined;
  const marks = (): ReadonlyArray<Mark> => {
    made ??= marksOf(rowsOf(book, ''));
    return made;
  };
  return {
    railPlaces: (): Places => placesOf(marks()),
    railTo: ([before, y, length]: readonly [number, number, number]): At =>
      touchAt(marks(), before, y, length),
  };
};
