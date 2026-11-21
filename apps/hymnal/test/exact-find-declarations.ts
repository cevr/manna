/**
 * The find bar's, the drums' and the open search's declarations that the
 * Exact port reads in place of this app's sources
 * (`apps/hymnal-exact/src/find/decl/`, mapped by that app's tsconfig paths)
 * stay true to them: each source export the port calls is assigned to its
 * declaration, so the type check of `tsconfig.test.json` fails the day a
 * source's signature drifts from what the port was told. An `effect`
 * tagged enum is declared by the shapes it takes at run time, and an open
 * search by what `searchAt` answers: the source's are held to fit them.
 * Nothing here runs.
 */

import type * as Drums from '../../hymnal-exact/src/find/decl/drums';
import type * as Rules from '../../hymnal-exact/src/find/decl/find-rules';
import type * as Mode from '../../hymnal-exact/src/find/decl/search-mode';
import type * as Rows from '../../hymnal-exact/src/find/decl/rows';
import * as rules from '../src/home/find-rules';
import * as drums from '../src/player/drums';
import * as rows from '../src/reader/rows';
import * as mode from '../src/reader/search-mode';

/** `A`, which must be assignable to `B`. */
type Fits<A extends B, B> = A;

/** What the source's `searchAt` answers fits the declared open search. */
export type OpenHeld = Fits<ReturnType<typeof mode.searchAt>, Mode.Open>;

export const held = {
  drums: {
    FIRST: drums.FIRST,
    LAST: drums.LAST,
    DRUM_ORDER: drums.DRUM_ORDER,
    held: drums.held,
    digitsOf: drums.digitsOf,
    turn: drums.turn,
    foundOffset: drums.foundOffset,
  } satisfies typeof Drums,
  rows: {
    plainRowsOf: rows.plainRowsOf,
    STRONG: rows.STRONG,
    resultRowsOf: rows.resultRowsOf,
  } satisfies typeof Rows,
  rules: {
    Tiles: rules.Tiles,
    showTiles: rules.showTiles,
    tilesAt: rules.tilesAt,
    pinchAct: rules.pinchAct,
    rowOf: rules.rowOf,
    drawn: rules.drawn,
    inReach: rules.inReach,
    chosenOf: rules.chosenOf,
  } satisfies typeof Rules,
  mode: {
    searchAt: mode.searchAt satisfies (...args: Parameters<typeof Mode.searchAt>) => Mode.Open,
    modeAt: mode.modeAt satisfies (
      open: ReturnType<typeof mode.searchAt>,
      path: string,
    ) => ReturnType<typeof Mode.modeAt>,
  },
};
