/**
 * `@manna/hymnal-app/hymns/hymns` as Exact's type check reads it (the app's
 * `tsconfig.json` maps it here, as it does `text.d.ts`).
 */

import type { HymnText } from './text';

/** Every hymn the app ships, in number order. */
export declare const hymns: Array<HymnText>;
