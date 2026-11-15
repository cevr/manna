/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's data module cannot import effect (docs/exact.md): an input it does not know is a plain `undefined`, and a call branches plainly. */

/**
 * Finding's sources, as `app.ts` registers them. `findStep(kind, text, a,
 * b)` runs one input of `step` and answers its view; the state lives here,
 * one per launch of the data module, as the player's does, and nothing of
 * it outlives a launch (the current app's find atoms do not either).
 * `findTiles()` answers the tiles' numbers, every hymn's, once the tiles
 * first show, numbers alone.
 *
 * An input's arguments: `screen` the stack's paths, space-joined, the top
 * last; `query` its text; `drumsOpen` the bar's hymn (0 with none); `turn`
 * the drum's name and the digit; `tile` the hymn; `pinch` the scale and
 * velocity; `wheel` the delta. A kind it does not know changes nothing.
 */

import type { Book } from '../hymns/book.ts';
import { initial, type Input, type State, step, type View, view } from './step.ts';

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
    case 'tile':
      return { kind, n: a };
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

/** The sources over `book`; `counts` counts the tiles' answers, given so a test can read it. */
export const findSources = (book: Book, counts: { tiles: number } = { tiles: 0 }) => {
  let state: State = initial;
  return {
    findStep: ([kind, text, a, b]: readonly [string, string, number, number]): View => {
      const input = inputOf(kind, text, a, b);
      state = input === undefined ? { ...state, serial: state.serial + 1 } : step(state, input);
      return view(state);
    },
    findTiles: (): Array<number> => {
      counts.tiles += 1;
      return book.hymns.map((hymn) => hymn.number);
    },
  };
};
