/** How a screen is in search mode, or `off`. */
export type SearchMode = 'off' | 'field' | 'about';

/** The one open search: the path of the screen it opened on, and how it opened. */
export interface Searching {
  readonly path: string;
  readonly mode: Exclude<SearchMode, 'off'>;
}

/** An open search, as `searchAt` makes one: an `Option` by the shapes it takes. */
export type Open = { readonly _tag: 'None' } | { readonly _tag: 'Some'; readonly value: Searching };

/** Search open on the screen at `path`, opened by `mode`. */
export declare const searchAt: (path: string, mode: Searching['mode']) => Open;

/** The search mode of the screen at `path`, for a search `searchAt` made. */
export declare const modeAt: (open: Open, path: string) => SearchMode;
