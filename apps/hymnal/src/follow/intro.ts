import { Option } from 'effect';

import { Player } from '~/player/player';

export interface Intro {
  readonly share: number;
  readonly left: number;
}

export const introOf = (number: number, first: number, state: Player): Option.Option<Intro> => {
  const at = Player.$match(state, {
    Idle: () => Option.none<number>(),
    Loading: () => Option.none<number>(),
    Playing: (held) => heldAt(held, number),
    Buffering: (held) => heldAt(held, number),
    Paused: (held) => heldAt(held, number),
    Ended: () => Option.none<number>(),
    Stopped: () => Option.none<number>(),
    Failed: () => Option.none<number>(),
  });
  return at.pipe(
    Option.filter((ms) => first > 0 && ms < first),
    Option.map((ms) => ({ share: Math.max(0, ms) / first, left: first - Math.max(0, ms) })),
  );
};

const heldAt = (
  held: { readonly track: { readonly number: number }; readonly at: number },
  number: number,
): Option.Option<number> =>
  Option.some(held.at * 1000).pipe(Option.filter(() => held.track.number === number));

export const readingOf = (intro: Intro) => ({
  now: Math.floor(intro.share * 100),
  text: `${Math.ceil(intro.left / 1000)} seconds to the first line`,
});
