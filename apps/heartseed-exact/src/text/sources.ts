/**
 * The text's data sources, as `app.ts` registers them. Each answers at
 * once from the corpus the data module imports: `textVerses` a chapter's
 * verses, `textOf` a range's verses with their numbers, and `textSum` the
 * fingerprints of what `textOf` reads, which `text.test.contract` holds to
 * the current app's words.
 */

import type { Range } from '@manna/heartseed/passages';

import { textSums, type TextSums } from './sum';
import { textOf, textVerses, type TextPassage } from './text';

/** A range as Contract sends it: book, chapter, first and last verse. */
type RangeArgs = readonly [number, number, number, number];

const rangeOf = ([book, chapter, first, last]: RangeArgs): Range => ({
  book,
  chapter,
  first,
  last,
});

/** The text's sources. */
export const textSources = {
  textVerses: ([book, chapter]: readonly [number, number]): Array<string> =>
    textVerses(book, chapter),
  textOf: (args: RangeArgs): TextPassage => textOf(rangeOf(args)),
  textSum: (args: RangeArgs): TextSums => textSums(rangeOf(args)),
};
