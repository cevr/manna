/**
 * A Scripture passage as the index prints it. This file is
 * `@manna/hymnal-app/hymns/indexes` as Exact's type check reads it (the
 * app's `tsconfig.json` maps it here): only what the hymn page reads. A
 * passage is passed through to `headLine` unread, so it is named and not
 * spelled out.
 */
export interface Passage {
  readonly _tag: string;
}

/** The passages `hymn` alludes to, in printed order. */
export declare const referencesOf: (hymn: number) => ReadonlyArray<Passage>;
