/**
 * The full player's caption, as the player draws the current app's line.
 * This file is `@manna/hymnal-app/player/caption` as Exact's type check
 * reads it (the app's `tsconfig.json` maps it here): that check stages a
 * package's declarations, never its source, and the source names its
 * states by the player's own, which import `effect`. Here a state is its
 * tag alone, a failure's with whether the device is offline. The repo's
 * typecheck reads the source itself, so a call here that the source
 * renames or retypes fails it.
 */

type Tag = 'Idle' | 'Loading' | 'Playing' | 'Buffering' | 'Paused' | 'Ended' | 'Stopped';

/** What the player is doing, in a line under its hymn. */
export declare const captionOf: (
  player: { readonly _tag: Tag } | { readonly _tag: 'Failed'; readonly offline: boolean },
) => string;
