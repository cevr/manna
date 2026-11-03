import { Data } from 'effect';
import * as Atom from 'effect/reactivity/Atom';

import type { SearchMode } from '~/reader/place';

export interface Stood {
  readonly offset: number;
  readonly cover: number;
}

export type Tiles = Data.TaggedEnum<{
  Hidden: {};
  Shown: { readonly stood: Stood };
}>;
export const Tiles = Data.taggedEnum<Tiles>();

export const tiles = Atom.make<Tiles>(Tiles.Hidden()).pipe(Atom.keepAlive);

export const showTiles = (state: Tiles, stood: Stood): Tiles =>
  Tiles.$match(state, {
    Hidden: () => Tiles.Shown({ stood }),
    Shown: () => state,
  });

export const tilesAt = (state: Tiles, path: string): Tiles => {
  if (path === '/') return state;
  return Tiles.Hidden();
};

export type PinchAct = 'zoomOut' | 'zoomIn' | 'none';

export const pinchAct = (scale: number, velocity: number): PinchAct => {
  if (scale <= 0.8 || (scale < 0.95 && velocity <= -0.5)) return 'zoomOut';
  if (scale >= 1.25 || (scale > 1.05 && velocity >= 0.5)) return 'zoomIn';
  return 'none';
};

export type Row = 'folded' | 'open' | 'tiles';

export const rowOf = (mode: SearchMode, state: Tiles): Row => {
  if (mode !== 'off') return 'open';
  if (Tiles.$is('Hidden')(state)) return 'folded';
  return 'tiles';
};

export type Control = 'search' | 'box' | 'cancel' | 'hash';

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

export const inReach = (control: Control, drums: boolean): boolean => !drums || control === 'hash';

export type Chosen = 'hash' | 'search';

export const chosenOf = (row: Row, drumsOpen: boolean): Chosen => {
  if (drumsOpen || row !== 'open') return 'hash';
  return 'search';
};

export type HashLook = 'alone' | 'chosen' | 'unchosen';

export const hashLookOf = (row: Row, chosen: Chosen): HashLook => {
  if (row === 'tiles') return 'alone';
  if (chosen === 'hash') return 'chosen';
  return 'unchosen';
};
