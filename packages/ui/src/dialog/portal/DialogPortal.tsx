import type { JSX } from '@solidjs/web';
import { createContext, onCleanup, Show, useContext } from 'solid-js';

import {
  FloatingPortal,
  type FloatingPortalProps,
} from '../../floating-ui-solid/FloatingPortal.tsx';
import { InternalBackdrop } from '../../utils/FocusGuard.tsx';
import { useDialogRootContext } from '../root/DialogRootContext.ts';

const DialogPortalContext = createContext(false);

export function useDialogPortalContext(): void {
  if (!useContext(DialogPortalContext)) {
    throw new Error('Base UI: <Dialog.Portal> is missing.');
  }
}

interface DialogPortalProps extends FloatingPortalProps {}

export function DialogPortal(props: DialogPortalProps): JSX.Element {
  const { store } = useDialogRootContext();

  function ModalBackdrop() {
    onCleanup(() => {
      store.internalBackdropRef.current = null;
    });
    return (
      <InternalBackdrop
        ref={(el: HTMLDivElement) => {
          store.internalBackdropRef.current = el;
        }}
        inert={!store.open() || undefined}
      />
    );
  }

  return (
    <Show when={store.mounted()}>
      <DialogPortalContext value={true}>
        <FloatingPortal {...props}>
          <Show when={store.modal()}>
            <ModalBackdrop />
          </Show>
          {props.children}
        </FloatingPortal>
      </DialogPortalContext>
    </Show>
  );
}
