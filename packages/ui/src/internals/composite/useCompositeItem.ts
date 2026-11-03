import { untrack } from 'solid-js';

import type { HTMLProps } from '../types.ts';
import { useCompositeListItem } from './CompositeList.tsx';
import { useCompositeRootContext } from './CompositeRootContext.ts';

export interface UseCompositeItemParameters {
  guess?: boolean | undefined;
  initialTabStop?: ((index: number) => boolean) | undefined;
}

interface UseCompositeItemReturnValue {
  compositeProps: HTMLProps;
  compositeRef: (element: HTMLElement | null) => void;
}

export function useCompositeItem(
  params: UseCompositeItemParameters = {},
): UseCompositeItemReturnValue {
  const root = useCompositeRootContext();
  const listItem = useCompositeListItem({ guess: params.guess });
  const initialTabStop = params.initialTabStop;
  let element: HTMLElement | null = null;

  const highlighted = () =>
    !root.settled() && initialTabStop
      ? initialTabStop(listItem.index())
      : root.highlightedIndex() === listItem.index();

  const compositeProps: HTMLProps = {
    get tabindex() {
      return highlighted() ? 0 : -1;
    },
    onFocus() {
      root.onHighlightedIndexChange(untrack(listItem.index));
    },
    onClick() {
      root.onHighlightedIndexChange(untrack(listItem.index));
    },
  };

  return {
    compositeProps,
    compositeRef(node) {
      if (node === element) {
        return;
      }
      element = node;
      listItem.ref(node);
    },
  };
}
