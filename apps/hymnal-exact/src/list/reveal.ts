/* oxlint-disable effect/noNullish -- Exact's data module cannot import effect (docs/exact.md): a state not opened yet is a plain `undefined`. */

/**
 * The home list's pinned tab row, as the current app's `useTabReveal`
 * (`home/PinnedTabs.tsx`) runs it over `home/reveal.ts`: one state per
 * launch of the data module, stepped by the list's scroll reports
 * (`revealAt`), the app's own moves of the list (`jumped`: a tab chosen, a
 * tile picked, the rail, a landing) and the reader's touch on the list
 * (`touched`). Each input answers what the view draws: whether the row is
 * shown (its slide's end), whether it is in reach (`inReach`), whether the
 * list stands past the resting place (where the row may show at all), how
 * many points of the list's top it covers once its slide ends
 * (`shownHeight` at that end) and the offset it was stepped at.
 *
 * The current app's slide ends at the row's turn (`progress` 1 shown, 0
 * hidden), and goes to 0 at once at or above the resting place, so the
 * cover at a slide's end is `shownHeight` of the row's shown.
 *
 * Each answer also names its quiet band, so the view sends only the
 * reports that can turn something: past the resting place and outside a
 * hold, `revealAt` only moves the offset the run counts from (`edge`: the
 * deepest offset while hidden, `way` 1; the highest while shown, `way` -1)
 * until a report stands `travel` from it the other way. The view keeps
 * that edge itself over the reports it keeps back, and hands it with the
 * next input, which steps the state to it first: the same state as every
 * report sent one by one. `way` 0 asks for every report.
 */

import {
  hidden,
  inReach,
  jumped,
  type Reveal,
  revealAt,
  shownHeight,
  touched,
  travel,
} from '@manna/hymnal-app/home/reveal';

/** What the view draws of the pinned row after an input, and the band of reports it may keep back. */
export interface TabsAt {
  readonly shown: boolean;
  readonly reach: boolean;
  readonly past: boolean;
  readonly cover: number;
  readonly at: number;
  readonly way: number;
  readonly edge: number;
  readonly travel: number;
  readonly rest: number;
  readonly height: number;
}

/** The row's state, the list's last offset, its resting place and the row's height, in points. */
export interface Kept {
  readonly reveal: Reveal;
  readonly scroll: number;
  readonly rest: number;
  readonly height: number;
}

/**
 * One input, each with the edge of the reports the view kept back: a
 * scroll report at an offset, the app's move to an offset it knows
 * (`jump`) or where the list stands (`here`), or the reader's touch, the
 * last two at the list's offset as the view last saw it.
 */
export type Input =
  | {
      readonly kind: 'scroll';
      readonly at: number;
      readonly rest: number;
      readonly height: number;
      readonly edge: number;
    }
  | { readonly kind: 'jump' | 'here' | 'touch'; readonly at: number; readonly edge: number };

/** The row at the list's opening, its resting place `rest` and height `height`. */
export const opened = (rest: number, height: number): Kept => ({
  reveal: hidden(rest),
  scroll: 0,
  rest,
  height,
});

/** Which way the reports that turn nothing move the edge: 1 deeper while hidden, -1 higher while shown, 0 in a hold or at or above the resting place, where every report counts. */
const wayOf = (kept: Kept): number => {
  if (kept.reveal.held || kept.scroll <= kept.rest) return 0;
  if (kept.reveal.shown) return -1;
  return 1;
};

/** `kept` stepped to the edge of the reports the view kept back: the offset its run counts from, nothing turned. */
const caught = (kept: Kept, edge: number): Kept => {
  if (wayOf(kept) === 0) return kept;
  return { ...kept, reveal: revealAt(kept.reveal, edge, kept.rest) };
};

/** The state after `input`. */
export const stepped = (before: Kept, input: Input): Kept => {
  const kept = caught(before, input.edge);
  switch (input.kind) {
    case 'scroll':
      return {
        reveal: revealAt(kept.reveal, input.at, input.rest),
        scroll: input.at,
        rest: input.rest,
        height: input.height,
      };
    case 'jump':
    case 'here':
      return { ...kept, reveal: jumped(kept.reveal, input.at), scroll: input.at };
    case 'touch':
      return { ...kept, reveal: touched(kept.reveal, input.at, kept.rest), scroll: input.at };
  }
};

/** What the view draws of `kept`, and its quiet band. */
export const drawn = (kept: Kept): TabsAt => ({
  shown: kept.reveal.shown,
  reach: inReach(kept.reveal, kept.scroll, kept.rest),
  past: kept.scroll > kept.rest,
  cover: shownHeight(Number(kept.reveal.shown), kept.height, kept.scroll, kept.rest),
  at: kept.scroll,
  way: wayOf(kept),
  edge: kept.reveal.from,
  travel,
  rest: kept.rest,
  height: kept.height,
});

/** The input a call names: `scroll` with the offset, the resting place and the row's height; `jump`, `here` or `touch` with the offset; each with the kept-back edge. */
const inputOf = (
  kind: string,
  at: number,
  rest: number,
  height: number,
  edge: number,
): Input | undefined => {
  if (kind === 'scroll') return { kind, at, rest, height, edge };
  if (kind === 'jump' || kind === 'here' || kind === 'touch') return { kind, at, edge };
  return undefined;
};

/**
 * The pinned row's source, as `app.ts` registers it: `listTabsStep(kind,
 * at, rest, height, edge)` steps the launch's one state by an input and
 * answers what the view draws. A kind it does not know changes nothing.
 */
export const revealSources = () => {
  let kept: Kept | undefined;
  return {
    listTabsStep: ([kind, at, rest, height, edge]: readonly [
      string,
      number,
      number,
      number,
      number,
    ]): TabsAt => {
      const now = kept ?? opened(rest, height);
      const input = inputOf(kind, at, rest, height, edge);
      kept = now;
      if (input !== undefined) kept = stepped(now, input);
      return drawn(kept);
    },
  };
};
