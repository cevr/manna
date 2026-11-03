/* oxlint-disable effect/noUnsafeDictionaryType, effect/noNullish, effect/noThrowStatement, effect/noNewError -- a mounted element's React props are read as React holds them, to call the handlers react-native-web keeps off the DOM. */

/**
 * The React Native props an element was drawn with, as a test reads them
 * where react-native-web draws no DOM for them: VoiceOver's actions
 * (`accessibilityActions`, `onAccessibilityAction`), its hint
 * (`accessibilityHint`) and a press's hold (`onLongPress`).
 *
 * The props come from the current fiber tree. The DOM node keeps the fiber
 * React made it with, and after an odd number of commits of that node that
 * fiber is the stale alternate, holding the render before the last one. So
 * the read starts at the root's current fiber, walks down to the element's
 * fiber, and reads that fiber, then each one above it, until one holds `name`.
 */

import { act } from 'react';

type Props = Record<string, unknown>;

interface Fiber {
  readonly memoizedProps?: Props;
  readonly child?: Fiber;
  readonly sibling?: Fiber;
  readonly stateNode?: unknown;
}

const keyed = (node: Node, prefix: string): Fiber | undefined => {
  const key = Object.keys(node).find((name) => name.startsWith(prefix));
  return (key && (node as unknown as Record<string, Fiber>)[key]) || undefined;
};

/** The current root fiber of the React root `element` is drawn in. */
const rootOf = (element: Element): Fiber | undefined => {
  for (let node: Node | null = element; node; node = node.parentNode) {
    const container = keyed(node, '__reactContainer$');
    if (container) return (container.stateNode as { readonly current: Fiber }).current;
  }
  return undefined;
};

/** The current fibers from the root down to `element`'s own, root first. */
const pathTo = (root: Fiber, element: Element): Array<Fiber> => {
  const path: Array<Fiber> = [];
  const visit = (fiber: Fiber | undefined): boolean => {
    for (let each = fiber; each; each = each.sibling) {
      path.push(each);
      if (each.stateNode === element || visit(each.child)) return true;
      path.pop();
    }
    return false;
  };
  visit(root);
  return path;
};

/** The nearest current props at or above `element` that hold `name`. */
export const propsWith = (element: Element, name: string): Props => {
  const root = rootOf(element);
  const path = (root && pathTo(root, element)) || [];
  const found = path
    .toReversed()
    .find((fiber) => fiber.memoizedProps && name in fiber.memoizedProps);
  if (found?.memoizedProps) return found.memoizedProps;
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
