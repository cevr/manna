/**
 * `src/follow/timeline.ts`'s decoder as Exact's type check reads it. Its
 * answer is `effect`'s `Option`, whose declarations this repo cannot stage,
 * so it is named here by the two shapes it takes at run time.
 */

import type { Timeline } from '../player/stanzas';

/** Where a time falls on a timeline: the line and syllable sung (-1 for none), that syllable's word, and when the place next changes. */
export interface Place {
  readonly line: number;
  readonly syllable: number;
  readonly word: number;
  readonly nextAt: number;
}

/** The line and syllable sung at `ms`, and when that next changes. */
export declare const placeAt: (timeline: Timeline, ms: number) => Place;

/** A hymn's timeline from its bundled string; none when the string does not decode. */
export declare const timelineOf: (
  encoded: string,
) => { readonly _tag: 'None' } | { readonly _tag: 'Some'; readonly value: Timeline };
