/**
 * Every source the view asks for, one entry per feature: `app.ts` types
 * them against `app.contract`'s declarations and answers through them, and
 * the Bun tests drive them as Exact's data module runs them.
 */

import { hymnSources } from './hymn/sources.ts';
import { book } from './hymns/book.ts';
import { listSources } from './list/sources.ts';

export const sources = {
  ...listSources(book),
  ...hymnSources(book),
};
