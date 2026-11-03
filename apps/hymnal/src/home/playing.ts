import { Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';

import { type Player, trackOf } from '~/player/player';

export const playingNumber = Atom.family((state: Atom.Atom<Player>) =>
  Atom.map(state, (value) =>
    Option.match(trackOf(value), {
      onNone: () => 0,
      onSome: (track) => track.number,
    }),
  ),
);
