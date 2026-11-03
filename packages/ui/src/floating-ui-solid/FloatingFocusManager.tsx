import { getNodeName, isHTMLElement } from '@floating-ui/utils/dom';
import type { JSX } from '@solidjs/web';
import { createEffect, onCleanup, Show, untrack } from 'solid-js';

import { createChangeEventDetails } from '../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../internals/reasons.ts';
import type { FloatingUIOpenChangeDetails } from '../internals/types.ts';
import {
  activeElement,
  addEventListener,
  contains,
  getTarget,
  mergeCleanups,
  ownerDocument,
  ownerWindow,
} from '../utils/dom.ts';
import { FocusGuard } from '../utils/FocusGuard.tsx';
import { platform } from '../utils/platform.ts';
import { useAnimationFrame, useTimeout } from '../utils/timers.ts';
import type { FloatingRootContext } from './FloatingRootContext.ts';
import { type MaybeRef, resolveRef, usePortalContext } from './FloatingPortal.tsx';
import { isElementVisible } from './utils/composite.ts';
import {
  createAttribute,
  getFloatingFocusElement,
  isTextField,
  isTypeableElement,
} from './utils/element.ts';
import { enqueueFocus, isVirtualClick, isVirtualPointerEvent, stopEvent } from './utils/event.ts';
import { markOthers } from './utils/markOthers.ts';
import {
  type FocusableElement,
  focusable,
  getNextTabbable,
  getPreviousTabbable,
  isOutsideEvent,
  isTabbable,
  tabbable,
} from './utils/tabbable.ts';

export type InteractionType = 'mouse' | 'touch' | 'pen' | 'keyboard' | '';

function getEventType(
  event: Event | undefined,
  lastInteractionType?: InteractionType,
): InteractionType {
  if (!event) {
    return lastInteractionType || '';
  }
  const win = ownerWindow(getTarget(event) as Element | null);
  if (event instanceof win.KeyboardEvent) {
    return 'keyboard';
  }
  if (event instanceof win.FocusEvent) {
    return lastInteractionType || 'keyboard';
  }
  if ('pointerType' in event) {
    return (
      ((event as PointerEvent).pointerType as InteractionType) ||
      (isVirtualClick(event as PointerEvent) ? 'keyboard' : lastInteractionType || 'mouse')
    );
  }
  if ('touches' in event) {
    return 'touch';
  }
  if (event instanceof win.MouseEvent) {
    return lastInteractionType || (event.detail === 0 ? 'keyboard' : 'mouse');
  }
  return '';
}

const LIST_LIMIT = 20;
let previouslyFocusedElements: WeakRef<Element>[] = [];

function clearDisconnectedPreviouslyFocusedElements() {
  previouslyFocusedElements = previouslyFocusedElements.filter(
    (entry) => entry.deref()?.isConnected,
  );
}

function addPreviouslyFocusedElement(element: Element | null | undefined) {
  clearDisconnectedPreviouslyFocusedElements();
  if (element && getNodeName(element) !== 'body') {
    previouslyFocusedElements.push(new WeakRef(element));
    if (previouslyFocusedElements.length > LIST_LIMIT) {
      previouslyFocusedElements = previouslyFocusedElements.slice(-LIST_LIMIT);
    }
  }
}

function getPreviouslyFocusedElement() {
  clearDisconnectedPreviouslyFocusedElements();
  return previouslyFocusedElements[previouslyFocusedElements.length - 1]?.deref();
}

function getFirstTabbableElement(container: Element | null) {
  if (!container) {
    return null;
  }
  if (isTabbable(container)) {
    return container;
  }
  return tabbable(container)[0] || container;
}

