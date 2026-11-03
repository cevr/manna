import { type Accessor, createContext, useContext } from 'solid-js';

import type { ToastObject } from './types.ts';

export interface ToastRootContextValue {
  toast: Accessor<ToastObject<object>>;
  setTitleId: (updater: (current: string | undefined) => string | undefined) => void;
  visibleIndex: Accessor<number>;
  expanded: Accessor<boolean>;
}

export const ToastRootContext = createContext<ToastRootContextValue | null>(null);

export function useToastRootContext(): ToastRootContextValue {
  const context = useContext(ToastRootContext);
  if (!context) {
    throw new Error(
      'Base UI: ToastRootContext is missing. Toast parts must be used within <Toast.Root>.',
    );
  }
  return context;
}
