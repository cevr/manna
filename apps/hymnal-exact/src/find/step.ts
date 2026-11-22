/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's data module imports no effect itself (docs/exact.md), so no open search is a plain `undefined` and each input branches plainly; the current app's rules it calls carry their own. */

/**
 * Finding a hymn, as one pure step: `step(state, input)` answers the next
 * state, and `view(state)` what the find bar, the drums and the tiles show
 * and where a chosen hymn goes. Every rule is the current app's: the bar's
 * row, its controls and the chosen mark (`home/finding.ts`: `rowOf`,
 * `drawn`, `inReach`, `chosenOf`), the open search (`reader/place.ts`:
 * `searchAt`, `modeAt`), the tiles (`showTiles`, `tilesAt`), the pinch
 * (`pinchAct`), the drums' number (`player/drums.ts`: `turn`, `held`,
 * `digitsOf`) and where a chosen hymn opens (`home/opening.ts`:
 * `openingAt`).
 *
 * The screens are the navigation stack's paths, the top last (`screen`). A
 * control's input acts only while the top screen's bar draws that control
 * and it is in reach, so with the drums open nothing but the `#` and the
 * drums acts, and closing them moves no route. A search belongs to the
 * screen it opened on, and closes once that screen leaves the stack. The
 * tiles are the home list's; every other screen reads them hidden.
 *
 * A pinch commits at most once a gesture (`pinchBegin` starts one); a
 * trackpad's pinch, a run of `wheel` deltas with no begin or end, keeps its
 * scale as it goes and starts afresh once it commits.
 */

import {
  type Chosen,
  type Control,
  type Row,
  chosenOf,
  drawn,
  inReach,
  pinchAct,
  rowOf,
  showTiles,
  Tiles,
  tilesAt,
} from '@manna/hymnal-app/home/find-rules';
import { openingAt } from '@manna/hymnal-app/home/opening';
import { type Drum, digitsOf, FIRST, held, turn } from '@manna/hymnal-app/player/drums';
import { modeAt, searchAt } from '@manna/hymnal-app/reader/search-mode';

/** The home list's path: the one screen with tiles. */
export const HOME = '/';

type Open = ReturnType<typeof searchAt>;

/** Where a chosen hymn went: pushed over the screen, or in the hymn page's place; `serial` counts them. */
export interface Go {
  readonly serial: number;
  readonly how: 'none' | 'push' | 'replace';
  readonly path: string;
}

export interface State {
  /** Counts the steps, so the view takes the latest answer. */
  readonly serial: number;
  /** The stack's paths, the top last. */
  readonly stack: ReadonlyArray<string>;
  /** The open search, if one is open. */
  readonly search: Open | undefined;
  readonly query: string;
  readonly drums: boolean;
  /** The number the drums dial, held to the book. */
  readonly number: number;
  readonly tiles: Tiles;
  /** Whether this pinch gesture has committed. */
  readonly spent: boolean;
  /** A trackpad pinch's scale so far. */
  readonly wheel: number;
  readonly go: Go;
}

export type Input =
  | { readonly kind: 'screen'; readonly stack: ReadonlyArray<string> }
  | { readonly kind: 'searchOn' }
  | { readonly kind: 'searchOff' }
  | { readonly kind: 'query'; readonly text: string }
  /** The `#`; `bar` is the docked bar's hymn, 0 with none: the drums open on it (`bar.ts` `openAt`). */
  | { readonly kind: 'drumsOpen'; readonly bar: number }
  | { readonly kind: 'drumsClose' }
  | { readonly kind: 'turn'; readonly drum: Drum; readonly n: number }
  | { readonly kind: 'open' }
  | { readonly kind: 'tilesShow' }
  | { readonly kind: 'tilesDone' }
  | { readonly kind: 'pinchBegin' }
  | { readonly kind: 'pinch'; readonly scale: number; readonly velocity: number }
  | { readonly kind: 'wheel'; readonly deltaY: number };