function handleTabIndex(floatingFocusElement: HTMLElement) {
  if (
    floatingFocusElement.hasAttribute('tabindex') &&
    !floatingFocusElement.hasAttribute('data-tabindex')
  ) {
    return;
  }
  if (!floatingFocusElement.getAttribute('role')?.includes('dialog')) {
    return;
  }
  const tabbableContent = focusable(floatingFocusElement).filter((element: Element) => {
    const dataTabIndex = element.getAttribute('data-tabindex') || '';
    const managed = element.hasAttribute('data-tabindex') && !dataTabIndex.startsWith('-');
    return isTabbable(element) || managed;
  });
  const tabIndex = floatingFocusElement.getAttribute('tabindex');
  if (tabbableContent.length === 0) {
    if (tabIndex !== '0') {
      floatingFocusElement.setAttribute('tabindex', '0');
      floatingFocusElement.setAttribute('data-tabindex', '0');
    }
  } else if (
    tabIndex !== '-1' ||
    (floatingFocusElement.hasAttribute('data-tabindex') &&
      floatingFocusElement.getAttribute('data-tabindex') !== '-1')
  ) {
    floatingFocusElement.setAttribute('tabindex', '-1');
    floatingFocusElement.setAttribute('data-tabindex', '-1');
  }
}

type FocusTarget =
  | boolean
  | MaybeRef<HTMLElement | null>
  | ((interactionType: InteractionType) => boolean | HTMLElement | null | void);

interface FloatingFocusManagerProps {
  children?: JSX.Element;
  context: FloatingRootContext;
  openInteractionType?: InteractionType | null | undefined;
  disabled?: boolean | undefined;
  initialFocus?: FocusTarget | undefined;
  restoreFocus?: boolean | 'popup' | undefined;
  modal?: boolean | undefined;
  closeOnFocusOut?: boolean | undefined;
  nextFocusableElement?: MaybeRef<HTMLElement | null> | null | undefined;
  previousFocusableElement?: MaybeRef<HTMLElement | null> | null | undefined;
  beforeContentFocusGuardRef?: { current: HTMLSpanElement | null } | undefined;
  getInsideElements?: (() => Array<Element | null | undefined>) | undefined;
}

