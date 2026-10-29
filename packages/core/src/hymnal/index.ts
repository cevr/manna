/**
 * Hymnal Module
 *
 * Provides access to 695 SDA hymns and 225 liturgical readings, in 68 categories.
 */

export {
  HymnalService,
  HymnalError,
  HymnNotFoundError,
  noIndexesError,
  type HymnalTestIndexes,
} from './service.js';
export {
  Category,
  Hymn,
  HymnIndexes,
  HymnVerse,
  IndexPassage,
  IndexRef,
  PassageQuery,
  isRefrain,
  passageReaches,
} from './schemas.js';

// Re-export ID types
export { CategoryId, HymnId, VerseId } from '../types/ids.js';
