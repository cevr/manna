/**
 * `src/follow/timeline.ts`'s decoder as Exact's type check reads it. Its
 * answer is `effect`'s `Option`, whose declarations this repo cannot stage,
 * so it is named here by the two shapes it takes at run time.
 */

import type { Timeline } from '../player/stanzas';

/** A hymn's timeline from its bundled string; none when the string does not decode. */
export declare const timelineOf: (
  encoded: string,
) => { readonly _tag: 'None' } | { readonly _tag: 'Some'; readonly value: Timeline };
