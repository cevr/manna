/**
 * The find bar's and the tiles' rules, as the port reads them. This file is
 * `@manna/hymnal-app/home/find-rules` as Exact's type check and the
 * workspace's typecheck read it (the app's `tsconfig.json` and
 * `tsconfig.src.json` map it here): Exact's check stages a package's
 * declarations, never its source, and the source's `Tiles` is an `effect`
 * tagged enum, named here by the two shapes it takes at run time. It names
 * only what the port reads, in its own terms;
 * `apps/hymnal/test/exact-find-declarations.ts` holds it to the source.
 */

import type { SearchMode } from '@manna/hymnal-app/reader/search-mode';

/** Where the list stood as the tiles showed. */
interface Stood {
  readonly offset: number;
  readonly cover: number;
}

/** `All at once`: hidden, or shown where the list stood. */
export type Tiles = { readonly _tag: 'Hidden' } | { readonly _tag: 'Shown'; readonly stood: Stood };

/** The tiles' two constructors. */
export declare const Tiles: {
  readonly Hidden: () => Tiles;
  readonly Shown: (args: { readonly stood: Stood }) => Tiles;
};

/** Hidden tiles shown where the list stood; shown ones as they were. */
export declare const showTiles: (state: Tiles, stood: Stood) => Tiles;

/** The tiles as the screen at `path` reads them: hidden off the home list. */
export declare const tilesAt: (state: Tiles, path: string) => Tiles;

/** What a pinch asks of the home list. */
export type PinchAct = 'zoomOut' | 'zoomIn' | 'none';

/** What a pinch at `scale`, moving at `velocity`, asks. */
export declare const pinchAct: (scale: number, velocity: number) => PinchAct;

/** The row the find bar shows. */
export type Row = 'folded' | 'open' | 'tiles';

/** The bar's row for the screen's search `mode` and the tiles it reads. */
export declare const rowOf: (mode: SearchMode, state: Tiles) => Row;

/** One of the bar's controls. */
export type Control = 'search' | 'box' | 'cancel' | 'hash';

/** The controls `row` draws, in reading order. */
export declare const drawn: (row: Row) => ReadonlyArray<Control>;

/** Whether `control`, drawn, takes a touch while the drums are open or not. */
export declare const inReach: (control: Control, drums: boolean) => boolean;

/** The control the chosen mark stands behind. */
export type Chosen = 'hash' | 'search' | 'none';

/** The control `row` marks chosen, the drums open or not. */
export declare const chosenOf: (row: Row, drumsOpen: boolean) => Chosen;
