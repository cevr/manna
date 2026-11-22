/**
 * The app's own verse: the brief's first promise, which the first minute
 * plants, and the field's own row of it. The bundler derives its words from
 * the KJV by this query (`vite/passage.ts`), and the field shows it first,
 * a passage of one verse (`ownPassagesOf`).
 */

import type { FieldPassage } from '../field';

/** The query that names the first verse. */
export const FIRST_VERSE = 'Isaiah 41:10';

/** The passages the field shows first: the verse at `reference`, a passage of one verse. */
export const ownPassagesOf = (reference: string): readonly FieldPassage[] => [
  { title: reference, verses: [reference] },
];
