/**
 * The tour as a pure reducer: home's tips and the replay of the two
 * screens before the first verse. It is the root's state for the launch,
 * never stored, so every launch begins `off`.
 *
 * - Planted's `Continue` shows home with its tips.
 * - Home's `How Heartseed works` (and the Settings sheet's `Show the
 *   welcome again`) replays the welcome, the tips or none showing.
 * - The replayed welcome's `Begin` shows how a verse grows; its `Skip`
 *   ends the tour on home.
 * - The replayed second screen's `See your field` shows home with its tips.
 * - Home's `Got it` ends the tips, and leaving home for any other screen
 *   ends the tour wherever it stood.
 */

import { Option } from 'effect';

export type Tour = 'off' | 'welcome' | 'grows' | 'tips';

/** A tap the tour hears: `Continue` Planted's, `How` home's row or the sheet's, `Begin`, `Skip` and `See` the replay's, `GotIt` home's, and `Leave` any change of the screen away from home. */
export type TourTap = 'Continue' | 'How' | 'Begin' | 'Skip' | 'See' | 'GotIt' | 'Leave';

/** Each tap's moves, from the states it moves; a state it does not name stays. */
const MOVES: Readonly<Record<TourTap, Readonly<Partial<Record<Tour, Tour>>>>> = {
  Continue: { off: 'tips' },
  How: { off: 'welcome', tips: 'welcome' },
  Begin: { welcome: 'grows' },
  Skip: { welcome: 'off' },
  See: { grows: 'tips' },
  GotIt: { tips: 'off' },
  Leave: { off: 'off', welcome: 'off', grows: 'off', tips: 'off' },
};

/** The tour after one tap: each moves only from its own state, `Leave` from any; every other pair changes nothing. */
export const tourStep = (tour: Tour, tap: TourTap): Tour =>
  Option.getOrElse(Option.fromUndefinedOr(MOVES[tap][tour]), () => tour);
