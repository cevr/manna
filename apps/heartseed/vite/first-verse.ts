/**
 * The query that names the first verse, outside the app's own sources so
 * they hold neither the reference nor its words (`src/today.test.tsx`):
 * `passage.ts` derives Today's passage from it at the bundle, and
 * `src/first/verse.ts` hands it on for the Exact port.
 */
export const FIRST_VERSE = 'Isaiah 41:10';
