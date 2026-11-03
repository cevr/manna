import { isServer } from '@solidjs/web';
import { onCleanup } from 'solid-js';

/** Run `undo` when the owning component unmounts, in the browser only. */
export const onClientCleanup = (undo: () => void): void => {
  if (!isServer) onCleanup(undo);
};
