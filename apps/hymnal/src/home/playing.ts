/**
 * The number of the hymn a player has, read off its state as one primitive
 * (0 while idle). The player's state changes several times a second while
 * it plays (`Playing` carries `at`); this changes only with its hymn, so a
 * reader of it draws nothing on a tick.
 */

import { Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';

import { type Player, trackOf } from '~/player/player';

/** The held hymn's number of the player whose state is `state`, one atom for each state atom. */
export const playingNumber = Atom.family((state: Atom.Atom<Player>) =>
  Atom.map(state, (value) =>
    Option.match(trackOf(value), {
      onNone: () => 0,
      onSome: (track) => track.number,
    }),
  ),
);
