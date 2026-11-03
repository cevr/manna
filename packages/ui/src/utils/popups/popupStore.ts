import { type Accessor, createSignal, flush, untrack } from 'solid-js';

import {
  createFloatingRootContext,
  type FloatingRootContext,
  type ReferenceType,
} from '../../floating-ui-solid/FloatingRootContext.ts';
import { FOCUSABLE_ATTRIBUTE } from '../../floating-ui-solid/utils/element.ts';
import { getTabbableNearElement, isOutsideEvent } from '../../floating-ui-solid/utils/tabbable.ts';
import {
  type BaseUIChangeEventDetails,
  createChangeEventDetails,
} from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import { createUnmountAfterClose, type TransitionStatus } from '../../internals/transitions.ts';

export const FOCUSABLE_POPUP_PROPS = {
  tabindex: -1,
  [FOCUSABLE_ATTRIBUTE]: '',
};

type Ref<T> = { current: T };

interface PopupStoreOptions {
  openProp?: (() => boolean | undefined) | undefined;
  floatingId: string;
  popupIsFloatingElement?: boolean | undefined;
  onOpenChange: (open: boolean, details: BaseUIChangeEventDetails) => void;
  onOpenChangeComplete?: (() => ((open: boolean) => void) | undefined) | undefined;
}

export interface PopupStore {
  open: Accessor<boolean>;
  mounted: Accessor<boolean>;
  transitionStatus: Accessor<TransitionStatus>;
  activeTriggerElement: Accessor<Element | null>;
  popupElement: Accessor<HTMLElement | null>;
  setPopupElement: (element: HTMLElement | null) => void;
  positionerElement: Accessor<HTMLElement | null>;
  setPositionerElement: (element: HTMLElement | null) => void;
  floatingRootContext: FloatingRootContext;
  floatingId: string;
  popupId: () => string | undefined;
  applyOpenState: (open: boolean, trigger: Element | undefined) => void;
  readonly onOpenChangeComplete: (open: boolean) => void;
  readonly triggerFocusTargetRef: Ref<HTMLElement | null>;
  readonly beforeTriggerFocusGuardRef: Ref<HTMLElement | null>;
  readonly beforeContentFocusGuardRef: Ref<HTMLElement | null>;
}

export function createPopupStore(options: PopupStoreOptions): PopupStore {
  const [ownOpen, setOwnOpen] = createSignal(false, { ownedWrite: true });
  const open = () => options.openProp?.() ?? ownOpen();
  const [activeTrigger, setActiveTrigger] = createSignal<Element | null>(null, {
    ownedWrite: true,
  });
  const [popupElement, setPopupElement] = createSignal<HTMLElement | null>(null, {
    ownedWrite: true,
  });
  const [positionerElement, setPositionerElement] = createSignal<HTMLElement | null>(null, {
    ownedWrite: true,
  });

  const onOpenChangeComplete = (isOpen: boolean) => {
    untrack(() => options.onOpenChangeComplete?.())?.(isOpen);
  };

  const status = createUnmountAfterClose({
    open,
    element: popupElement,
    onUnmount() {
      setActiveTrigger(null);
      onOpenChangeComplete(false);
    },
  });

  const activeTriggerElement = () => (status.mounted() ? activeTrigger() : null);

  const floatingRootContext = createFloatingRootContext({
    open,
    referenceElement: activeTriggerElement as Accessor<ReferenceType | null>,
    floatingElement: options.popupIsFloatingElement ? popupElement : positionerElement,
    onOpenChange: (next, details) => options.onOpenChange(next, details),
  });

  const popupId = () => popupElement()?.id || options.floatingId || undefined;

  return {
    open,
    mounted: status.mounted,
    transitionStatus: status.transitionStatus,
    activeTriggerElement,
    popupElement,
    setPopupElement: (element) => setPopupElement(() => element),
    positionerElement,
    setPositionerElement: (element) => setPositionerElement(() => element),
    floatingRootContext,
    floatingId: options.floatingId,
    popupId,
    applyOpenState(nextOpen, trigger) {
      if (trigger || nextOpen) {
        setActiveTrigger(() => trigger ?? null);
      }
      setOwnOpen(nextOpen);
    },
    onOpenChangeComplete,
    triggerFocusTargetRef: { current: null },
    beforeTriggerFocusGuardRef: { current: null },
    beforeContentFocusGuardRef: { current: null },
  };
}

export function useTriggerFocusGuards(
  store: Pick<
    PopupStore,
    'positionerElement' | 'beforeContentFocusGuardRef' | 'beforeTriggerFocusGuardRef'
  > & {
    setOpen(open: boolean, eventDetails: BaseUIChangeEventDetails): void;
  },
  triggerElement: () => HTMLElement | null,
) {
  function closeAndFocus(event: FocusEvent, direction: 1 | -1) {
    const guard = event.currentTarget as HTMLElement;
    const positionerElement = untrack(store.positionerElement);
    store.setOpen(false, createChangeEventDetails(REASONS.focusOut, event, guard));
    flush();
    getTabbableNearElement(
      guard.isConnected ? guard : triggerElement(),
      direction,
      positionerElement,
    )?.focus();
  }

  return {
    handlePreFocusGuardFocus(event: FocusEvent) {
      closeAndFocus(event, -1);
    },
    handleFocusTargetFocus(event: FocusEvent) {
      const positionerElement = untrack(store.positionerElement);
      if (positionerElement && isOutsideEvent(event, positionerElement)) {
        store.beforeContentFocusGuardRef.current?.focus();
      } else {
        closeAndFocus(event, 1);
      }
    },
  };
}
