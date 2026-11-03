import { onSettled } from 'solid-js';

export type RefFactory<T extends Element = HTMLElement> = (element: T) => void;

export function onElement<T extends Element = HTMLElement>(
  setup: (element: T) => void | (() => void),
): RefFactory<T> {
  let element: T | undefined;
  onSettled(() => {
    if (element === undefined) return undefined;
    return setup(element);
  });
  return (next) => {
    element = next;
  };
}
