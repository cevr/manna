/**
 * `@manna/hymnal-app/hymns/indexes` as Exact's type check reads it (the
 * app's `tsconfig.json` maps it here): what the About-this-hymn sheet reads
 * of the hymnal's back-matter indexes. A passage is handed back to the
 * module unread, so it is named and not spelled out; a topic's heading is
 * an effect Option, read by its tag.
 */

export interface Passage {
  readonly _tag: string;
}

export interface Topic {
  readonly name: string;
  readonly parent: { readonly _tag: 'Some'; readonly value: string } | { readonly _tag: 'None' };
}

/** The other hymns of the metres `hymn` is listed under, ascending. */
export declare const sameMetre: (hymn: number) => ReadonlyArray<number>;
/** The topics `hymn` is listed under, in printed order. */
export declare const topicsOf: (hymn: number) => ReadonlyArray<Topic>;
/** The passages `hymn` alludes to, in printed order. */
export declare const referencesOf: (hymn: number) => ReadonlyArray<Passage>;
/** A passage as the reader sees it (`Psalms 98:4, 6`). */
export declare const passageText: (passage: Passage) => string;
/** The search query for where a passage begins. */
export declare const passageQuery: (passage: Passage) => string;
