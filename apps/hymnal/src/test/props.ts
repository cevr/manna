/* oxlint-disable effect/noUnsafeDictionaryType, effect/noNullish, effect/noThrowStatement, effect/noNewError -- a mounted element's React props are read as React holds them, to call the handlers react-native-web keeps off the DOM. */

/**
 * The React Native props an element was drawn with, as a test reads them
 * where react-native-web draws no DOM for them: VoiceOver's actions
 * (`accessibilityActions`, `onAccessibilityAction`) and a press's hold
 * (`onLongPress`). The element's fiber, then each fiber above it, is read
 * until one holds `name`.
 */

import { act } from 'react';

type Props = Record<string, unknown>;

interface Fiber {
  readonly memoizedProps?: Props;
  readonly return?: Fiber;
}

const fiberOf = (element: Element): Fiber | undefined => {
  const key = Object.keys(element).find((name) => name.startsWith('__reactFiber$'));
  return (key && (element as unknown as Record<string, Fiber>)[key]) || undefined;
};

/** The nearest props at or above `element` that hold `name`. */
export const propsWith = (element: Element, name: string): Props => {
  for (let fiber = fiberOf(element); fiber; fiber = fiber.return)
    if (fiber.memoizedProps && name in fiber.memoizedProps) return fiber.memoizedProps;
  throw new Error(`no props with ${name} at or above the element`);
};

/** The VoiceOver actions `element` offers, by name and label. */
export const actionsOf = (element: Element) =>
  propsWith(element, 'accessibilityActions')['accessibilityActions'] as ReadonlyArray<{
    readonly name: string;
    readonly label?: string;
  }>;

/** VoiceOver's action `name` on `element`, as iOS sends it. */
export const perform = (element: Element, name: string) =>
  act(() => {
    const run = propsWith(element, 'onAccessibilityAction')['onAccessibilityAction'] as (event: {
      readonly nativeEvent: { readonly actionName: string };
    }) => void;
    run({ nativeEvent: { actionName: name } });
  });
