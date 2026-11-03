import { type Accessor, createEffect, createSignal, untrack } from 'solid-js';

import type { InteractionType } from '../floating-ui-solid/FloatingFocusManager.tsx';
import type { HTMLProps } from '../internals/types.ts';
import { platform } from './platform.ts';

export type { InteractionType };

export function useOpenInteractionType(open: Accessor<boolean>) {
  const [openMethod, setOpenMethod] = createSignal<InteractionType | null>(null, {
    ownedWrite: true,
  });
  createEffect(open, (isOpen) => {
    if (!isOpen) {
      setOpenMethod(null);
    }
  });

  const record = (interactionType: InteractionType) => {
    if (!untrack(open)) {
      setOpenMethod(() => interactionType || (platform.os.ios ? 'touch' : ''));
    }
  };

  let lastClickInteractionType: InteractionType = '';
  const triggerProps: HTMLProps = {
    onPointerDown(event: PointerEvent) {
      if (event.defaultPrevented) {
        return;
      }
      lastClickInteractionType = event.pointerType as InteractionType;
      record(lastClickInteractionType);
    },
    onClick(event: MouseEvent | PointerEvent) {
      if (event.detail === 0) {
        record('keyboard');
        return;
      }
      record(
        'pointerType' in event ? (event.pointerType as InteractionType) : lastClickInteractionType,
      );
      lastClickInteractionType = '';
    },
  };

  return { openMethod, triggerProps };
}
