/**
 * `@manna/hymnal-app/tuner/focus` as Exact's type check reads it (the app's
 * `tsconfig.json` maps it here): the focus a frame is heard through, opaque,
 * and what it shows for the frame, an `Option` named by its shapes.
 * `src/tuner/held.test.ts` holds it to the source.
 */

import type { Opt } from '@manna/hymnal-app/hymns/chords';

/** Where the focus stands between frames: only `hear` reads it. */
export type Focus = NonNullable<unknown>;

/** The start state: nothing held, no run. */
export declare const unfocused: Focus;

/** Hears one frame: the focus after it, and the pitch shown for it. */
export declare const hear: (
  focus: Focus,
  frame: Float32Array,
  sampleRate: number,
) => { readonly focus: Focus; readonly hz: Opt<number> };
