import type { JSX } from '@solidjs/web';

export const TYPEAHEAD_RESET_MS = 500;

export const ownerVisuallyHidden: JSX.CSSProperties = {
  'clip-path': 'inset(50%)',
  position: 'fixed',
  top: '0',
  left: '0',
};
