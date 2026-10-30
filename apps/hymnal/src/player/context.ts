/**
 * The player the screens use: the device's own in the app (`LivePlayer`),
 * or one a test hands in. With none provided, the player's controls draw
 * nothing.
 */

import { Option } from 'effect';
import { createContext, use } from 'react';

import type { HymnPlayer } from './player';

export const PlayerContext = createContext<Option.Option<HymnPlayer>>(Option.none());

export const usePlayer = () => use(PlayerContext);

/** How far the bar's `#` stands over a list screen's bottom edge (`findRoom`), so a list's end clears it: none with no `#`. */
export const FindRoom = createContext<number>(0);

export const useFindRoom = () => use(FindRoom);
