/**
 * The About-this-hymn sheet's source, as `app.ts` registers it:
 * `abouthymnPage(n)` answers `aboutAt`, the sheet for hymn `n`.
 */

import type { Book } from '../hymns/book.ts';
import { aboutAt } from './about.ts';

export const abouthymnSources = (book: Book) => ({
  abouthymnPage: ([number]: readonly [string]) => aboutAt(book, number),
});