export const initial: State = {
  serial: 0,
  stack: [HOME],
  search: undefined,
  query: '',
  drums: false,
  number: FIRST,
  tiles: Tiles.Hidden(),
  spent: false,
  wheel: 1,
  go: { serial: 0, how: 'none', path: '' },
};

/** The top screen's path. */
export const topOf = (state: State): string => state.stack.at(-1) ?? HOME;

/** The search mode of the screen at `path`. */
const modeOf = (state: State, path: string) =>
  state.search === undefined ? 'off' : modeAt(state.search, path);

/** The row the top screen's bar shows. */
export const rowAt = (state: State): Row =>
  rowOf(modeOf(state, topOf(state)), tilesAt(state.tiles, topOf(state)));

/** Whether the top screen's bar draws `control` and it takes a touch. */
const acts = (state: State, control: Control): boolean =>
  drawn(rowAt(state)).includes(control) && inReach(control, state.drums);

/** Whether the tiles show on the top screen. */
const tilesShown = (state: State): boolean => tilesAt(state.tiles, topOf(state))._tag === 'Shown';

/** Whether the top screen takes a pinch: the home list, with search and the drums closed. */
const pinchable = (state: State): boolean =>
  topOf(state) === HOME && modeOf(state, HOME) === 'off' && !state.drums;

/** Whether the home list's `All at once` control takes a press: on the list, folded, the drums closed. */
const tilesControl = (state: State): boolean =>
  topOf(state) === HOME && rowAt(state) === 'folded' && !state.drums;

/** Hymn `n` chosen on the top screen: where `openingAt` sends it, the drums closed, and the search closed off a push. */
const chose = (state: State, n: number): State => {
  const how = openingAt(topOf(state), n);
  const closed = { ...state, drums: false };
  const searched =
    how === 'push' || modeOf(state, topOf(state)) === 'off'
      ? closed
      : { ...closed, search: undefined, query: '' };
  if (how === 'stay') return searched;
  return { ...searched, go: { serial: state.go.serial + 1, how, path: `/hymns/${n}` } };
};

/** A pinch's report: the tiles open or close when it asks for the act the list wants, once a gesture. */
const pinched = (state: State, scale: number, velocity: number): State => {
  if (state.spent || !pinchable(state)) return state;
  const wants = tilesShown(state) ? 'zoomIn' : 'zoomOut';
  if (pinchAct(scale, velocity) !== wants) return state;
  const tiles =
    wants === 'zoomOut' ? showTiles(state.tiles, { offset: 0, cover: 0 }) : Tiles.Hidden();
  return { ...state, tiles, spent: true };
};

/** The stack moved to `paths`: a search whose screen left it closes, and the drums close when the top changes. */
const screened = (state: State, paths: ReadonlyArray<string>): State => {
  const stack = paths.length === 0 ? [HOME] : [...paths];
  const open = state.search;
  const search =
    open !== undefined && stack.some((path) => modeAt(open, path) !== 'off') ? open : undefined;
  return {
    ...state,
    stack,
    search,
    query: search === undefined ? '' : state.query,
    drums: stack.at(-1) === topOf(state) && state.drums,
  };
};

/** A ctrl+wheel's turn as a pinch: the scale it gathers, and the act once it crosses. */
const wheeled = (state: State, deltaY: number): State => {
  const scale = state.wheel * (1 - deltaY / 100);
  if (!pinchable(state) || !Number.isFinite(scale) || scale <= 0) return { ...state, wheel: 1 };
  const after = pinched({ ...state, spent: false }, scale, 0);
  if (after.spent) return { ...after, wheel: 1, spent: state.spent };
  return { ...state, wheel: scale };
};

