import { useAtomSet } from '@effect/atom-react';
import { useEffect } from 'react';

import { beginSession } from '../app';

/**
 * The host adapter that tells the session Today or home is on screen: once
 * a mount of either sees the garden read, after the frame commits, it
 * begins the session, which makes the launch's plan at that instant.
 * `begin` makes nothing once a plan is made, so a later mount keeps the
 * plan of the first show; the first minute mounts neither, so its planting
 * comes before the plan.
 */
export const useSessionBegunWhenShown = (read: boolean) => {
  const begin = useAtomSet(beginSession);
  useEffect(() => {
    if (read) begin();
  }, [read, begin]);
};
