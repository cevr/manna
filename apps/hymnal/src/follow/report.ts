/**
 * What a hymn page's follow is told of the player (`follower.ts`'s
 * `Report`), from the player's state: the page's hymn's place and whether
 * it plays, waits or stands, else away.
 */

import { Player } from '../player/player';

import type { Report } from './follower';
const away: Report = { _tag: 'Away' };

/**
 * The follower's report of `state` on hymn `number`, its place moving at
 * `rate` (the player's `rate`). A count-in holds the place at the first
 * sung line, so while `counting` a playing state is reported paused there:
 * that line is marked and the follow's clock does not run on.
 */
export const reportOf = (
  number: number,
  state: Player,
  rate: number,
  counting: boolean,
): Report => {
  const here = (
    track: { readonly number: number },
    at: number,
    kind: 'playing' | 'waiting' | 'paused',
  ): Report => {
    if (track.number !== number) return away;
    return { _tag: 'Here', at: at * 1000, state: kind, rate };
  };
  return Player.$match(state, {
    Idle: () => away,
    Loading: () => away,
    Playing: ({ track, at }) => {
      if (counting) return here(track, at, 'paused');
      return here(track, at, 'playing');
    },
    Buffering: ({ track, at }) => here(track, at, 'waiting'),
    Paused: ({ track, at }) => here(track, at, 'paused'),
    Ended: () => away,
    Stopped: () => away,
    Failed: () => away,
  });
};
