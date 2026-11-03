import type { JSX } from '@solidjs/web';
import { createUniqueId, omit, untrack } from 'solid-js';

import type { PropsInput } from '../../merge-props/mergeProps.ts';
import type { Mixin } from '../../mix/mix.ts';
import { useCompositeListItem } from '../../internals/composite/CompositeList.tsx';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types.ts';
import { dispatchClickWithModifiers, useButton } from '../../internals/useButton.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { platform } from '../../utils/platform.ts';
import { useMenuRootContext } from '../root/MenuRootContext.ts';

interface MenuItemState {
  highlighted: boolean;
}

interface MenuItemProps extends BaseUIComponentProps<'div', MenuItemState> {
  label?: string | undefined;
}

interface MenuItemParams {
  readonly id: string | false | undefined;
  readonly label: () => string | undefined;
  readonly closeOnClick: () => boolean;
}

interface MenuItemBehaviour {
  readonly highlighted: () => boolean;
  readonly props: ReadonlyArray<PropsInput>;
  readonly button: Mixin<HTMLButtonElement>;
  readonly ref: (el: HTMLElement) => void;
}

export function useMenuItem(params: MenuItemParams): MenuItemBehaviour {
  const { store, parent, itemProps } = useMenuRootContext();
  const contextMenu = parent.type === 'context-menu' ? parent.context : null;
  const listItem = useCompositeListItem({
    guess: true,
    get label() {
      return params.label();
    },
  });
  const id = params.id || createUniqueId();
  const highlighted = () => store.isActive(listItem.index());
  let itemElement: HTMLElement | null = null;

  const button = useButton({ native: false, composite: true });

  const ownProps: HTMLProps = {
    id,
    get tabindex() {
      return store.open() && highlighted() ? 0 : -1;
    },
    onKeyDown(event: KeyboardEvent) {
      if (event.key === ' ' && store.typingRef.current) {
        event.preventDefault();
      }
    },
    onClick(event: MouseEvent) {
      if (untrack(params.closeOnClick)) {
        store.setOpen(false, createChangeEventDetails(REASONS.itemPress, event));
      }
    },
    onMouseUp(event: MouseEvent) {
      if (contextMenu) {
        const initialCursorPoint = contextMenu.initialCursorPointRef.current;
        contextMenu.initialCursorPointRef.current = null;
        if (
          initialCursorPoint &&
          Math.abs(event.clientX - initialCursorPoint.x) <= 1 &&
          Math.abs(event.clientY - initialCursorPoint.y) <= 1
        ) {
          return;
        }
        if (!platform.os.mac && event.button === 2) {
          return;
        }
      }
      if (
        itemElement &&
        store.allowMouseUpTriggerRef.current &&
        (contextMenu === null || event.button === 2)
      ) {
        dispatchClickWithModifiers(itemElement, event, { detail: 1, pointerType: 'mouse' });
      }
    },
  };

  return {
    highlighted,
    props: [ownProps, itemProps],
    button,
    ref: (el: HTMLElement) => {
      itemElement = el;
      listItem.ref(el);
    },
  };
}

export function MenuItem(componentProps: MenuItemProps): JSX.Element {
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'id', 'label');
  const item = useMenuItem({
    id: untrack(() => componentProps.id),
    label: () => componentProps.label,
    closeOnClick: () => true,
  });

  const state: MenuItemState = {
    get highlighted() {
      return item.highlighted();
    },
  };

  return useRenderElement('div', componentProps, {
    state,
    props: [item.button, { role: 'menuitem' }, ...item.props, elementProps],
    ref: item.ref,
  });
}
