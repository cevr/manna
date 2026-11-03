import { useAtomSet } from '@effect/atom-react';
import { Option } from 'effect';
import { createContext, use, useLayoutEffect } from 'react';

import { raised } from './bar';
import type { HymnPlayer } from './player';

export const PlayerContext = createContext<Option.Option<HymnPlayer>>(Option.none());

export const usePlayer = () => use(PlayerContext);

export const FindRoom = createContext<number>(0);

export const useFindRoom = () => use(FindRoom);

export const useRaised = (open: boolean) => {
  const set = useAtomSet(raised);
  useLayoutEffect(() => {
    if (!open) return;
    set((count) => count + 1);
    return () => set((count) => count - 1);
  }, [open, set]);
};
