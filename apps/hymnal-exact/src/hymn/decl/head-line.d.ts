/**
 * `@manna/hymnal-app/reader/head-line` as Exact's type check reads it (the
 * app's `tsconfig.json` maps it here): the quiet line over a hymn's title.
 */

import type { Passage } from './indexes';

/** The hymn's section, then its first passage and how many more follow (`+2`). */
export declare const headLine: (section: string, passages: ReadonlyArray<Passage>) => string;
