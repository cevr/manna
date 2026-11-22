/** The query that names the first verse. */
export const FIRST_VERSE = 'Isaiah 41:10';

/** One of the field's own rows, a `FieldPassage` of no range: its title and its verses' references. */
export interface OwnPassage {
  readonly title: string;
  readonly verses: ReadonlyArray<string>;
}

/** The passages the field shows first: the verse at `reference`, a passage of one verse. */
export const ownPassagesOf = (reference: string): readonly OwnPassage[] => [
  { title: reference, verses: [reference] },
];
