/**
 * A position bar's rules, with no React: the second a place falls in, when
 * a let-go drag is sent, when the player has reached the place sent, how
 * long the bar holds it, where a touch points along the bar and how far a
 * screen reader's swipe moves it. `scrub.ts`'s hook keeps the reader's hand
 * by them, and the Exact port's player (`apps/hymnal-exact`) imports them.
 */

import { Duration, Option } from 'effect';

/** How long the bar holds a place it sent before it shows the player's again. */
export const settleFor = Duration.seconds(2);

/** Whether the player at `at` has reached the place `sent`: within a second of it. */
export const reached = (at: number, sent: number) => Math.abs(at - sent) < 1;

/** The second a place falls in: the bar moves a second a step. */
export const second = Math.floor;

/** Whether a move from `from` to `to` is sent: only one that ends on another second. */
export const sends = (from: number, to: number) => second(to) !== second(from);

/** The place under a touch `x` points along a bar `width` points wide, of a recording `max` seconds long. */
export const placeAt = (x: number, width: number, max: number) =>
  Option.match(
    Option.liftPredicate(width, (measured) => measured > 0),
    {
      onNone: () => 0,
      onSome: (measured) => Math.min(Math.max(x / measured, 0), 1) * max,
    },
  );

/** How far a screen reader's swipe moves the bar, in seconds. */
export const NUDGE = 10;

/** The place a screen reader's swipe up (`1`) or down (`-1`) moves the bar to, within the recording. */
export const nudged = (value: number, max: number, way: 1 | -1) =>
  Math.min(Math.max(value + way * NUDGE, 0), max);
