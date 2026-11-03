import type { JSX } from '@solidjs/web';

import { mergePropsN } from '../merge-props/mergeProps.ts';
import { type RefFactory, onElement } from './element.ts';

type TagOf<T extends Element> = {
  [K in keyof JSX.IntrinsicElements & keyof HTMLElementTagNameMap]: [
    HTMLElementTagNameMap[K],
  ] extends [T]
    ? [T] extends [HTMLElementTagNameMap[K]]
      ? K
      : never
    : never;
}[keyof JSX.IntrinsicElements & keyof HTMLElementTagNameMap];

type AttributesOf<T extends Element> = [TagOf<T>] extends [never]
  ? JSX.HTMLAttributes<T>
  : JSX.IntrinsicElements[TagOf<T>];

export type Mixin<T extends Element = HTMLElement> = Omit<AttributesOf<T>, 'ref' | 'style'> & {
  ref?: RefFactory<T> | Array<RefFactory<T> | undefined> | undefined;
  style?: JSX.CSSProperties | string | undefined;
  [data: `data-${string}`]: string | undefined;
};

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
