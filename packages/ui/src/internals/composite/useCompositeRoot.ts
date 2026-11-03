import { createSignal, untrack } from 'solid-js';

import {
  findNonDisabledListIndex,
  isIndexOutOfListBounds,
  isListIndexDisabled,
} from '../../floating-ui-solid/utils/composite.ts';
import type { HTMLProps } from '../types.ts';
import type { CompositeIndexMap } from './CompositeList.tsx';
import {
  COMPOSITE_KEYS,
  getCompositeNavigationIndex,
  getFallbackIndex,
  hasModifierKey,
  scrollIntoViewIfNeeded,
} from './composite.ts';

interface UseCompositeRootReturnValue {
  /** The root element's props: its ref and keydown handling. */
  props: HTMLProps;
  highlightedIndex: () => number;
  /** Whether the tab stop's first index has been set from the registered items. */
  settled: () => boolean;
  onHighlightedIndexChange: (index: number, shouldScrollIntoView?: boolean) => void;
  /** The items' elements by index, kept by the `CompositeList` the root renders. */
  elementsRef: { current: Array<HTMLElement | null> };
  /** Pass to the `CompositeList`'s `onMapChange`. */
  onMapChange: (map: CompositeIndexMap) => void;
}

interface UseCompositeRootParameters {
  /** Where the tab stop starts, among the first items (-1: the first enabled). */
  initialIndex?: ((elements: ReadonlyArray<HTMLElement | null>) => number) | undefined;
}

export function useCompositeRoot(
  params: UseCompositeRootParameters = {},
): UseCompositeRootReturnValue {
  const [highlightedIndex, setHighlightedIndex] = createSignal(0, { ownedWrite: true });
  const elementsRef: { current: Array<HTMLElement | null> } = { current: [] };
  const [settled, setSettled] = createSignal(false, { ownedWrite: true });
  let hasSetDefaultIndex = false;
  let rootElement: HTMLElement | null = null;
  let highlightedElement: HTMLElement | null = null;

  const onHighlightedIndexChange = (index: number, shouldScrollIntoView = false) => {
    highlightedElement = elementsRef.current[index] ?? null;
    setHighlightedIndex(index);
    if (shouldScrollIntoView) {
      untrack(() => scrollIntoViewIfNeeded(rootElement, elementsRef.current[index] ?? null));
    }
  };

  const onMapChange = (map: CompositeIndexMap) => {
    if (map.size === 0) {
      return;
    }
    untrack(() => {
      const current = highlightedIndex();

      if (hasSetDefaultIndex) {
        const elements = elementsRef.current;
        const nextIndex = highlightedElement ? elements.indexOf(highlightedElement) : -1;
        if (nextIndex === -1) {
          const replacement = elements[current];
          if (!replacement || isListIndexDisabled(elements, current)) {
            onHighlightedIndexChange(getFallbackIndex(elements));
          } else {
            highlightedElement = replacement;
          }
        } else if (nextIndex !== current) {
          onHighlightedIndexChange(nextIndex);
        }
        return;
      }

      hasSetDefaultIndex = true;
      setSettled(true);
      const sortedElements = Array.from(map.keys()) as Array<HTMLElement | null>;
      const initial = params.initialIndex?.(sortedElements) ?? -1;
      if (
        !isIndexOutOfListBounds(sortedElements, initial) &&
        !isListIndexDisabled(sortedElements, initial)
      ) {
        onHighlightedIndexChange(initial);
        return;
      }
      highlightedElement = elementsRef.current[current] ?? null;
      if (isListIndexDisabled(sortedElements, current)) {
        const firstEnabledIndex = findNonDisabledListIndex(sortedElements);
        if (!isIndexOutOfListBounds(sortedElements, firstEnabledIndex)) {
          onHighlightedIndexChange(firstEnabledIndex);
        }
      }
    });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    untrack(() => {
      if (!COMPOSITE_KEYS.has(event.key) || hasModifierKey(event) || !rootElement) {
        return;
      }

      const current = highlightedIndex();
      const { index: nextIndex, handled } = getCompositeNavigationIndex({
        key: event.key,
        highlightedIndex: current,
        elements: elementsRef.current,
      });

      if (nextIndex === current || isIndexOutOfListBounds(elementsRef.current, nextIndex)) {
        return;
      }
      event.stopPropagation();
      if (handled) {
        event.preventDefault();
      }
      onHighlightedIndexChange(nextIndex, true);
      queueMicrotask(() => {
        elementsRef.current[nextIndex]?.focus();
      });
    });
  };

  const props: HTMLProps = {
    ref(element: HTMLElement | null) {
      rootElement = element;
    },
    onKeyDown,
  };

  return {
    props,
    highlightedIndex,
    settled,
    onHighlightedIndexChange,
    elementsRef,
    onMapChange,
  };
}
