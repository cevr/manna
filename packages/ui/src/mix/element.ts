import { onSettled } from 'solid-js';

/** The callback a ref factory returns: Solid passes it the element. */
export type RefFactory<T extends Element = HTMLElement> = (element: T) => void;

/**
 * A ref factory that runs `setup` on its element once the render has settled
 * (the element connected, its attributes set); what `setup` returns runs when
 * the owner is disposed. Make it in a component's body, under the element's
 * owner: made before its element exists (above a `<Show>`), it finds no
 * element when the render settles and does nothing.
 */
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
