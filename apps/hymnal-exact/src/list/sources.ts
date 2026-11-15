/** The list's sources, as `app.ts` registers them: `hymnRows(query)` answers `rowsOf`. */

import type { Book } from '../hymns/book.ts';
import { rowsOf } from './rows.ts';

export const listSources = (book: Book) => ({
  hymnRows: ([query]: readonly [string]) => rowsOf(book, query),
});
