// Fixture for film/webview-through-chrome: each line marked RED fires the
// rule, and nothing else does.

declare const flags: ReadonlyArray<string>;

export const direct = () => new Bun.WebView({ backend: 'chrome' }); // RED film/webview-through-chrome
export const global = () => new globalThis.Bun.WebView({ backend: 'chrome' }); // RED film/webview-through-chrome
export const indexed = () => new Bun['WebView']({ backend: 'chrome' }); // RED film/webview-through-chrome

// Reading the class's members spawns nothing, and a type names no Chrome.
export const closeAll = () => Bun.WebView.closeAll();
export type View = Bun.WebView;
export const other = () => new URL(flags.join('&'), 'http://localhost');
