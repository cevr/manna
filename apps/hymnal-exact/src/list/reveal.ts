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
 */

import {
  hidden,
  inReach,
  jumped,
  type Reveal,
  revealAt,
  shownHeight,
  touched,
} from '@manna/hymnal-app/home/reveal';

/** What the view draws of the pinned row after an input. */
export interface TabsAt {
  readonly shown: boolean;
  readonly reach: boolean;
  readonly past: boolean;
  readonly cover: number;
  readonly at: number;
}

/** The row's state, the list's last offset, its resting place and the row's height, in points. */
export interface Kept {
  readonly reveal: Reveal;
  readonly scroll: number;
  readonly rest: number;
  readonly height: number;
}

/** One input: a scroll report at an offset, the app's move to an offset it knows (`jump`) or where the list stands (`here`, a move whose offset only the next report says), or the reader's touch. */
export type Input =
  | { readonly kind: 'scroll'; readonly at: number; readonly rest: number; readonly height: number }
  | { readonly kind: 'jump'; readonly at: number }
  | { readonly kind: 'here' }
  | { readonly kind: 'touch' };

/** The row at the list's opening, its resting place `rest` and height `height`. */
export const opened = (rest: number, height: number): Kept => ({
  reveal: hidden(rest),
  scroll: 0,
  rest,
  height,
});

/** The state after `input`. */
export const stepped = (kept: Kept, input: Input): Kept => {
  switch (input.kind) {
    case 'scroll':
      return {
        reveal: revealAt(kept.reveal, input.at, input.rest),
        scroll: input.at,
        rest: input.rest,
        height: input.height,
      };
    case 'jump':
      return { ...kept, reveal: jumped(kept.reveal, input.at), scroll: input.at };
    case 'here':
      return { ...kept, reveal: jumped(kept.reveal, kept.scroll) };
    case 'touch':
      return { ...kept, reveal: touched(kept.reveal, kept.scroll, kept.rest) };
  }
};

/** What the view draws of `kept`. */
export const drawn = (kept: Kept): TabsAt => ({
  shown: kept.reveal.shown,
  reach: inReach(kept.reveal, kept.scroll, kept.rest),
  past: kept.scroll > kept.rest,
  cover: shownHeight(Number(kept.reveal.shown), kept.height, kept.scroll, kept.rest),
  at: kept.scroll,
});

/** The input a call names: `scroll` with the offset, the resting place and the row's height; `jump` with the offset the app moves the list to; `here` the app's move where the list stands; `touch`. */
const inputOf = (kind: string, at: number, rest: number, height: number): Input | undefined => {
  if (kind === 'scroll') return { kind, at, rest, height };
  if (kind === 'jump') return { kind, at };
  if (kind === 'here' || kind === 'touch') return { kind };
  return undefined;
};

/**
 * The pinned row's source, as `app.ts` registers it: `listTabsStep(kind,
 * at, rest, height)` steps the launch's one state by an input and answers
 * what the view draws. A kind it does not know changes nothing.
 */
export const revealSources = () => {
  let kept: Kept | undefined;
  return {
    listTabsStep: ([kind, at, rest, height]: readonly [string, number, number, number]): TabsAt => {
      const now = kept ?? opened(rest, height);
      const input = inputOf(kind, at, rest, height);
      kept = now;
      if (input !== undefined) kept = stepped(now, input);
      return drawn(kept);
    },
  };
};
