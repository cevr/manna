/**
 * A position bar's rules, as the player keeps the reader's hand on its bar.
 * This file is `@manna/hymnal-app/player/scrub-rules` as Exact's type check
 * reads it (the app's `tsconfig.json` maps it here): that check stages a
 * package's declarations, never its source. It names only what the player
 * reads, in its own terms; the settle, an `effect` `Duration`, is the view's
 * timer, held to it by a Bun test. The repo's typecheck reads the source
 * itself, so a call here that the source renames or retypes fails it.
 * Here: whether the player at `at` has reached the place `sent`.
 */
export declare const reached: (at: number, sent: number) => boolean;

/** Whether a move from `from` to `to` is sent. */
export declare const sends: (from: number, to: number) => boolean;

/** The place under a touch `x` along a bar `width` wide, of a recording `max` seconds long. */
export declare const placeAt: (x: number, width: number, max: number) => number;

/** How far a screen reader's swipe moves the bar, in seconds. */
export declare const NUDGE: number;

/** The place a screen reader's swipe `way` moves the bar to, within `max`. */
export declare const nudged: (value: number, max: number, way: 1 | -1) => number;
