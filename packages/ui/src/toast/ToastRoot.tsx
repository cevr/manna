import type { JSX } from '@solidjs/web';
import { createEffect, createMemo, createSignal, omit, onCleanup, untrack } from 'solid-js';

import type { StateAttributesMapping } from '../internals/getStateAttributesProps.ts';
import {
  type TransitionStatus,
  computeStartingStyle,
  transitionStatusMapping,
  useOpenChangeComplete,
} from '../internals/transitions.ts';
import type { BaseUIComponentProps, HTMLProps } from '../internals/types.ts';
import { useRenderElement } from '../internals/useRenderElement.tsx';
import { listen } from '../mix/mix.ts';
import { activeElement, closest, contains, getTarget, ownerDocument } from '../utils/dom.ts';
import {
  applyDirectionalDamping,
  getDisplacement,
  getElementTransform,
  type SwipeDirection,
} from '../utils/useSwipeDismiss.ts';
import { selectors } from './store.ts';
import { useToastProviderContext, useToastSelector } from './ToastProviderContext.ts';
import { ToastRootContext, type ToastRootContextValue } from './ToastRootContext.ts';
import type { ToastObject } from './types.ts';

const ToastRootCssVars = {
  swipeMovementX: '--toast-swipe-movement-x',
  swipeMovementY: '--toast-swipe-movement-y',
} as const;

const ToastRootDataAttributes = {
  expanded: 'data-expanded',
  limited: 'data-limited',
  type: 'data-type',
  swiping: 'data-swiping',
  swipeDirection: 'data-swipe-direction',
  startingStyle: 'data-starting-style',
  endingStyle: 'data-ending-style',
} as const;

interface ToastRootState {
  transitionStatus: TransitionStatus;
  expanded: boolean;
  limited: boolean;
  type: string | undefined;
  swiping: boolean;
  swipeDirection: SwipeDirection | undefined;
}

const toastRootStateAttributesMapping: StateAttributesMapping<ToastRootState> = {
  ...(transitionStatusMapping as StateAttributesMapping<ToastRootState>),
  swipeDirection(value) {
    return value ? { [ToastRootDataAttributes.swipeDirection]: value } : null;
  },
};

type ToastRootToastObject<Data extends object = object> = ToastObject<Data>;

interface ToastRootProps extends BaseUIComponentProps<'div', ToastRootState> {
  toast: ToastRootToastObject;
  swipeDirection?: SwipeDirection | SwipeDirection[] | undefined;
}

const SWIPE_THRESHOLD = 40;
const REVERSE_CANCEL_THRESHOLD = 10;
const MIN_DRAG_THRESHOLD = 1;

type Point = { x: number; y: number };
type Transform = Point & { scale: number };

