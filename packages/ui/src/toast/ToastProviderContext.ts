import { type Accessor, createContext, createMemo, useContext } from 'solid-js';

import type { State, ToastStore } from './store.ts';

export interface ToastContextValue {
  store: ToastStore;
  state: Accessor<State>;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToastProviderContext(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('Base UI: useToastManager must be used within <Toast.Provider>.');
  }
  return context;
}

export function useToastSelector<T>(
  context: ToastContextValue,
  selector: (state: State) => T,
): Accessor<T> {
  return createMemo(() => selector(context.state()));
}
