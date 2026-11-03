import type { JSX } from '@solidjs/web';

import { mergePropsN } from '../merge-props/mergeProps.ts';
import { type RefFactory, onElement } from './element.ts';

/** The tag whose element is exactly `T` (`button` for `HTMLButtonElement`). */
type TagOf<T extends Element> = {
  [K in keyof JSX.IntrinsicElements & keyof HTMLElementTagNameMap]: [
    HTMLElementTagNameMap[K],
  ] extends [T]
    ? [T] extends [HTMLElementTagNameMap[K]]
      ? K
      : never
    : never;
}[keyof JSX.IntrinsicElements & keyof HTMLElementTagNameMap];

/** The attributes of `T`'s tag (a button's `type`), else those every HTML element takes. */
type AttributesOf<T extends Element> = [TagOf<T>] extends [never]
  ? JSX.HTMLAttributes<T>
  : JSX.IntrinsicElements[TagOf<T>];

/**
 * The props a mixin gives an element of type `T`. `ref` takes callbacks only
 * (JSX's `Ref<T>` also takes a bare `T`, which makes it invariant), `style`
 * leaves out `false` (so a mixin spreads onto a part, whose `style` has no
 * `false`), and `data-*` keys are allowed in an object literal.
 */
export type Mixin<T extends Element = HTMLElement> = Omit<AttributesOf<T>, 'ref' | 'style'> & {
  ref?: RefFactory<T> | Array<RefFactory<T> | undefined> | undefined;
  style?: JSX.CSSProperties | string | undefined;
  [data: `data-${string}`]: string | undefined;
};

/**
 * Merges mixins left to right, as `mergeProps` does: the rightmost attribute
 * wins, every handler runs (rightmost first, each able to stop the ones to its
 * left with `event.preventBaseUIHandler()`), every `class` is kept, `style`
 * objects merge and every ref is called. A falsy entry is left out, so
 * `cond && mixin()` composes. Build the result in a component's body and
 * spread it; never call `mix` inside JSX.
 */
export function mix<T extends Element = HTMLElement>(
  ...mixins: ReadonlyArray<Mixin<T> | false | null | undefined>
): Mixin<T> {
  return mergePropsN(mixins) as Mixin<T>;
}

interface ListenTargets {
  element: HTMLElementEventMap;
  document: DocumentEventMap;
  window: WindowEventMap;
}

/**
 * A ref factory that adds a native listener while its owner lives: on the
 * element, or on its document or window. For what Solid's `onX` props cannot
 * say: listener options (`passive: false`, `capture`) and listeners off the
 * element. A native listener runs before a delegated `onX` handler, so its
 * `stopPropagation()` silences them.
 */
export function listen<
  Where extends keyof ListenTargets,
  Type extends keyof ListenTargets[Where] & string,
>(
  target: Where,
  type: Type,
  handler: (event: ListenTargets[Where][Type]) => void,
  options?: AddEventListenerOptions,
): RefFactory<Element> {
  return onElement<Element>((element) => {
    const doc = element.ownerDocument;
    const on = target === 'element' ? element : target === 'document' ? doc : doc.defaultView;
    if (!on) {
      return undefined;
    }
    const controller = new AbortController();
    on.addEventListener(type, handler as EventListener, {
      ...options,
      signal: controller.signal,
    });
    return () => controller.abort();
  });
}
