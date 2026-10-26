// Not in upstream: the ref factory, the half of a behaviour (`mix.ts`) for
// work only the DOM can do. It is made in the component's body, on the server
// too, and registers the DOM work; the callback it returns only keeps the
// element, because Solid calls it before the element is connected and before
// its dynamic attributes are set, and never on the server. `listen` is built
// on it, and a mixin's `ref` takes it. The package's own: no subpath exports it.
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
  onSettled(() => (element ? setup(element) : undefined));
  return (next) => {
    element = next;
  };
}
