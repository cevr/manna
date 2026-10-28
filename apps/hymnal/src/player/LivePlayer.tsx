/**
 * The app's one player, over the device's playback (`playback.live.ts`)
 * under the score clock (`sound.ts`), which the Sound setting switches, its
 * seeks counted for the page's follow (`seeks.ts`).
 * It follows the lock screen and Control Center while the app shows it.
 */

import { useAtomMount, useAtomValue } from '@effect/atom-react';
import { Effect, Option, SubscriptionRef } from 'effect';
import { type ReactNode, useEffect } from 'react';

import { book } from '~/follow/book';
import { counted } from '~/follow/seeks';
import { settings } from '~/store';

import { PlayerContext } from './context';
import { playbackLive } from './playback.live';
import { playerOn, statusEvery } from './player';
import { cachedPlayback } from './offline';
import { offlineLive } from '~/offline/live';
import { SaveShown } from '~/offline/Open';

/** Whether the recording sounds, as the score clock reads it: the Sound setting, set at mount. */
const sound = Effect.runSync(SubscriptionRef.make(true));
const player = playerOn(
  counted(cachedPlayback(playbackLive, book.of, sound, offlineLive)),
  statusEvery,
  settings.move,
);
/** The context's one value: a draw again (the Sound switch) hands every reader the same player, so no page draws again for it. */
const provided = Option.some(player);

export function LivePlayer({ children }: { readonly children: ReactNode }) {
  // The commands run for as long as the app does, whichever screen shows.
  useAtomMount(player.send);
  useAtomMount(player.remote);
  useAtomMount(player.keys);
  const on = useAtomValue(settings.sound);
  // The setting is the app's; the score clock is outside React, so it is told each change.
  useEffect(() => Effect.runSync(SubscriptionRef.set(sound, on)), [on]);
  return (
    <PlayerContext value={provided}>
      <SaveShown />
      {children}
    </PlayerContext>
  );
}
