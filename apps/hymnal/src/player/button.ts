import { Array as Arr, Option } from 'effect';

import { playerFor } from './bar';
import { Command, Player, type Track } from './player';

export type Kind = 'play' | 'pause' | 'again' | 'retry' | 'loading';

export type Mark = Exclude<Kind, 'loading'> | 'sound-on' | 'sound-off';

export interface Button {
  readonly kind: Kind;
  readonly label: string;
  readonly command: Option.Option<Command>;
}

const button = (kind: Kind, label: string, command: Command): Button => ({
  kind,
  label,
  command: Option.some(command),
});

const loading = (n: number): Button => ({
  kind: 'loading',
  label: `Loading hymn ${n}`,
  command: Option.none(),
});

export const buttonsOf = (state: Player, track: Track): ReadonlyArray<Button> => {
  const n = track.number;
  const play = (command: Command) => button('play', `Play hymn ${n}`, command);
  const pause = button('pause', `Pause hymn ${n}`, Command.Pause());
  const retry = button('retry', `Retry hymn ${n}`, Command.Resume());
  return Player.$match(playerFor(state, track), {
    Idle: () => [play(Command.Start({ track }))],
    Loading: () => [loading(n)],
    Playing: () => [pause],
    Buffering: ({ retry: offered }) => [...Arr.filter([retry], () => offered), pause],
    Paused: () => [play(Command.Resume())],
    Ended: () => [button('again', `Play hymn ${n} again`, Command.Resume())],
    Stopped: () => [play(Command.Resume())],
    Failed: () => [retry],
  });
};