/** The drums' and tiles' inputs. */
const dialled = (state: State, input: Input): State => {
  switch (input.kind) {
    case 'drumsOpen':
      if (!acts(state, 'hash')) return state;
      if (state.drums) return { ...state, drums: false };
      return { ...state, drums: true, number: input.bar > 0 ? held(input.bar) : FIRST };
    case 'drumsClose':
      return { ...state, drums: false };
    case 'turn':
      if (!state.drums) return state;
      return { ...state, number: turn(state.number, input.drum, input.n) };
    case 'open':
      if (!state.drums) return state;
      return chose(state, state.number);
    case 'tilesShow':
      if (!tilesControl(state)) return state;
      return { ...state, tiles: showTiles(state.tiles, { offset: 0, cover: 0 }) };
    case 'tilesDone':
      if (!tilesShown(state) || state.drums) return state;
      return { ...state, tiles: Tiles.Hidden() };
    default:
      return state;
  }
};

const next = (state: State, input: Input): State => {
  switch (input.kind) {
    case 'screen':
      return screened(state, input.stack);
    case 'searchOn':
      if (!acts(state, 'search')) return state;
      return { ...state, search: searchAt(topOf(state), 'field'), query: '' };
    case 'searchOff':
      if (!acts(state, 'cancel')) return state;
      return { ...state, search: undefined, query: '' };
    case 'query':
      if (!acts(state, 'box')) return state;
      return { ...state, query: input.text };
    case 'pinchBegin':
      return { ...state, spent: false };
    case 'pinch':
      return pinched(state, input.scale, input.velocity);
    case 'wheel':
      return wheeled(state, input.deltaY);
    default:
      return dialled(state, input);
  }
};

/** The state after `input`. */
export const step = (state: State, input: Input): State => ({
  ...next(state, input),
  serial: state.serial + 1,
});

/** What the view draws. */
export interface View {
  readonly serial: number;
  readonly top: string;
  readonly row: Row;
  readonly chosen: Chosen;
  readonly searchDrawn: boolean;
  readonly searchReach: boolean;
  readonly boxDrawn: boolean;
  readonly boxReach: boolean;
  readonly cancelDrawn: boolean;
  readonly cancelReach: boolean;
  readonly hashReach: boolean;
  /** Whether the home list's `All at once` control shows and takes a press. */
  readonly tilesControl: boolean;
  /** The path of the screen the open search belongs to; "" with none. */
  readonly searchAt: string;
  readonly query: string;
  /** Whether the top screen shows a search's results. */
  readonly results: boolean;
  readonly drums: boolean;
  readonly number: number;
  readonly hundreds: number;
  readonly tens: number;
  readonly ones: number;
  /** Whether the tiles show on the top screen. */
  readonly tiles: boolean;
  /** Whether the home list is at its tiles, shown or under a pushed screen. */
  readonly homeTiles: boolean;
  readonly pinchable: boolean;
  readonly go: Go;
}

export const view = (state: State): View => {
  const row = rowAt(state);
  const has = (control: Control) => drawn(row).includes(control);
  const digits = digitsOf(state.number);
  const searchPath = state.search?._tag === 'Some' ? state.search.value.path : '';
  return {
    serial: state.serial,
    top: topOf(state),
    row,
    chosen: chosenOf(row, state.drums),
    searchDrawn: has('search'),
    searchReach: acts(state, 'search'),
    boxDrawn: has('box'),
    boxReach: acts(state, 'box'),
    cancelDrawn: has('cancel'),
    cancelReach: acts(state, 'cancel'),
    hashReach: acts(state, 'hash'),
    tilesControl: tilesControl(state),
    searchAt: searchPath,
    query: state.query,
    results: row === 'open' && state.query.trim() !== '',
    drums: state.drums,
    number: state.number,
    hundreds: digits.hundreds,
    tens: digits.tens,
    ones: digits.ones,
    tiles: tilesShown(state),
    homeTiles: state.tiles._tag === 'Shown',
    pinchable: pinchable(state),
    go: state.go,
  };
};
