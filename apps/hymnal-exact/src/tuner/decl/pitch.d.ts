/**
 * `@manna/hymnal-app/tuner/pitch` as Exact's type check reads it (the app's
 * `tsconfig.json` maps it here): McLeod's pitch of one frame, an `Option`
 * named by its shapes. `src/tuner/held.test.ts` holds it to the source.
 */

import type { Opt } from '@manna/hymnal-app/hymns/chords';

/** The fundamental of `frame` at `sampleRate` Hz, or none. */
export declare const detect: (frame: Float32Array, sampleRate: number) => Opt<number>;
