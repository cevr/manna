import { Predicate } from 'effect';

export interface PageAsked {
  readonly url: string;
  readonly mac: boolean;
}

export interface PageRequest extends PageAsked {
  readonly fetch: typeof globalThis.fetch;
  readonly signal: AbortSignal;
}

export interface PageSink {
  readonly head: (html: string) => void;
  readonly write: (html: string) => void;
  readonly end: () => void;
  readonly fail: (reason: string) => void;
}

export interface PageRender {
  readonly bodyClass: string;
  readonly render: (request: PageRequest, sink: PageSink) => void;
}

export const isPageRender = (value: unknown): value is PageRender =>
  Predicate.hasProperty(value, 'render') &&
  Predicate.isFunction(value.render) &&
  Predicate.hasProperty(value, 'bodyClass') &&
  Predicate.isString(value.bodyClass);

export const PAGE_ROOT = 'data-page-root';

export const PAGE_MOUNTED = 'data-page-mounted';

export const PAGE_CUT = 'data-page-cut';

export const PAGE_CUT_MARK = `<template ${PAGE_CUT}></template>`;

export const PAGE_STYLE = 'data-page-style';
