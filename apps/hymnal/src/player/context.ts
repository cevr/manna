/**
 * The player the screens use: the device's own in the app (`LivePlayer`),
 * or one a test hands in. With none provided, the player's controls draw
 * nothing.
 */

import { useAtomSet } from '@effect/atom-react';
import { Option } from 'effect';
import { createContext, use, useLayoutEffect } from 'react';

import { raised } from './bar';
import type { HymnPlayer } from './player';

export const PlayerContext = createContext<Option.Option<HymnPlayer>>(Option.none());

export const usePlayer = () => use(PlayerContext);

/** How far the bar's `#` stands over a list screen's bottom edge (`findRoom`), so a list's end clears it: none with no `#`. */
export const FindRoom = createContext<number>(0);

export const useFindRoom = () => use(FindRoom);

/**
 * Counts a control that rises over the bar (`raised`) while `open`, so the
 * bar's `#` gives way to it (`findAt`); the count drops again as it closes
 * or leaves the screen.
 */
export const useRaised = (open: boolean) => {
  const set = useAtomSet(raised);
  useLayoutEffect(() => {
    if (!open) return;
    set((count) => count + 1);
    return () => set((count) => count - 1);
  }, [open, set]);
};
