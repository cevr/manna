import { untrack } from 'solid-js';

import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { HTMLProps } from '../../internals/types.ts';
import { getTarget } from '../../utils/dom.ts';
import { useAnimationFrame } from '../../utils/timers.ts';
import type { FloatingRootContext } from '../FloatingRootContext.ts';
import { isTypeableElement } from '../utils/element.ts';
import { isMouseLikePointerType, isVirtualPointerEvent } from '../utils/event.ts';

type PointerKind = 'mouse' | 'pen' | 'touch' | 'virtual' | undefined;

export function useClick(context: FloatingRootContext): { reference: HTMLProps } {
  let pointerType: PointerKind;
  const frame = useAnimationFrame();

  const setOpen = (nextOpen: boolean, nativeEvent: MouseEvent, target: HTMLElement) => {
    context.setOpen(nextOpen, createChangeEventDetails(REASONS.triggerPress, nativeEvent, target));
  };

  const getNextOpen = (open: boolean, currentTarget: EventTarget | null) =>
    !open || untrack(context.domReferenceElement) !== currentTarget;

  const reference: HTMLProps = {
    onPointerDown(event: PointerEvent) {
      pointerType =
        isMouseLikePointerType(event.pointerType, true) && isVirtualPointerEvent(event)
          ? 'virtual'
          : (event.pointerType as PointerKind);
    },
    onMouseDown(event: MouseEvent) {
      if (event.button !== 0) {
        return;
      }
      const nextOpen = getNextOpen(untrack(context.open), event.currentTarget);
      const target = getTarget(event);
      const isTypeable = isTypeableElement(target);
      if (isTypeable || pointerType === 'virtual') {
        setOpen(nextOpen, event, (isTypeable ? target : event.currentTarget) as HTMLElement);
        return;
      }
      const currentTarget = event.currentTarget as HTMLElement;
      frame.request(() => setOpen(nextOpen, event, currentTarget));
    },
    onClick(event: MouseEvent) {
      if (pointerType) {
        pointerType = undefined;
        return;
      }
      const nextOpen = getNextOpen(untrack(context.open), event.currentTarget);
      setOpen(nextOpen, event, event.currentTarget as HTMLElement);
    },
    onKeyDown() {
      pointerType = undefined;
    },
  };

  return { reference };
}
