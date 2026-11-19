/** Each state of the player but a failure, by its tag. */
type Settled = 'Idle' | 'Loading' | 'Playing' | 'Buffering' | 'Paused' | 'Ended' | 'Stopped';

/** A player's state as its caption reads it: its tag, and for a failure whether the device is offline. */
export type Captioned =
  | { readonly _tag: Settled }
  | { readonly _tag: 'Failed'; readonly offline: boolean };

/** Each state's line but a failure's. */
const SAID: Readonly<Record<Settled, string>> = {
  Idle: 'Recording',
  Loading: 'Loading the recording…',
  Playing: 'Playing',
  Buffering: 'Loading the recording…',
  Paused: 'Paused',
  Ended: 'Played to the end',
  Stopped: 'Paused',
};

/** What the player is doing, in a line under its hymn. */
export const captionOf = (player: Captioned): string => {
  if (player._tag !== 'Failed') return SAID[player._tag];
  if (player.offline) return 'The recording needs a connection.';
  return 'The recording could not be played.';
};
