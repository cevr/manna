/**
 * The book the tests read: the whole hymnal over the indexes the build
 * ships (`virtual:hymnal-indexes`, the current app's `vite/indexes.ts`,
 * registered by `src/test/setup.ts`), as the app's book holds them once
 * they are read. The app's own book never imports them
 * (`src/shipped/no-chords.test.ts`).
 */

import bundled from 'virtual:hymnal-indexes';

import { bookOf } from './book.ts';

/** The indexes the build ships. */
export const indexes = bundled;

/** The book over the shipped indexes. */
export const book = bookOf(() => bundled);
