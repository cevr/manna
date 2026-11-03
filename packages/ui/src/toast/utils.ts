import { matchesFocusVisible } from '../floating-ui-solid/utils/element.ts';

export { matchesFocusVisible as isFocusVisible };

/** Whether a JSX value renders anything: `null`, `undefined`, booleans and `''` do not. */
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

/** A fresh toast id, unique within the page. */
export function generateToastId(): string {
  toastIdCounter += 1;
  return `toast-${toastIdCounter}`;
}
