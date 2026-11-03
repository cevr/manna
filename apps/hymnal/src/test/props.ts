/* oxlint-disable effect/noUnsafeDictionaryType, effect/noNullish, effect/noThrowStatement, effect/noNewError -- a mounted element's React props are read as React holds them, to call the handlers react-native-web keeps off the DOM. */

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

const rootOf = (element: Element): Fiber | undefined => {
  for (let node: Node | null = element; node; node = node.parentNode) {
    const container = keyed(node, '__reactContainer$');
    if (container) return (container.stateNode as { readonly current: Fiber }).current;
  }
  return undefined;
};

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

export const propsWith = (element: Element, name: string): Props => {
  const root = rootOf(element);
  const path = (root && pathTo(root, element)) || [];
  const found = path
    .toReversed()
    .find((fiber) => fiber.memoizedProps && name in fiber.memoizedProps);
  if (found?.memoizedProps) return found.memoizedProps;
  throw new Error(`no props with ${name} at or above the element`);
};

export const actionsOf = (element: Element) =>
  propsWith(element, 'accessibilityActions')['accessibilityActions'] as ReadonlyArray<{
    readonly name: string;
    readonly label?: string;
  }>;

export const perform = (element: Element, name: string) =>
  act(() => {
    const run = propsWith(element, 'onAccessibilityAction')['onAccessibilityAction'] as (event: {
      readonly nativeEvent: { readonly actionName: string };
    }) => void;
    run({ nativeEvent: { actionName: name } });
  });
