import type { VirtualElement } from '@floating-ui/dom';
import { isElement } from '@floating-ui/utils/dom';
import { type Accessor, createSignal, untrack } from 'solid-js';

import type { BaseUIChangeEventDetails } from '../internals/createBaseUIEventDetails.ts';
import type { FloatingUIOpenChangeDetails } from '../internals/types.ts';
import { createEventEmitter, type FloatingEvents, isClickLikeEvent } from './utils/event.ts';

export type ReferenceType = Element | VirtualElement;

interface ContextData {
  openEvent?: Event | undefined;
}

export interface FloatingRootContext {
  open: Accessor<boolean>;
  domReferenceElement: Accessor<Element | null>;
  referenceElement: Accessor<ReferenceType | null>;
  floatingElement: Accessor<HTMLElement | null>;
  setPositionReference(node: ReferenceType | null): void;
  setOpen(open: boolean, eventDetails: BaseUIChangeEventDetails): void;
  dispatchOpenChange(open: boolean, eventDetails: BaseUIChangeEventDetails): void;
  readonly dataRef: { current: ContextData };
  readonly events: FloatingEvents;
}

interface FloatingRootContextOptions {
  open: Accessor<boolean>;
  referenceElement: Accessor<ReferenceType | null>;
  floatingElement: Accessor<HTMLElement | null>;
  onOpenChange(open: boolean, eventDetails: BaseUIChangeEventDetails): void;
}

export function createFloatingRootContext(
  options: FloatingRootContextOptions,
): FloatingRootContext {
  const [positionReference, setPositionReference] = createSignal<ReferenceType | null>(null, {
    ownedWrite: true,
  });
  const dataRef: { current: ContextData } = { current: {} };
  const events = createEventEmitter();

  const context: FloatingRootContext = {
    open: options.open,
    domReferenceElement: () => {
      const reference = options.referenceElement();
      return isElement(reference) ? reference : null;
    },
    referenceElement: () => positionReference() ?? options.referenceElement(),
    floatingElement: options.floatingElement,
    setPositionReference(node) {
      setPositionReference(() => node);
    },
    setOpen(open, eventDetails) {
      options.onOpenChange(open, eventDetails);
    },
    dispatchOpenChange(open, eventDetails) {
      const event = eventDetails.event;
      if (!open || !untrack(options.open) || (event != null && isClickLikeEvent(event))) {
        dataRef.current.openEvent = open ? event : undefined;
      }
      const details: FloatingUIOpenChangeDetails = {
        open,
        reason: eventDetails.reason,
        nativeEvent: event,
        triggerElement: eventDetails.trigger,
      };
      events.emit('openchange', details);
    },
    dataRef,
    events,
  };
  return context;
}
