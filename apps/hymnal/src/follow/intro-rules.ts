/**
 * The intro's rules apart from the player: how much of the intro before a
 * hymn's first sung line is played (`share`, from 0 to 1) and how long is
 * left (`left`, ms) at a place, and how a screen reader reads that.
 * `intro.ts` reads the player's place into them; the Exact port reads its
 * own player's.
 */

import { Option } from 'effect';

export interface Intro {
  readonly share: number;
  readonly left: number;
}

/** The intro at place `at` (ms) of a hymn whose first line is sung at `first` ms: some only before it, when the hymn has an intro (`first` > 0). */
export const introAt = (first: number, at: Option.Option<number>): Option.Option<Intro> =>
  at.pipe(
    Option.filter((ms) => first > 0 && ms < first),
    Option.map((ms) => ({ share: Math.max(0, ms) / first, left: first - Math.max(0, ms) })),
  );

/** The intro's value as a screen reader reads it: whole percent played, whole seconds left. */
export const readingOf = (intro: Intro) => ({
  now: Math.floor(intro.share * 100),
  text: `${Math.ceil(intro.left / 1000)} seconds to the first line`,
});