export function ToastRoot(props: ToastRootProps): JSX.Element {
  const context = useToastProviderContext();
  const { store } = context;

  const toast = () => props.toast;
  const toastId = () => props.toast.id;

  const swipeDirections = createMemo<SwipeDirection[]>(() => {
    const swipeDirection = props.swipeDirection ?? ['down', 'right'];
    return Array.isArray(swipeDirection) ? swipeDirection : [swipeDirection];
  });
  const swipeEnabled = () => swipeDirections().length > 0;

  const [currentSwipeDirection, setCurrentSwipeDirection] = createSignal<
    SwipeDirection | undefined
  >(undefined, { ownedWrite: true });
  const [isSwiping, setIsSwiping] = createSignal(false, { ownedWrite: true });
  const [dragOffset, setDragOffset] = createSignal<Point>({ x: 0, y: 0 }, { ownedWrite: true });
  const [initialTransform, setInitialTransform] = createSignal<Transform>(
    { x: 0, y: 0, scale: 1 },
    { ownedWrite: true },
  );
  const [titleId, setTitleId] = createSignal<string | undefined>(undefined, { ownedWrite: true });
  const [rootElement, setRootElement] = createSignal<HTMLDivElement | null>(null, {
    ownedWrite: true,
  });

  const rootRef: { current: HTMLElement | null } = { current: null };
  let lastToastId: string | undefined;
  let dragStartPos: Point = { x: 0, y: 0 };
  let initialTransformValue: Transform = { x: 0, y: 0, scale: 1 };
  let intendedSwipeDirection: SwipeDirection | undefined;
  let maxSwipeDisplacement = 0;
  let cancelledSwipe = false;
  let swipeCancelBaseline: Point = { x: 0, y: 0 };
  let isFirstPointerMove = false;
  let dragOffsetValue: Point = { x: 0, y: 0 };
  let activePointerId: number | null = null;
  let dragAbortController: AbortController | null = null;
  let isRealSwipe = false;
  let lockedDirection: 'horizontal' | 'vertical' | null = null;

  const visibleIndex = useToastSelector(context, (state) =>
    selectors.toastVisibleIndex(state, toastId()),
  );
  const expanded = useToastSelector(context, selectors.expanded);

  useOpenChangeComplete({
    open: () => toast().transitionStatus !== 'ending',
    element: rootElement,
    onComplete() {
      const current = untrack(toast);
      if (current.transitionStatus === 'ending') {
        store.removeToast(current.id);
      }
    },
  });

  function settle() {
    if (!rootRef.current) {
      return;
    }
    computeStartingStyle(rootRef.current);
    store.updateToastInternal(untrack(toastId), {
      ref: rootRef,
      transitionStatus: undefined,
    });
  }

  function setResolvedDragOffset(nextDragOffset: Point) {
    dragOffsetValue = nextDragOffset;
    setDragOffset(nextDragOffset);
  }

  createEffect(
    () => [toastId(), toast().transitionStatus, rootElement()] as const,
    ([id, transitionStatus, element]) => {
      if (!element) {
        return;
      }
      if (transitionStatus !== 'starting' && lastToastId === id) {
        return;
      }

      if (lastToastId !== undefined) {
        setCurrentSwipeDirection(undefined);
        setInitialTransform({ x: 0, y: 0, scale: 1 });
        setResolvedDragOffset({ x: 0, y: 0 });
      }

      lastToastId = id;
      settle();
    },
  );

  onCleanup(() => {
    dragAbortController?.abort();
  });

  function handleSwipeEnd(event: PointerEvent) {
    if (event.pointerId !== activePointerId) {
      return;
    }

    activePointerId = null;
    dragAbortController?.abort();
    dragAbortController = null;
    setIsSwiping(false);
    isRealSwipe = false;
    lockedDirection = null;

    const resolvedInitialTransform = initialTransformValue;

    if (event.type === 'pointercancel' || cancelledSwipe) {
      setResolvedDragOffset({ x: resolvedInitialTransform.x, y: resolvedInitialTransform.y });
      setCurrentSwipeDirection(undefined);
      return;
    }

    const deltaX = dragOffsetValue.x - resolvedInitialTransform.x;
    const deltaY = dragOffsetValue.y - resolvedInitialTransform.y;
    let dismissDirection: SwipeDirection | undefined;

    for (const direction of untrack(swipeDirections)) {
      if (getDisplacement(direction, deltaX, deltaY) > SWIPE_THRESHOLD) {
        dismissDirection = direction;
        break;
      }
    }

    if (dismissDirection) {
      setCurrentSwipeDirection(dismissDirection);
      store.closeToast(untrack(toastId));
    } else {
      setResolvedDragOffset({ x: resolvedInitialTransform.x, y: resolvedInitialTransform.y });
      setCurrentSwipeDirection(undefined);
    }
  }

  function handlePointerDown(event: PointerEvent) {
    if (!untrack(swipeEnabled) || event.button !== 0) {
      return;
    }

    if (event.pointerType === 'touch') {
      store.pauseTimers();
    }

    const target = getTarget(event) as HTMLElement | null;
    const isInteractiveElement = closest(target, 'button,a,input,textarea,[role="button"]');
    if (isInteractiveElement) {
      return;
    }

    cancelledSwipe = false;
    intendedSwipeDirection = undefined;
    maxSwipeDisplacement = 0;
    activePointerId = event.pointerId;
    dragStartPos = { x: event.clientX, y: event.clientY };
    swipeCancelBaseline = dragStartPos;

    const element = event.currentTarget as HTMLElement;

    const transform = getElementTransform(element);
    initialTransformValue = transform;
    setInitialTransform(transform);
    setResolvedDragOffset({ x: transform.x, y: transform.y });

    store.set('hovering', true);
    setIsSwiping(true);
    isRealSwipe = false;
    lockedDirection = null;
    isFirstPointerMove = true;

    dragAbortController?.abort();
    const controller = new AbortController();
    dragAbortController = controller;

    const doc = ownerDocument(element);
    doc.addEventListener('pointerup', handleSwipeEnd, { signal: controller.signal });
    doc.addEventListener('pointercancel', handleSwipeEnd, { signal: controller.signal });

    element.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent) {
    if (event.pointerId !== activePointerId) {
      return;
    }

    event.preventDefault();

    if (isFirstPointerMove) {
      dragStartPos = { x: event.clientX, y: event.clientY };
      isFirstPointerMove = false;
    }

    const { clientY, clientX, movementX, movementY } = event;
    const directions = untrack(swipeDirections);

    if (
      (movementY < 0 && clientY > swipeCancelBaseline.y) ||
      (movementY > 0 && clientY < swipeCancelBaseline.y)
    ) {
      swipeCancelBaseline = { x: swipeCancelBaseline.x, y: clientY };
    }

    if (
      (movementX < 0 && clientX > swipeCancelBaseline.x) ||
      (movementX > 0 && clientX < swipeCancelBaseline.x)
    ) {
      swipeCancelBaseline = { x: clientX, y: swipeCancelBaseline.y };
    }

    const deltaX = clientX - dragStartPos.x;
    const deltaY = clientY - dragStartPos.y;
    const cancelDeltaY = clientY - swipeCancelBaseline.y;
    const cancelDeltaX = clientX - swipeCancelBaseline.x;

    const hasHorizontal = directions.includes('left') || directions.includes('right');
    const hasVertical = directions.includes('up') || directions.includes('down');

    if (!isRealSwipe) {
      const movementDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (movementDistance >= MIN_DRAG_THRESHOLD) {
        isRealSwipe = true;
        if (hasHorizontal && hasVertical) {
          lockedDirection = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
        }
      }
    }

    if (!intendedSwipeDirection) {
      let candidate: SwipeDirection | undefined;
      if (lockedDirection === 'vertical') {
        if (deltaY > 0) {
          candidate = 'down';
        } else if (deltaY < 0) {
          candidate = 'up';
        }
      } else if (lockedDirection === 'horizontal') {
        if (deltaX > 0) {
          candidate = 'right';
        } else if (deltaX < 0) {
          candidate = 'left';
        }
      } else if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        candidate = deltaX > 0 ? 'right' : 'left';
      } else {
        candidate = deltaY > 0 ? 'down' : 'up';
      }

      if (candidate && directions.includes(candidate)) {
        intendedSwipeDirection = candidate;
        maxSwipeDisplacement = getDisplacement(candidate, deltaX, deltaY);
        setCurrentSwipeDirection(candidate);
      }
    } else {
      const direction = intendedSwipeDirection;
      const currentDisplacement = getDisplacement(direction, cancelDeltaX, cancelDeltaY);

      if (currentDisplacement > SWIPE_THRESHOLD) {
        cancelledSwipe = false;
        setCurrentSwipeDirection(direction);
      } else if (
        !(directions.includes('left') && directions.includes('right')) &&
        !(directions.includes('up') && directions.includes('down')) &&
        maxSwipeDisplacement - currentDisplacement >= REVERSE_CANCEL_THRESHOLD
      ) {
        cancelledSwipe = true;
      }
    }

    const dampedDelta = applyDirectionalDamping(deltaX, deltaY, directions);
    let newOffsetX = initialTransformValue.x;
    let newOffsetY = initialTransformValue.y;

    if (lockedDirection !== 'vertical' && hasHorizontal) {
      newOffsetX += dampedDelta.x;
    }

    if (lockedDirection !== 'horizontal' && hasVertical) {
      newOffsetY += dampedDelta.y;
    }

    setResolvedDragOffset({ x: newOffsetX, y: newOffsetY });
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape') {
      return;
    }
    const root = rootRef.current;
    if (!root || !contains(root, activeElement(ownerDocument(root)))) {
      return;
    }

    store.closeToast(untrack(toastId));
  }

  const defaultProps: HTMLProps = {
    role: 'dialog',
    tabindex: 0,
    'aria-modal': 'false',
    get 'aria-labelledby'() {
      return titleId();
    },
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handleSwipeEnd,
    onPointerCancel: handleSwipeEnd,
    onKeyDown: handleKeyDown,
    ref: listen(
      'element',
      'touchmove',
      (event) => {
        if (
          !untrack(swipeEnabled) ||
          activePointerId === null ||
          !contains(event.currentTarget as Element, getTarget(event) as Element | null)
        ) {
          return;
        }
        event.preventDefault();
      },
      { passive: false },
    ),
    get inert() {
      return toast().limited ? true : undefined;
    },
    get style() {
      const offset = dragOffset();
      const initial = initialTransform();
      const swiping = isSwiping();
      const style: Record<string, string | number | undefined> = {
        [ToastRootCssVars.swipeMovementX]: `${offset.x - initial.x}px`,
        [ToastRootCssVars.swipeMovementY]: `${offset.y - initial.y}px`,
      };
      if (swiping) {
        style['transition'] = 'none';
        style['transform'] =
          `translateX(${offset.x}px) translateY(${offset.y}px) scale(${initial.scale})`;
      }
      return style;
    },
  };

  const contextValue: ToastRootContextValue = {
    toast,
    setTitleId: (updater) => setTitleId(updater),
    visibleIndex,
    expanded,
  };

  const state: ToastRootState = {
    get transitionStatus() {
      return toast().transitionStatus;
    },
    get expanded() {
      return expanded();
    },
    get limited() {
      return toast().limited || false;
    },
    get type() {
      return toast().type;
    },
    get swiping() {
      return isSwiping();
    },
    get swipeDirection() {
      return currentSwipeDirection();
    },
  };

  function RootElement() {
    return useRenderElement('div', props, {
      ref: (element: HTMLDivElement) => {
        rootRef.current = element;
        setRootElement(element);
      },
      state,
      stateAttributesMapping: toastRootStateAttributesMapping,
      props: [defaultProps, omit(props, 'class', 'style', 'render', 'toast', 'swipeDirection')],
    });
  }

  return (
    <ToastRootContext value={contextValue}>
      <RootElement />
    </ToastRootContext>
  );
}
