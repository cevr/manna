/**
 * `@manna/hymnal-app/follow/report` as the port's tests read it
 * (`tsconfig.src.json` maps it here): the follow's report of the player's
 * state, whose source imports the current app's player through its own
 * paths. `follow.model.test.ts` runs the source itself.
 */

import type { Report } from '@manna/hymnal-app/follow/follower';
import type { Player } from '@manna/hymnal-app/player/player';

export declare const reportOf: (
  number: number,
  state: Player,
  rate: number,
  counting: boolean,
) => Report;