export function FloatingFocusManager(props: FloatingFocusManagerProps): JSX.Element {
  const context = props.context;
  const { events, dataRef } = context;
  const portalContext = usePortalContext();

  const disabled = () => props.disabled ?? false;
  const modal = () => props.modal ?? true;
  const closeOnFocusOut = () => props.closeOnFocusOut ?? true;
  const restoreFocus = () => props.restoreFocus ?? false;
  const initialFocus = () => props.initialFocus ?? true;
  const openInteractionType = () =>
    props.openInteractionType === undefined ? '' : props.openInteractionType;
  const floatingFocusElement = () => getFloatingFocusElement(context.floatingElement());

  let preventReturnFocus = false;
  let isPointerDown = false;
  let pointerDownOutside = false;
  let focusOutHandledByPortal = false;
  let lastFocusedTabbable: FocusableElement | null = null;
  let closeType: InteractionType = '';
  let lastInteractionType: InteractionType = '';
  let pendingReturnFocus: { cancelled: boolean } | null = null;

  const shouldRenderGuards = () => !disabled() && (!!portalContext || modal());

  const beforeGuardRef: { current: HTMLSpanElement | null } = { current: null };
  let afterGuardElement: HTMLSpanElement | null = null;
  const afterGuardRef: { current: HTMLSpanElement | null } = {
    get current() {
      return untrack(shouldRenderGuards) ? afterGuardElement : null;
    },
    set current(element) {
      afterGuardElement = element;
    },
  };

  const blurTimeout = useTimeout();
  const pointerDownTimeout = useTimeout();
  const restoreFocusFrame = useAnimationFrame();

  const getTabbableContent = (container: Element | null = untrack(floatingFocusElement)) =>
    container ? tabbable(container) : [];

  const getResolvedInsideElements = () =>
    props.getInsideElements?.().filter((element): element is Element => element != null) ?? [];

  createEffect(
    () => [disabled(), modal(), context.floatingElement()] as const,
    ([isDisabled, isModal, floating]) => {
      const focusElement = getFloatingFocusElement(floating);
      if (isDisabled || !isModal) {
        return undefined;
      }
      return addEventListener(ownerDocument(focusElement), 'keydown', (event: KeyboardEvent) => {
        if (
          event.key === 'Tab' &&
          contains(focusElement, activeElement(ownerDocument(focusElement))) &&
          getTabbableContent(focusElement).length === 0
        ) {
          stopEvent(event);
        }
      });
    },
  );

  createEffect(
    () =>
      [
        disabled(),
        context.open(),
        context.floatingElement(),
        context.domReferenceElement(),
      ] as const,
    ([isDisabled, open, floating, domReference]) => {
      const focusElement = getFloatingFocusElement(floating);
      if (isDisabled || !open) {
        return undefined;
      }
      const doc = ownerDocument(focusElement);
      const clearPointerDownOutside = () => {
        pointerDownOutside = false;
      };
      const onPointerDown = (event: PointerEvent) => {
        const target = getTarget(event) as Element | null;
        const pointerTargetInside =
          contains(floating, target) ||
          contains(domReference, target) ||
          contains(portalContext?.portalNode(), target) ||
          getResolvedInsideElements().some(
            (element) => element === target || contains(element, target),
          );
        pointerDownOutside = !pointerTargetInside;
        lastInteractionType = (event.pointerType as InteractionType) || 'keyboard';
      };
      const onKeyDown = () => {
        lastInteractionType = 'keyboard';
      };
      return mergeCleanups(
        addEventListener(doc, 'pointerdown', onPointerDown, true),
        addEventListener(doc, 'pointerup', clearPointerDownOutside, true),
        addEventListener(doc, 'pointercancel', clearPointerDownOutside, true),
        addEventListener(doc, 'keydown', onKeyDown, true),
        clearPointerDownOutside,
      );
    },
  );

  createEffect(
    () =>
      [
        disabled(),
        closeOnFocusOut(),
        context.domReferenceElement(),
        context.floatingElement(),
        modal(),
        restoreFocus(),
      ] as const,
    ([isDisabled, closeOnOut, domReference, floating, isModal, restore]) => {
      const focusElement = getFloatingFocusElement(floating);
      if (isDisabled || !closeOnOut) {
        return undefined;
      }
      const doc = ownerDocument(focusElement);

      const handlePointerDown = () => {
        isPointerDown = true;
        pointerDownTimeout.start(0, () => {
          isPointerDown = false;
        });
      };

      const handleFocusIn = (event: FocusEvent) => {
        const target = getTarget(event) as FocusableElement | null;
        if (isTabbable(target)) {
          lastFocusedTabbable = target;
        }
      };

      const handleFocusOutside = (event: FocusEvent) => {
        const relatedTarget = event.relatedTarget as HTMLElement | null;
        const currentTarget = event.currentTarget;
        const target = getTarget(event) as HTMLElement | null;

        if (isModal && relatedTarget == null && target != null && contains(floating, target)) {
          addPreviouslyFocusedElement(target);
        }

        queueMicrotask(() => {
          const insideElements = getResolvedInsideElements();
          const isRelatedFocusGuard =
            relatedTarget?.hasAttribute(createAttribute('focus-guard')) &&
            [
              beforeGuardRef.current,
              afterGuardRef.current,
              portalContext?.beforeInsideRef.current,
              portalContext?.afterInsideRef.current,
              portalContext?.beforeOutsideRef.current,
              portalContext?.afterOutsideRef.current,
              resolveRef(props.previousFocusableElement),
              resolveRef(props.nextFocusableElement),
            ].includes(relatedTarget);

          const movedToUnrelatedNode = !(
            contains(domReference, relatedTarget) ||
            contains(floating, relatedTarget) ||
            contains(relatedTarget, floating) ||
            contains(portalContext?.portalNode(), relatedTarget) ||
            insideElements.some(
              (element) => element === relatedTarget || contains(element, relatedTarget),
            ) ||
            isRelatedFocusGuard
          );

          if (currentTarget === domReference && focusElement) {
            handleTabIndex(focusElement);
          }

          if (
            restore &&
            currentTarget !== domReference &&
            !isElementVisible(target) &&
            activeElement(doc) === doc.body
          ) {
            if (isHTMLElement(focusElement)) {
              focusElement.focus();
              if (restore === 'popup') {
                restoreFocusFrame.request(() => focusElement.focus());
                return;
              }
            }
            const tabbableContent = getTabbableContent(focusElement) as Array<Element | null>;
            const nodeToFocus =
              (lastFocusedTabbable && tabbableContent.includes(lastFocusedTabbable)
                ? lastFocusedTabbable
                : null) ||
              tabbableContent[tabbableContent.length - 1] ||
              focusElement;
            if (isHTMLElement(nodeToFocus)) {
              nodeToFocus.focus();
            }
          }

          if (focusOutHandledByPortal) {
            focusOutHandledByPortal = false;
            return;
          }

          if (
            !isModal &&
            relatedTarget &&
            movedToUnrelatedNode &&
            !isPointerDown &&
            relatedTarget !== getPreviouslyFocusedElement()
          ) {
            preventReturnFocus = true;
            context.setOpen(false, createChangeEventDetails(REASONS.focusOut, event));
          }
        });
      };

      const markFocusOutHandledByPortal = () => {
        if (pointerDownOutside) {
          return;
        }
        focusOutHandledByPortal = true;
        blurTimeout.start(0, () => {
          focusOutHandledByPortal = false;
        });
      };

      const domReferenceElement = isHTMLElement(domReference) ? domReference : null;
      if (!floating && !domReferenceElement) {
        return undefined;
      }

      return mergeCleanups(
        domReferenceElement
          ? addEventListener(domReferenceElement, 'focusout', handleFocusOutside)
          : undefined,
        domReferenceElement
          ? addEventListener(domReferenceElement, 'pointerdown', handlePointerDown)
          : undefined,
        floating ? addEventListener(floating, 'focusin', handleFocusIn) : undefined,
        floating ? addEventListener(floating, 'focusout', handleFocusOutside) : undefined,
        floating && portalContext
          ? addEventListener(floating, 'focusout', markFocusOutHandledByPortal, true)
          : undefined,
      );
    },
  );

  createEffect(
    () =>
      [
        disabled(),
        context.floatingElement(),
        context.open(),
        modal(),
        portalContext?.portalNode() ?? null,
        untrack(() => props.previousFocusableElement),
        untrack(() => props.nextFocusableElement),
      ] as const,
    ([isDisabled, floating, open, isModal, portalNode, previousFocusable, nextFocusable]) => {
      if (isDisabled || !floating || !open) {
        return undefined;
      }
      const portalNodes = Array.from(
        portalNode?.querySelectorAll(`[${createAttribute('portal')}]`) || [],
      );
      const insideElements = [
        floating,
        ...portalNodes,
        beforeGuardRef.current,
        afterGuardRef.current,
        portalContext?.beforeOutsideRef.current,
        portalContext?.afterOutsideRef.current,
        ...getResolvedInsideElements(),
        resolveRef(previousFocusable ?? null),
        resolveRef(nextFocusable ?? null),
      ].filter((x): x is Element => x != null);
      const ariaHiddenCleanup = markOthers(insideElements, { ariaHidden: isModal, mark: false });
      const markerCleanup = markOthers(
        [floating, ...portalNodes].filter((x): x is Element => x != null),
      );
      return () => {
        markerCleanup();
        ariaHiddenCleanup();
      };
    },
  );

  createEffect(
    () => [context.open(), disabled(), context.floatingElement()] as const,
    ([open, isDisabled, floating]) => {
      const focusElement = getFloatingFocusElement(floating);
      if (!open || isDisabled || !isHTMLElement(focusElement)) {
        return;
      }
      closeType = '';
      lastInteractionType = '';
      const doc = ownerDocument(focusElement);
      const previouslyFocusedElement = activeElement(doc);

      queueMicrotask(() => {
        const initial = untrack(initialFocus);
        const resolvedInitialFocus =
          typeof initial === 'function' ? initial(untrack(openInteractionType) || '') : initial;
        if (resolvedInitialFocus === undefined || resolvedInitialFocus === false) {
          return;
        }
        if (contains(focusElement, previouslyFocusedElement)) {
          return;
        }
        let focusableElements: FocusableElement[] | null = null;
        const getDefaultFocusElement = () => {
          focusableElements ??= getTabbableContent(focusElement);
          return focusableElements[0] || focusElement;
        };
        let elToFocus: FocusableElement | null | undefined =
          resolvedInitialFocus === true || resolvedInitialFocus === null
            ? getDefaultFocusElement()
            : resolveRef(resolvedInitialFocus);
        elToFocus = elToFocus || getDefaultFocusElement();
        const hadFocusInside = contains(focusElement, activeElement(doc));
        const openEvent = dataRef.current.openEvent;
        const openedByVirtualPress =
          openEvent?.type === 'mousedown' && isVirtualClick(openEvent as MouseEvent);
        const target = elToFocus;
        enqueueFocus(target, {
          sync: openedByVirtualPress,
          preventScroll: target === focusElement,
          shouldFocus() {
            if (!untrack(context.open)) {
              return false;
            }
            if (hadFocusInside) {
              return true;
            }
            const current = activeElement(doc);
            return !(current !== target && contains(focusElement, current));
          },
        });
      });
    },
  );

  createEffect(
    () => [disabled(), context.floatingElement(), context.domReferenceElement()] as const,
    ([isDisabled, floating, domReference]) => {
      const focusElement = getFloatingFocusElement(floating);
      if (isDisabled || !focusElement) {
        pendingReturnFocus = null;
        return undefined;
      }
      if (pendingReturnFocus) {
        pendingReturnFocus.cancelled = true;
        pendingReturnFocus = null;
      }
      const doc = ownerDocument(focusElement);
      const elementFocusedBeforeOpen = activeElement(doc);
      const preferPreviousFocus = untrack(openInteractionType) == null;
      addPreviouslyFocusedElement(elementFocusedBeforeOpen);

      const onOpenChangeLocal = (details: FloatingUIOpenChangeDetails) => {
        if (!details.open) {
          closeType = getEventType(details.nativeEvent, lastInteractionType);
        }
        if (
          details.reason === REASONS.focusOut &&
          details.triggerElement?.hasAttribute(createAttribute('focus-guard'))
        ) {
          preventReturnFocus = true;
        }
        if (details.reason !== REASONS.outsidePress) {
          return;
        }
        if (
          isVirtualClick(details.nativeEvent as MouseEvent) ||
          isVirtualPointerEvent(details.nativeEvent as PointerEvent)
        ) {
          preventReturnFocus = false;
        } else {
          let isPreventScrollSupported = false;
          doc.createElement('div').focus({
            get preventScroll() {
              isPreventScrollSupported = true;
              return false;
            },
          });
          preventReturnFocus = !isPreventScrollSupported;
        }
      };
      events.on('openchange', onOpenChangeLocal);

      const getReturnElement = () => {
        const referenceReturnElement = domReference?.isConnected ? domReference : null;
        const previousReturnElement =
          elementFocusedBeforeOpen?.isConnected && getNodeName(elementFocusedBeforeOpen) !== 'body'
            ? elementFocusedBeforeOpen
            : null;
        const defaultReturnElement = preferPreviousFocus
          ? previousReturnElement || referenceReturnElement
          : referenceReturnElement || previousReturnElement;
        return defaultReturnElement || getPreviouslyFocusedElement() || null;
      };

      return () => {
        events.off('openchange', onOpenChangeLocal);
        const activeEl = activeElement(doc);
        const isFocusInside =
          contains(floating, activeEl) ||
          getResolvedInsideElements().some(
            (element) => element === activeEl || contains(element, activeEl),
          );
        const returnElement = getReturnElement();
        const job = { cancelled: false };
        pendingReturnFocus = job;

        queueMicrotask(() => {
          if (pendingReturnFocus === job) {
            pendingReturnFocus = null;
          }
          const tabbableReturnElement = getFirstTabbableElement(returnElement);
          if (
            !job.cancelled &&
            !preventReturnFocus &&
            isHTMLElement(tabbableReturnElement) &&
            (tabbableReturnElement !== activeEl && activeEl !== doc.body ? isFocusInside : true)
          ) {
            const type = closeType || lastInteractionType;
            const shows =
              type === '' ? undefined : type === 'keyboard' || isTextField(tabbableReturnElement);
            if (
              shows !== undefined &&
              tabbableReturnElement === activeElement(doc) &&
              tabbableReturnElement.matches(':focus-visible') !== shows
            ) {
              tabbableReturnElement.blur();
            }
            const focusOptions: FocusOptions & { focusVisible?: boolean } = {
              preventScroll: true,
              ...(shows === undefined ? {} : { focusVisible: shows }),
            };
            tabbableReturnElement.focus(focusOptions);
          }
          preventReturnFocus = false;
        });
      };
    },
  );

  createEffect(
    () => [context.open(), context.floatingElement()] as const,
    ([open, floating]) => {
      if (!platform.engine.webkit || open || !floating) {
        return;
      }
      const activeEl = activeElement(ownerDocument(floating));
      if (isHTMLElement(activeEl) && isTypeableElement(activeEl) && contains(floating, activeEl)) {
        activeEl.blur();
      }
    },
  );

  createEffect(
    () =>
      [
        disabled(),
        modal(),
        context.open(),
        closeOnFocusOut(),
        context.domReferenceElement(),
      ] as const,
    ([isDisabled, isModal, open, closeOnOut, domReference]) => {
      if (isDisabled || !portalContext) {
        return undefined;
      }
      portalContext.setFocusManagerState({
        modal: isModal,
        closeOnFocusOut: closeOnOut,
        open,
        onOpenChange: context.setOpen,
        domReference,
      });
      return () => portalContext.setFocusManagerState(null);
    },
  );

  createEffect(
    () => [disabled(), context.floatingElement()] as const,
    ([isDisabled, floating]) => {
      const focusElement = getFloatingFocusElement(floating);
      if (isDisabled || !focusElement) {
        return undefined;
      }
      handleTabIndex(focusElement);
      return () => queueMicrotask(clearDisconnectedPreviouslyFocusedElements);
    },
  );

  onCleanup(() => {
    pendingReturnFocus = null;
  });

  return (
    <>
      <Show when={shouldRenderGuards()}>
        <FocusGuard
          data-type="inside"
          ref={(el) => {
            beforeGuardRef.current = el;
            if (props.beforeContentFocusGuardRef) {
              props.beforeContentFocusGuardRef.current = el;
            }
            if (portalContext) {
              portalContext.beforeInsideRef.current = el;
            }
          }}
          onFocus={(event) => {
            if (modal()) {
              const els = getTabbableContent();
              enqueueFocus(els[els.length - 1]);
            } else {
              const portalNode = portalContext?.portalNode();
              if (portalNode) {
                preventReturnFocus = false;
                if (isOutsideEvent(event, portalNode)) {
                  getNextTabbable(untrack(context.domReferenceElement))?.focus();
                } else {
                  resolveRef(
                    props.previousFocusableElement ?? portalContext?.beforeOutsideRef ?? null,
                  )?.focus();
                }
              }
            }
          }}
        />
      </Show>
      {props.children}
      <FocusGuard
        data-type="inside"
        hidden={!shouldRenderGuards()}
        ref={(el) => {
          afterGuardRef.current = el;
          if (portalContext) {
            portalContext.afterInsideRef.current = el;
          }
        }}
        onFocus={(event) => {
          if (modal()) {
            enqueueFocus(getTabbableContent()[0]);
          } else {
            const portalNode = portalContext?.portalNode();
            if (portalNode) {
              if (closeOnFocusOut()) {
                preventReturnFocus = true;
              }
              if (isOutsideEvent(event, portalNode)) {
                getPreviousTabbable(untrack(context.domReferenceElement))?.focus();
              } else {
                resolveRef(
                  props.nextFocusableElement ?? portalContext?.afterOutsideRef ?? null,
                )?.focus();
              }
            }
          }
        }}
      />
    </>
  );
}
