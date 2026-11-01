/**
 * The home list's find bar (`FindBar.tsx`), as data: which row it shows and
 * which of its controls a touch or VoiceOver reaches, and `All at once`,
 * which the bar asks for and the home screen shows (`Tiles`).
 *
 * The bar shows one of three rows. Folded: `Search`, `All at once` and the
 * `#`. Open while search is on (`searchOpen`): the search box, the `#` and
 * `Cancel`. While `All at once` shows its tiles: the `#` alone, since the
 * tiles' `Done` is the way back. While the find drums are open, the `#`
 * alone is reachable: `FindBar` lets a touch on any other point of the row
 * through to the drums' backdrop, so a tap there closes the drums and fires
 * nothing.
 */

import { Data } from 'effect';
import * as Atom from 'effect/reactivity/Atom';

import type { SearchMode } from '~/reader/place';

/** Where the list stood as it zoomed out: its offset, and how far the layer over its top covered it. */
export interface Stood {
  readonly offset: number;
  readonly cover: number;
}

/**
 * `All at once`: hidden; asked for by the find bar, which cannot read the
 * list's offset, so the home screen shows it with the place it reads then;
 * or shown, over the list as it `stood` when it zoomed out.
 */
export type Tiles = Data.TaggedEnum<{
  Hidden: {};
  Asked: {};
  Shown: { readonly stood: Stood };
}>;
export const Tiles = Data.taggedEnum<Tiles>();

/** `All at once` on the home list, app-wide: the find bar asks for it and the home screen shows it. */
export const tiles = Atom.make<Tiles>(Tiles.Hidden()).pipe(Atom.keepAlive);

/** The find bar's `All at once` pressed: hidden tiles are asked for; asked or shown ones stay as they are. */
export const askTiles = (state: Tiles): Tiles =>
  Tiles.$match(state, { Hidden: () => Tiles.Asked(), Asked: () => state, Shown: () => state });

/**
 * The list zoomed out where it `stood`: hidden or asked tiles show with
 * that place; shown ones keep the place they took, so each zoom reads the
 * list's place once.
 */
export const showTiles = (state: Tiles, stood: Stood): Tiles =>
  Tiles.$match(state, {
    Hidden: () => Tiles.Shown({ stood }),
    Asked: () => Tiles.Shown({ stood }),
    Shown: () => state,
  });

/** The row the find bar shows. */
export type Row = 'folded' | 'open' | 'tiles';

/** The bar's row for search's `mode` and `All at once`'s `state`: search open wins, as it draws over the tiles. */
export const rowOf = (mode: SearchMode, state: Tiles): Row => {
  if (mode !== 'off') return 'open';
  if (Tiles.$is('Hidden')(state)) return 'folded';
  return 'tiles';
};

/** One of the bar's controls. */
export type Control = 'search' | 'grid' | 'box' | 'cancel' | 'hash';

/** The controls `row` draws, in reading order. */
export const drawn = (row: Row): ReadonlyArray<Control> => {
  switch (row) {
    case 'folded':
      return ['search', 'grid', 'hash'];
    case 'open':
      return ['box', 'hash', 'cancel'];
    case 'tiles':
      return ['hash'];
  }
};

/** Whether `control`, drawn, takes a touch and VoiceOver's focus: only the `#` while the drums are open. */
export const inReach = (control: Control, drums: boolean): boolean => !drums || control === 'hash';
