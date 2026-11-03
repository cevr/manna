import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, onCleanup, untrack } from 'solid-js';

import type { ToastManager } from './createToastManager.ts';
import { ToastStore } from './store.ts';
import { ToastContext, type ToastContextValue } from './ToastProviderContext.ts';

interface ToastProviderProps {
  children?: JSX.Element;
  limit?: number | undefined;
  toastManager?: ToastManager | undefined;
}

export function ToastProvider(props: ToastProviderProps): JSX.Element {
  const store = new ToastStore({
    limit: untrack(() => props.limit ?? 3),
    viewport: null,
    toasts: [],
    hovering: false,
    focused: false,
    isWindowFocused: true,
    prevFocusElement: null,
  });

  const [state, setState] = createSignal(store.state, { ownedWrite: true });
  const unsubscribe = store.subscribe(() => setState(() => store.state));
  onCleanup(() => {
    unsubscribe();
    store.dispose();
  });

  createEffect(
    () => props.limit ?? 3,
    (limit) => {
      store.setLimit(limit);
    },
  );

  createEffect(
    () => props.toastManager,
    (toastManager) => {
      if (!toastManager) {
        return undefined;
      }
      return toastManager[' subscribe']((event) => {
        if (event.action === 'close') {
          store.closeToast(event.options.id);
        } else {
          store.addToast(event.options);
        }
      });
    },
  );

  const context: ToastContextValue = { store, state };

  return <ToastContext value={context}>{props.children}</ToastContext>;
}
