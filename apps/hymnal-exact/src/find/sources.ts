/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's data module cannot import effect (docs/exact.md): an input it does not know is a plain `undefined`, and a call branches plainly. */

/**
 * Finding's sources, as `app.ts` registers them. `findStep(kind, text, a,
 * b)` runs one input of `step` and answers its view; the state lives here,
 * one per launch of the data module, as the player's does, and nothing of
 * it outlives a launch (the current app's find atoms do not either).
 * `findGroupTiles(tab, favourites, recent, playing)` answers All at
 * once's tiles for the tab in use (`tiles.ts`), asked once the tiles first
 * show; `findFollowRow(tab, n, favourites, recent)` the id of the home
 * list's row the drums' number `n` scrolls to, "" with none (`follow.ts`).
 *
 * An input's arguments: `screen` the stack's paths, space-joined, the top
 * last; `query` its text; `drumsOpen` the bar's hymn (0 with none); `turn`
 * the drum's name and the digit; `pinch` the scale and velocity; `wheel`
 * the delta. A kind it does not know changes nothing. `pinchRun` takes a
 * run of the pinch's reports as its text and runs each input it asks for in
 * order (`src/pinch/run.ts`).
 */

import type { TabSource } from '../home/tabs.ts';
import type { Book } from '../hymns/book.ts';
import { runOf } from '../pinch/run.ts';
import { followRow, listedRows } from './follow.ts';
import { initial, type Input, type State, step, type View, view } from './step.ts';
import { type GroupTile, groupTiles, tileAt } from './tiles.ts';

/** The player's bar at rest, over the home indicator (the current app's `REST`, src/player/bar.ts). */
const REST = 56;
/** The find bar's height and each round control's side in it (`HASH`, bar.ts). */
const HASH = 44;
/** The room between the find bar and what it rides over (`HASH_GAP`, bar.ts). */
const HASH_GAP = 8;
/** How far the docked bar's foot stands over the bottom inset: centred in the resting bar (`DOCKED_LIFT`, bar.ts). */
const DOCKED_LIFT = (REST - HASH) / 2;
/** One stop of a drum (`DETENT`, src/player/dial.ts). */
const DETENT = 52;
/** The drums' panel's room round its rows (`PANEL_PAD`, src/player/DialPanel.tsx). */
const PANEL_PAD = 8;
/** The room between the panel's rows (`ROW_GAP`, DialPanel.tsx). */
const ROW_GAP = 10;
/** The room a list keeps past the `#`'s top after its last row (`END_ROOM`, src/reader/end.ts). */
const END_ROOM = 32;

/**
 * The current app's measures of the find bar and the drums, in points, as
 * `findPlaces()` answers them for `features/find.contract` to place the bar
 * and size the drums by: the bar's side (`hash`), its room over what it
 * rides (`gap`), its lift when docked (`lift`), the player's bar at rest
 * (`rest`), a drum's stop (`detent`), the drums' panel's padding and row
 * gap (`pad`, `rowGap`), and the room a list keeps past the `#` after its
 * last row (`end`, `features/list.contract`'s `listEnd`).
 */
export interface Places {
  readonly hash: number;
  readonly gap: number;
  readonly lift: number;
  readonly rest: number;
  readonly detent: number;
  readonly pad: number;
  readonly rowGap: number;
  readonly end: number;
}

const places: Places = {
  hash: HASH,
  gap: HASH_GAP,
  lift: DOCKED_LIFT,
  rest: REST,
  detent: DETENT,
  pad: PANEL_PAD,
  rowGap: ROW_GAP,
  end: END_ROOM,
};

const DRUMS = ['hundreds', 'tens', 'ones'] as const;

/** A screen's path: its address without the query or fragment a launch may add (a test's fixture origin). */
const pathOf = (url: string): string => url.split(/[?#]/u)[0] || '/';

/** The input a call names. */
export const inputOf = (kind: string, text: string, a: number, b: number): Input | undefined => {
  switch (kind) {
    case 'screen':
      return {
        kind,
        stack: text
          .split(' ')
          .filter((url) => url !== '')
          .map(pathOf),
      };
    case 'query':
      return { kind, text };
    case 'drumsOpen':
      return { kind, bar: a };
    case 'turn': {
      const drum = DRUMS.find((each) => each === text);
      if (drum === undefined) return undefined;
      return { kind, drum, n: a };
    }
    case 'pinch':
      return { kind, scale: a, velocity: b };
    case 'wheel':
      return { kind, deltaY: a };
    case 'searchOn':
    case 'searchOff':
    case 'drumsClose':
    case 'open':
    case 'tilesShow':
    case 'tilesDone':
    case 'pinchBegin':
      return { kind };
    default:
      return undefined;
  }
};

/**
 * The sources over `book` and its back-matter indexes as they are when
 * asked (`book.indexes()`), or `indexes` when given;
 * `counts` counts the tiles' answers, given so a test can read it.
 */
export const findSources = (
  book: Book,
  counts: { tiles: number } = { tiles: 0 },
  indexes?: TabSource['indexes'],
) => {
  let state: State = initial;
  const source = (): TabSource => ({ book, indexes: indexes ?? book.indexes() });
  return {
    findStep: ([kind, text, a, b]: readonly [string, string, number, number]): View => {
      if (kind === 'pinchRun') {
        state = runOf(text).reduce(step, state);
        state = { ...state, serial: state.serial + 1 };
        return view(state);
      }
      const input = inputOf(kind, text, a, b);
      state = input === undefined ? { ...state, serial: state.serial + 1 } : step(state, input);
      return view(state);
    },
    findPlaces: (): Places => places,
    findGroupTiles: ([tab, favourites, recent, playing]: readonly [
      string,
      ReadonlyArray<number>,
      ReadonlyArray<number>,
      number,
    ]): Array<GroupTile> => {
      counts.tiles += 1;
      return groupTiles(source(), tab, favourites, recent, playing);
    },
    findTileAt: ([tab, ids, favourites, recent]: readonly [
      string,
      ReadonlyArray<string>,
      ReadonlyArray<number>,
      ReadonlyArray<number>,
    ]) => ({ index: tileAt(source(), tab, ids, favourites, recent) }),
    findFollowRow: ([tab, n, favourites, recent]: readonly [
      string,
      number,
      ReadonlyArray<number>,
      ReadonlyArray<number>,
    ]) => ({
      row: followRow(listedRows(source(), tab, favourites, recent), n),
    }),
  };
};
