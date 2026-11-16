/**
 * Each cue's body, as the haptics guard reads it. This file is
 * `@manna/hymnal-app/feel/body` as Exact's type check reads it (the app's
 * `tsconfig.json` maps it here): that check stages a package's
 * declarations, never its source, and the source's body carries `effect`'s
 * `Option` for its sound, which the guard never reads. It names only the
 * haptic, in Apple's names. The repo's typecheck reads the source itself,
 * so a call here that the source renames or retypes fails it.
 */

import type { Cue } from '@manna/hymnal-app/feel/cues';

/** A haptic by Apple's names. */
type Felt =
  | { readonly _tag: 'selection' }
  | { readonly _tag: 'impact'; readonly style: 'light' | 'medium' | 'soft' | 'rigid' }
  | { readonly _tag: 'notification'; readonly type: 'success' };

/** The body cue `cue` is given: the haptic it is felt by. */
export declare const bodyOf: (cue: Cue) => { readonly haptic: Felt };
