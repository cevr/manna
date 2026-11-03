import type { JSX } from '@solidjs/web';
import { omit, onCleanup, untrack } from 'solid-js';

import { stopEvent } from '../../floating-ui-solid/utils/event.ts';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { useMenuRootContext } from '../../menu/root/MenuRootContext.ts';
import { findRootOwnerId } from '../../menu/utils/isKeyboardOpen.ts';
import { listen } from '../../mix/mix.ts';
import { contains, getTarget, ownerDocument } from '../../utils/dom.ts';
import { pressableTriggerOpenStateMapping } from '../../utils/popupStateMapping.ts';
import {
  LONG_PRESS_DELAY,
  LONG_PRESS_MOVE_THRESHOLD,
  claimPress,
  pressHeldByOther,
} from '../../utils/press.ts';
import { useTimeout } from '../../utils/timers.ts';
import { useContextMenuRootContextStrict } from '../root/ContextMenuRootContext.ts';

interface ContextMenuTriggerState {
  /** Whether the context menu is open. */
  open: boolean;
}

interface ContextMenuTriggerProps extends BaseUIComponentProps<'div', ContextMenuTriggerState> {}

export function ContextMenuTrigger(componentProps: ContextMenuTriggerProps): JSX.Element {
  const contextMenu = useContextMenuRootContextStrict();
  const { store } = useMenuRootContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render');

  let triggerElement: HTMLElement | null = null;
  let touchPosition: { x: number; y: number } | null = null;
  let pressPointer: number | null = null;
  const self = Symbol('context-menu trigger');
  const longPressTimeout = useTimeout();
  const allowMouseUpTimeout = useTimeout();
  let allowMouseUp = false;
  let pressOpened = false;
  let mouseUpAbortController: AbortController | null = null;

  /** Open the menu at `x`, `y`: true when it opened, false when the root's `onOpenChange` cancelled. */
  function handleLongPress(x: number, y: number, event: MouseEvent | TouchEvent): boolean {
    const isTouchEvent = event.type.startsWith('touch');
    contextMenu.initialCursorPointRef.current = { x, y };
    contextMenu.setAnchor({
      getBoundingClientRect() {
        return DOMRect.fromRect({
          width: isTouchEvent ? 10 : 0,
          height: isTouchEvent ? 10 : 0,
          x,
          y,
        });
      },
    });
    allowMouseUp = false;
    const details = createChangeEventDetails(REASONS.triggerPress, event);
    store.setOpen(true, details);
    if (details.isCanceled) {
      return false;
    }
    contextMenu.setOpener(self);
    if (pressPointer !== null) {
      claimPress(pressPointer, self, ownerDocument(triggerElement));
    }
    pressOpened = isTouchEvent;
    allowMouseUpTimeout.start(LONG_PRESS_DELAY, () => {
      allowMouseUp = true;
    });
    return true;
  }

  function handleContextMenu(event: MouseEvent) {
    if (pressTaken()) {
      stopEvent(event);
      return;
    }
    contextMenu.allowMouseUpTriggerRef.current = true;
    if (!handleLongPress(event.clientX, event.clientY, event)) {
      contextMenu.allowMouseUpTriggerRef.current = false;
      return;
    }
    stopEvent(event);
    const doc = ownerDocument(triggerElement);

    mouseUpAbortController?.abort();
    const controller = new AbortController();
    mouseUpAbortController = controller;
    doc.addEventListener(
      'mouseup',
      (mouseEvent) => {
        contextMenu.allowMouseUpTriggerRef.current = false;
        if (!allowMouseUp) {
          return;
        }
        allowMouseUpTimeout.clear();
        allowMouseUp = false;
        const mouseUpTarget = getTarget(mouseEvent) as Element | null;
        if (contains(untrack(store.positionerElement), mouseUpTarget)) {
          return;
        }
        if (mouseUpTarget && findRootOwnerId(mouseUpTarget) === contextMenu.rootId) {
          return;
        }
        store.setOpen(false, createChangeEventDetails(REASONS.cancelOpen, mouseEvent));
      },
      { once: true, signal: controller.signal },
    );
  }

  function cancelLongPress() {
    longPressTimeout.clear();
    touchPosition = null;
  }

  function handleTouchStart(event: TouchEvent) {
    contextMenu.allowMouseUpTriggerRef.current = false;
    pressOpened = false;
    const touch = event.touches[0];
    if (event.touches.length !== 1 || !touch) {
      cancelLongPress();
      return;
    }
    event.stopPropagation();
    const position = { x: touch.clientX, y: touch.clientY };
    touchPosition = position;
    longPressTimeout.start(LONG_PRESS_DELAY, () => {
      if (!pressTaken()) {
        handleLongPress(position.x, position.y, event);
      }
    });
  }

  /** A pending long press whose touch has moved past the threshold to `x`, `y` is cancelled. */
  function cancelIfMoved(x: number, y: number) {
    if (longPressTimeout.isStarted() && touchPosition) {
      const deltaX = Math.abs(x - touchPosition.x);
      const deltaY = Math.abs(y - touchPosition.y);
      if (deltaX > LONG_PRESS_MOVE_THRESHOLD || deltaY > LONG_PRESS_MOVE_THRESHOLD) {
        cancelLongPress();
      }
    }
  }

  /**
   * The finger lifts: a pending long press is cancelled, and the lift of the
   * press that opened the menu is spent, so the browser clicks nothing under
   * the finger (the menu opens at the touch, an item under it).
   */
  function handleTouchEnd(event: TouchEvent) {
    cancelLongPress();
    if (pressOpened) {
      pressOpened = false;
      event.preventDefault();
    }
  }

  function handleTouchMove(event: TouchEvent) {
    const touch = event.touches[0];
    if (event.touches.length !== 1 || !touch) {
      cancelLongPress();
      return;
    }
    cancelIfMoved(touch.clientX, touch.clientY);
  }

  function handlePointerDown(event: PointerEvent) {
    pressPointer = event.pointerType === 'touch' ? event.pointerId : null;
  }

  function handlePointerMove(event: PointerEvent) {
    if (pressPointer === null || event.pointerId !== pressPointer) {
      return;
    }
    if (pressHeldByOther(pressPointer, self)) {
      cancelLongPress();
      return;
    }
    cancelIfMoved(event.clientX, event.clientY);
  }

  /** Whether another (a drag that started) holds the touch press: then the menu does not open on it. */
  function pressTaken(): boolean {
    return pressPointer !== null && pressHeldByOther(pressPointer, self);
  }

  onCleanup(() => {
    mouseUpAbortController?.abort();
  });

  const state: ContextMenuTriggerState = {
    get open() {
      return store.open() && contextMenu.opener() === self;
    },
  };

  return useRenderElement('div', componentProps, {
    state,
    ref: [
      (el: HTMLElement) => {
        triggerElement = el;
      },
      listen('document', 'contextmenu', (event) => {
        const target = getTarget(event) as HTMLElement | null;
        if (contains(contextMenu.internalBackdropRef.current, target)) {
          event.preventDefault();
        }
      }),
    ],
    stateAttributesMapping: pressableTriggerOpenStateMapping,
    props: [
      {
        onContextMenu: handleContextMenu,
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onTouchEnd: handleTouchEnd,
        onTouchCancel: cancelLongPress,
        style: { '-webkit-touch-callout': 'none' },
      },
      elementProps,
    ],
  });
}
