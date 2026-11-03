import type { JSX } from '@solidjs/web';
import { omit, untrack } from 'solid-js';

import { FloatingFocusManager } from '../../floating-ui-solid/FloatingFocusManager.tsx';
import { COMPOSITE_KEYS } from '../../internals/composite/composite.ts';
import { type TransitionStatus, useOpenChangeComplete } from '../../internals/transitions.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { FOCUSABLE_POPUP_PROPS } from '../../utils/popups/popupStore.ts';
import { onClientCleanup } from '../../utils/onClientCleanup.ts';
import { popupTransitionStateMapping } from '../../utils/popupStateMapping.ts';
import { useDialogPortalContext } from '../portal/DialogPortal.tsx';
import { useDialogRootContext } from '../root/DialogRootContext.ts';
import type { DialogStore } from '../store/DialogStore.ts';

interface DialogPopupState {
  open: boolean;
  transitionStatus: TransitionStatus;
}

interface DialogPopupProps extends BaseUIComponentProps<'div', DialogPopupState> {}

function stopCompositeKeys(event: KeyboardEvent) {
  if (COMPOSITE_KEYS.has(event.key)) {
    event.stopPropagation();
  }
}

interface DialogPopupFocusProps {
  store: DialogStore;
  children: JSX.Element;
}

function DialogPopupFocus(props: DialogPopupFocusProps): JSX.Element {
  const store = props.store;
  return (
    <FloatingFocusManager
      context={store.floatingRootContext}
      openInteractionType={null}
      disabled={!store.mounted()}
      closeOnFocusOut={!store.disablePointerDismissal()}
      modal={store.modal()}
      restoreFocus="popup"
    >
      {props.children}
    </FloatingFocusManager>
  );
}

function dialogPopupProps(store: DialogStore, componentProps: Pick<DialogPopupProps, 'id'>) {
  return {
    get id() {
      return componentProps.id || store.floatingId;
    },
    get 'aria-labelledby'() {
      return store.titleElementId();
    },
    get 'aria-describedby'() {
      return store.descriptionElementId();
    },
    role: 'dialog',
    ...FOCUSABLE_POPUP_PROPS,
    onKeyDown: stopCompositeKeys,
  };
}

function useDialogOpenChangeComplete(store: DialogStore) {
  useOpenChangeComplete({
    open: store.open,
    element: store.popupElement,
    onComplete() {
      if (untrack(store.open)) {
        store.onOpenChangeComplete(true);
      }
    },
  });
}

export function DialogPopup(componentProps: DialogPopupProps): JSX.Element {
  const { store, popupProps } = useDialogRootContext();
  useDialogPortalContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'id');

  useDialogOpenChangeComplete(store);
  onClientCleanup(() => store.setPopupElement(null));

  const state: DialogPopupState = {
    get open() {
      return store.open();
    },
    get transitionStatus() {
      return store.transitionStatus();
    },
  };

  const element = () =>
    useRenderElement('div', componentProps, {
      state,
      ref: (el: HTMLElement) => store.setPopupElement(el),
      stateAttributesMapping: popupTransitionStateMapping,
      props: [popupProps, dialogPopupProps(store, componentProps), elementProps],
    });

  return <DialogPopupFocus store={store}>{untrack(element)}</DialogPopupFocus>;
}
