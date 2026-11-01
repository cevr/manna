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
