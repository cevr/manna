/**
 * The root's hold on the reader's appearance: every screen is drawn under
 * it (`showAppearance`, `src/look.tsx`) and the interface style is set to
 * it (`applyStyle`, `./host`), in the commit that first shows it, before
 * that frame is seen. When the root leaves, the screens are drawn under
 * System again; the interface style stays the choice's.
 */

import { useLayoutEffect } from 'react';

import type { Choice } from '../appearance';
import { showAppearance } from '../look';
import { applyStyle } from './host';

/** Shows `choice` on every screen and in the interface style from the commit that holds it. */
export const useAppearanceShown = (choice: Choice) => {
  useLayoutEffect(() => {
    showAppearance(choice);
    applyStyle(choice);
  }, [choice]);
  useLayoutEffect(
    () => () => {
      showAppearance('system');
    },
    [],
  );
};
