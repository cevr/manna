import { untrack } from 'solid-js';

import type { HTMLProps } from '../types.ts';
import { useCompositeListItem } from './CompositeList.tsx';
import { useCompositeRootContext } from './CompositeRootContext.ts';

export interface UseCompositeItemParameters {
  /** Whether the index starts at the item's place in render order (see `useCompositeListItem`). */
  guess?: boolean | undefined;
  /**
   * Whether the item, at `index`, holds the tab stop until the root settles
   * it: read in the server's render and the browser's first, so both put it
   * on the same item, which must be the one the root's `initialIndex` picks.
   * Without it, the item at the root's starting index (0) holds it.
   */
  initialTabStop?: ((index: number) => boolean) | undefined;
}

interface UseCompositeItemReturnValue {
  compositeProps: HTMLProps;
  /** Pass to the item element's `ref`. */
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
