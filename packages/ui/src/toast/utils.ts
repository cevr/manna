import { matchesFocusVisible } from '../floating-ui-solid/utils/element.ts';

export { matchesFocusVisible as isFocusVisible };

export function isRenderableNode(node: unknown): boolean {
  if (node == null || typeof node === 'boolean' || node === '') {
    return false;
  }
  if (Array.isArray(node)) {
    return node.some(isRenderableNode);
  }
  return true;
}

let toastIdCounter = 0;

export function generateToastId(): string {
  toastIdCounter += 1;
  return `toast-${toastIdCounter}`;
}
