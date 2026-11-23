/**
 * `@manna/hymnal-app/hymns/lookups` as Exact's type check reads it (the
 * app's `tsconfig.json` maps it here): the back-matter indexes' lookups over
 * indexes given at run time, which the port reads once its shipped
 * indexes are read (`src/indexes/load.ts`). A passage is handed back to the
 * module unread but for its book, so it is named and not spelled out; a
 * topic's heading is an effect Option, read by its tag. Held to the source
 * by `src/abouthymn/about.test.ts`.
 */

export interface Passage {
  readonly _tag: string;
  readonly book: number;
}

export interface Topic {
  readonly name: string;
  readonly parent: { readonly _tag: 'Some'; readonly value: string } | { readonly _tag: 'None' };
}

/** Hymns listed together, by number. */
interface Listed {
  readonly hymns: ReadonlyArray<number>;
}

/** A tune and its hymns. */
type Tune = Listed & { readonly name: string };

/** The Topical index (a subtopic naming its heading), the Scriptural index, the metres and the tunes. */
export interface HymnIndexes {
  readonly topics: ReadonlyArray<Listed & { readonly name: string; readonly parent?: string }>;
  readonly references: ReadonlyArray<{ readonly passage: Passage; readonly hymn: number }>;
  readonly metres: ReadonlyArray<{ readonly metre: string; readonly tunes: ReadonlyArray<Tune> }>;
  readonly tunes: ReadonlyArray<Tune>;
}

/** What the port reads of the lookups over a set of indexes: by hymn, its metres' other hymns, its topics and its passages. */
export interface Lookups {
  sameMetre(hymn: number): ReadonlyArray<number>;
  topicsOf(hymn: number): ReadonlyArray<Topic>;
  referencesOf(hymn: number): ReadonlyArray<Passage>;
}

/** The lookups over `indexes`, their tables built here. */
export declare const lookupsOf: (indexes: HymnIndexes) => Lookups;
/** A passage as the reader sees it. */
export declare const passageText: (passage: Passage) => string;
/** The query that searches for where a passage begins. */
export declare const passageQuery: (passage: Passage) => string;
