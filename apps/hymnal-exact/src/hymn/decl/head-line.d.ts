/**
 * A Scripture passage as the index prints it. This file is
 * `@manna/hymnal-app/reader/head-line` as Exact's type check reads it (the
 * app's `tsconfig.json` maps it here): the quiet line over a hymn's title.
 * A passage is passed through to `headLine` unread, so it is named and not
 * spelled out.
 */
export interface Passage {
  readonly _tag: string;
}

/** The hymn's section, then its first passage and how many more follow (`+2`). */
export declare const headLine: (section: string, passages: ReadonlyArray<Passage>) => string;
