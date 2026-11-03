import { $PROXY, createMemo, untrack } from 'solid-js';

import type { BaseUIEvent, HTMLProps } from '../internals/types.ts';

type PropsGetter = (merged: HTMLProps) => HTMLProps;
export type PropsInput = HTMLProps | PropsGetter | null | undefined | false;

type Handler = (...args: Array<unknown>) => unknown;

function isEventHandlerKey(key: string): boolean {
  const code2 = key.charCodeAt(2);
  return key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110 && code2 >= 65 && code2 <= 90;
}

function isPropsGetter(input: PropsInput): input is PropsGetter {
  return typeof input === 'function';
}

function resolveSources(inputs: ReadonlyArray<PropsInput>): Array<HTMLProps> {
  let sources: Array<HTMLProps> = [];
  for (const input of inputs) {
    if (!input) {
      continue;
    }
    if (isPropsGetter(input)) {
      const before = sources;
      sources = [untrack(() => input(createView(() => before)))];
      continue;
    }
    sources.push(input);
  }
  return sources;
}

function makeEventPreventable<E extends Event>(event: E): BaseUIEvent<E> {
  const preventable = event as BaseUIEvent<E> & { baseUIHandlerPrevented?: boolean };
  preventable.preventBaseUIHandler = () => {
    preventable.baseUIHandlerPrevented = true;
  };
  return preventable;
}

function isEvent(value: unknown): value is Event {
  return typeof Event !== 'undefined' && value instanceof Event;
}

function callHandler(handler: unknown, args: Array<unknown>): unknown {
  if (typeof handler === 'function') {
    return (handler as Handler)(...args);
  }
  if (Array.isArray(handler) && typeof handler[0] === 'function') {
    return (handler[0] as Handler)(handler[1], ...args);
  }
  return undefined;
}

function isHandlerValue(value: unknown): boolean {
  return typeof value === 'function' || (Array.isArray(value) && typeof value[0] === 'function');
}

function runHandlers(handlers: ReadonlyArray<unknown>, args: Array<unknown>): unknown {
  const event = args[0];
  if (isEvent(event)) {
    makeEventPreventable(event);
  }
  let result: unknown;
  for (let i = handlers.length - 1; i >= 0; i -= 1) {
    const value = callHandler(handlers[i], args);
    if (i === handlers.length - 1) {
      result = value;
    }
    if (isEvent(event) && (event as BaseUIEvent<Event>).baseUIHandlerPrevented) {
      break;
    }
  }
  return result;
}

const STYLE_DECLARATION = /([\w-]+)\s*:\s*([^;]*)/g;

function styleToObject(style: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of style.matchAll(STYLE_DECLARATION)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      out[name] = value.trim();
    }
  }
  return out;
}

export function mergeStyles(a: unknown, b: unknown): unknown {
  if (a == null || a === false) {
    return b;
  }
  if (b == null || b === false) {
    return a;
  }
  const left = typeof a === 'string' ? styleToObject(a) : (a as object);
  const right = typeof b === 'string' ? styleToObject(b) : (b as object);
  return { ...left, ...right };
}

export function mergeClassNames(ours: unknown, theirs: unknown): unknown {
  if (theirs == null || theirs === false || theirs === '') {
    return ours;
  }
  if (ours == null || ours === false || ours === '') {
    return theirs;
  }
  return [theirs, ours];
}

function hasKey(source: HTMLProps, key: string): boolean {
  return key in source;
}

function createView(read: () => ReadonlyArray<HTMLProps>): HTMLProps {
  const handlers = new Map<string, Handler>();
  const ownerOf = (key: string): number => {
    const sources = read();
    for (let i = sources.length - 1; i >= 0; i -= 1) {
      const source = sources[i];
      if (source !== undefined && hasKey(source, key)) {
        return i;
      }
    }
    return -1;
  };

  const handlerFor = (key: string): Handler => {
    const cached = handlers.get(key);
    if (cached) {
      return cached;
    }
    const handler: Handler = (...args) => {
      const values = untrack(() =>
        read()
          .filter((source) => hasKey(source, key))
          .map((source) => source[key])
          .filter(isHandlerValue),
      );
      return runHandlers(values, args);
    };
    handlers.set(key, handler);
    return handler;
  };

  const refFn = (el: unknown) => {
    const all = untrack(() => read().map((source) => source['ref']));
    for (const ref of all) {
      applyRef(ref, el);
    }
  };

  const get = (key: string): unknown => {
    const sources = read();
    switch (key) {
      case 'class': {
        let merged: unknown;
        for (const source of sources) {
          if (hasKey(source, 'class')) {
            merged = mergeClassNames(merged, source['class']);
          }
        }
        return merged;
      }
      case 'style': {
        let merged: unknown;
        for (const source of sources) {
          if (hasKey(source, 'style')) {
            merged = mergeStyles(merged, source['style']);
          }
        }
        return merged;
      }
      case 'ref':
        return sources.some((source) => source['ref'] != null) ? refFn : undefined;
      default:
        break;
    }
    if (isEventHandlerKey(key)) {
      const present = sources.some((source) => hasKey(source, key) && isHandlerValue(source[key]));
      return present ? handlerFor(key) : undefined;
    }
    const index = ownerOf(key);
    return index === -1 ? undefined : sources[index]?.[key];
  };

  const keys = (): Array<string> => {
    const seen = new Set<string>();
    for (const source of read()) {
      for (const key of Object.keys(source)) {
        seen.add(key);
      }
    }
    return [...seen];
  };

  const view: HTMLProps = new Proxy<HTMLProps>(
    {},
    {
      get: (_, key) => {
        if (key === $PROXY) {
          return view;
        }
        return typeof key === 'string' ? get(key) : undefined;
      },
      has: (_, key) => key === $PROXY || (typeof key === 'string' && ownerOf(key) !== -1),
      ownKeys: () => keys(),
      getOwnPropertyDescriptor: (_, key) => {
        if (typeof key !== 'string' || untrack(() => ownerOf(key)) === -1) {
          return undefined;
        }
        return { configurable: true, enumerable: true, get: () => get(key) };
      },
      set: () => false,
      deleteProperty: () => false,
    },
  );
  return view;
}

function applyRef(ref: unknown, el: unknown): void {
  if (typeof ref === 'function') {
    (ref as (el: unknown) => void)(el);
    return;
  }
  if (Array.isArray(ref)) {
    for (const entry of ref) {
      applyRef(entry, el);
    }
  }
}

export function mergeProps(...inputs: ReadonlyArray<PropsInput>): HTMLProps {
  return mergePropsN(inputs);
}

export function mergePropsN(inputs: ReadonlyArray<PropsInput>): HTMLProps {
  const sources = resolveSources(inputs);
  return createView(() => sources);
}

export function mergePropsLive(read: () => ReadonlyArray<PropsInput>): HTMLProps {
  const sources = createMemo(() => resolveSources(read()));
  return createView(sources);
}
