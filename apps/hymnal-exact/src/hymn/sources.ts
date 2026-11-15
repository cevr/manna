/** The hymn page's sources, as `app.ts` registers them: `hymnPage(n)` answers `pageAt`. */

import type { Book } from '../hymns/book.ts';
import { pageAt } from './page.ts';

export const hymnSources = (book: Book) => ({
  hymnPage: ([number]: readonly [string]) => pageAt(book, number),
});
