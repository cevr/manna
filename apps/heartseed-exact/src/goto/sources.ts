/**
 * Go to's data sources, as `app.ts` registers them. Each answers at once
 * from the canon the data module imports and touches no storage. The field
 * arrives as its references joined by `|`, a route's book as its text.
 */

import { chooserBooks, type ChooserBooks } from '../chooser/chooser';
import {
  fieldOf,
  gotoBook,
  gotoGrow,
  gotoPlaceOf,
  type GotoBook,
  type GotoChapter,
  type GotoPlace,
} from './goto';

/** Go to's sources. */
export const gotoSources = {
  gotoBooks: (): ChooserBooks => chooserBooks(),
  gotoGrow: ([field]: readonly [string]): GotoChapter[] => gotoGrow(fieldOf(field)),
  gotoBook: ([book, shownBook, shownChapter, field]: readonly [
    string,
    number,
    number,
    string,
  ]): GotoBook => gotoBook(book, shownBook, shownChapter, fieldOf(field)),
  gotoPlaceOf: ([reference]: readonly [string]): GotoPlace => gotoPlaceOf(reference),
};
