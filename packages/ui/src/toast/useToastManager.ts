import { createMemo } from 'solid-js';

import type { ToastObject } from './types.ts';
import { useToastProviderContext } from './ToastProviderContext.ts';

interface UseToastManagerReturnValue<Data extends object = object> {
  readonly toasts: ToastObject<Data>[];
}

/** Returns the array of toasts. */
export function useToastManager<Data extends object = object>(): UseToastManagerReturnValue<Data> {
  const { state } = useToastProviderContext();
  const toasts = createMemo(() => state().toasts);

  return {
    get toasts() {
      return toasts() as ToastObject<Data>[];
    },
  };
}
