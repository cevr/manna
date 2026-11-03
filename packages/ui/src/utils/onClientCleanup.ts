import { isServer } from '@solidjs/web';
import { onCleanup } from 'solid-js';

export const onClientCleanup = (undo: () => void): void => {
  if (!isServer) onCleanup(undo);
};
