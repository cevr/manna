import type { ToastManagerAddOptions, ToastObject } from './types.ts';
import { generateToastId } from './utils.ts';

type ToastManagerEvent =
  | { action: 'add'; options: ToastObject<object> }
  | { action: 'close'; options: { id: string } };

export interface ToastManager<Data extends object = object> {
  ' subscribe': (listener: (event: ToastManagerEvent) => void) => () => void;
  add: <T extends Data = Data>(options: ToastManagerAddOptions<T>) => string;
  close: (id: string) => void;
}

export function createToastManager<Data extends object = object>(): ToastManager<Data> {
  const listeners = new Set<(event: ToastManagerEvent) => void>();

  function emit(event: ToastManagerEvent) {
    listeners.forEach((listener) => listener(event));
  }

  return {
    ' subscribe': function subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    add(options) {
      const id = options.id || generateToastId();
      emit({
        action: 'add',
        options: { ...options, id, transitionStatus: 'starting' } as ToastObject<object>,
      });
      return id;
    },

    close(id) {
      emit({ action: 'close', options: { id } });
    },
  };
}
