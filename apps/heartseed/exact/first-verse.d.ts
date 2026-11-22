import type { FieldPassage } from './field.d.ts';

/** The query that names the first verse; see `src/first/verse.ts`. */
export declare const FIRST_VERSE: 'Isaiah 41:10';

/** The passages the field shows first: the verse at `reference`, a passage of one verse. */
export declare const ownPassagesOf: (reference: string) => readonly FieldPassage[];
