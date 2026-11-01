/**
 * The find bar (`FindBar.tsx`), as data: which row it shows and which of
 * its controls a touch or VoiceOver reaches, and `All at once`, the home
 * list's tiles (`Tiles`).
 *
 * The bar stands on every screen where the `#` stands, and shows one of
 * three rows. Folded: `Search` and the `#`. Open while search is on at the
 * screen's path (`modeAt`): the search box, the `#` and `Cancel`. While the
 * home list shows `All at once`: the `#` alone, since the tiles' `Done` is
 * the way back. While the find drums are open, the `#` alone is reachable:
 * `FindBar` lets a touch on any other point of the row through to the
 * drums' backdrop, so a tap there closes the drums and fires nothing.
 */

import { Data } from 'effect';
import * as Atom from 'effect/reactivity/Atom';

import type { SearchMode } from '~/reader/place';

/** Where the list stood as it zoomed out: its offset, and how far the layer over its top covered it. */
export interface Stood {
  readonly offset: number;
  readonly cover: number;
}

/** `All at once`: hidden, or shown over the list as it `stood` when it zoomed out. */
export type Tiles = Data.TaggedEnum<{
  Hidden: {};
  Shown: { readonly stood: Stood };
}>;
export const Tiles = Data.taggedEnum<Tiles>();

/** `All at once` on the home list, app-wide: the home screen shows it, and the find bar reads it. */
export const tiles = Atom.make<Tiles>(Tiles.Hidden()).pipe(Atom.keepAlive);

/**
 * The list zoomed out where it `stood`: hidden tiles show with that place;
 * shown ones keep the place they took, so each zoom reads the list's place
 * once.
 */
export const showTiles = (state: Tiles, stood: Stood): Tiles =>
  Tiles.$match(state, {
    Hidden: () => Tiles.Shown({ stood }),
    Shown: () => state,
  });

/** The tiles as the bar of the screen at `path` reads them: they belong to the home list (`/`), and read hidden on any other screen. */
export const tilesAt = (state: Tiles, path: string): Tiles => {
  if (path === '/') return state;
  return Tiles.Hidden();
};

/** What a pinch asks of the home list: zoom out to `All at once`, zoom back in to the list, or nothing. */
export type PinchAct = 'zoomOut' | 'zoomIn' | 'none';

/**
 * What a pinch at `scale` (1 where the fingers landed), moving at
 * `velocity` (scale per second, below 0 while the fingers close), asks.
 * Out at 0.8 or less, in at 1.25 or more; between 0.95 and 1.05 it asks
 * nothing, and between those bands only a pinch moving at 0.5 a second or
 * faster the same way asks. The gesture asks with velocity 0 while the
 * fingers move, and with their velocity as they lift, so a quick short
 * pinch commits too, and a scroll's stray second finger commits nothing.
 */
export const pinchAct = (scale: number, velocity: number): PinchAct => {
  if (scale <= 0.8 || (scale < 0.95 && velocity <= -0.5)) return 'zoomOut';
  if (scale >= 1.25 || (scale > 1.05 && velocity >= 0.5)) return 'zoomIn';
  return 'none';
};

/** The row the find bar shows. */
export type Row = 'folded' | 'open' | 'tiles';

/**
 * The bar's row for the screen's search `mode` and the tiles `state` it
 * reads (`tilesAt`): search open wins, as it draws over the tiles.
 */
export const rowOf = (mode: SearchMode, state: Tiles): Row => {
  if (mode !== 'off') return 'open';
  if (Tiles.$is('Hidden')(state)) return 'folded';
  return 'tiles';
};

/** One of the bar's controls. */
export type Control = 'search' | 'box' | 'cancel' | 'hash';

/** The controls `row` draws, in reading order. */
export const drawn = (row: Row): ReadonlyArray<Control> => {
  switch (row) {
    case 'folded':
      return ['search', 'hash'];
    case 'open':
      return ['box', 'hash', 'cancel'];
    case 'tiles':
      return ['hash'];
  }
};

/** Whether `control`, drawn, takes a touch and VoiceOver's focus: only the `#` while the drums are open. */
export const inReach = (control: Control, drums: boolean): boolean => !drums || control === 'hash';
