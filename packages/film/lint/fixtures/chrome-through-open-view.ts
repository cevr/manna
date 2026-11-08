// Fixture for film/chrome-through-open-view: each line marked RED fires the
// rule, and nothing else does.

import { launch } from 'puppeteer-core'; // RED film/chrome-through-open-view

declare const flags: ReadonlyArray<string>;
declare const require: (name: string) => unknown;

export const direct = () => new Bun.WebView({ backend: 'chrome' }); // RED film/chrome-through-open-view
export const global = () => new globalThis.Bun.WebView({ backend: 'chrome' }); // RED film/chrome-through-open-view
export const indexed = () => new Bun['WebView']({ backend: 'chrome' }); // RED film/chrome-through-open-view
export const later = () => import('puppeteer-core'); // RED film/chrome-through-open-view
export const required = () => require('puppeteer-core'); // RED film/chrome-through-open-view
export const launched = launch;

// Reading the class's members spawns nothing, a type names no Chrome, and another package is no Chrome.
export const closeAll = () => Bun.WebView.closeAll();
export type View = Bun.WebView;
export const other = () => new URL(flags.join('&'), 'http://localhost');
export const elsewhere = () => import('puppeteer-like');
