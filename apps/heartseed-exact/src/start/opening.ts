/**
 * The screen a launch opens on, by the current Heartseed's own rule
 * (`openingOf`, `@manna/heartseed/first/flow`): Today in an unread garden,
 * the first minute when the read holds no plant, home when it holds one.
 * The port has no first minute, so it shows home there; the one opening it
 * moves to is Today's, pushed over home as the current app's Today comes
 * back to home at `Your field`.
 */

import { openingOf, type Opening } from '@manna/heartseed/first/flow';
import type { GardenView } from '@manna/heartseed/garden';
import { Option } from 'effect';

/** What `features/start.contract` reads: the current app's opening, and the route the port pushes for it (empty: stay at home). */
export interface StartShown {
  opening: Opening;
  route: string;
}

/** The route the port pushes over home for `opening`: Today's for `today`, none for the rest. */
export const routeOf = (opening: Opening): string => {
  if (opening === 'today') return '/today';
  return '';
};

/**
 * Where the launch's one opening moves, as `startOpen` in
 * `features/start.contract` composes it (held there by `push.test.ts`): the
 * opening's route the first time it is decided, and only over a launch at the
 * Garden tab's root, so a location the launch opened at (a deep link, the
 * Read tab) is kept; once decided, nothing. Empty: stay where it is.
 */
export const startPushOf = (decided: boolean, route: string, tab: string, top: string): string => {
  if (decided || route === '' || tab !== 'garden' || top !== 'garden') return '';
  return route;
};

/** The opening of a launch whose garden read gave `garden`, and its route. */
export const startOf = (garden: GardenView): StartShown => {
  const opening = openingOf(Option.some(garden));
  return { opening, route: routeOf(opening) };
};
