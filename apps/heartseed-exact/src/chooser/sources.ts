/**
 * The chooser's data sources, as `app.ts` registers them. Each answers at
 * once from the canon and the corpus the data module imports, and touches
 * no storage: `chooserBooks` the books step, `chooserChapters` a book's
 * chapters, `chooserTap` the range after a tap, and `chooserRead` the
 * verses step's footer, given the single verses held, their references
 * joined by `|`. A route's book and chapter arrive as its text.
 */

import {
  chooserBooks,
  chooserChapters,
  chooserShown,
  chooserTap,
  type ChooserBooks,
  type ChooserChapters,
  type ChooserRange,
  type ChooserShown,
} from './chooser';

/** The chooser's sources. */
export const chooserSources = {
  chooserBooks: (): ChooserBooks => chooserBooks(),
  chooserChapters: ([book]: readonly [string]): ChooserChapters => chooserChapters(book),
  chooserTap: ([book, chapter, first, last, verse]: readonly [
    string,
    string,
    number,
    number,
    number,
  ]): ChooserRange => chooserTap(book, chapter, { first, last }, verse),
  chooserRead: ([book, chapter, first, last, answer, singles]: readonly [
    string,
    string,
    number,
    number,
    string,
    string,
  ]): ChooserShown => chooserShown(book, chapter, { first, last }, answer, singlesOf(singles)),
};

/** The single verses' references as the contract hands them, joined by `|`. */
const singlesOf = (text: string) => text.split('|').filter((reference) => reference !== '');
