import { getParentNode, isHTMLElement, isLastTraversableNode } from '@floating-ui/utils/dom';

import { REASONS } from '../../internals/reasons.ts';

export function isKeyboardClick(reason: string | null, event: Event | undefined): boolean {
  return (
    (reason === REASONS.triggerPress || reason === REASONS.itemPress) &&
    (event as MouseEvent | undefined)?.detail === 0
  );
}

export function findRootOwnerId(node: Node): string | undefined {
  if (isHTMLElement(node) && node.hasAttribute('data-rootownerid')) {
    return node.getAttribute('data-rootownerid') ?? undefined;
  }
  if (isLastTraversableNode(node)) {
    return undefined;
  }
  return findRootOwnerId(getParentNode(node));
}
