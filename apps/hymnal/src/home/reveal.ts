/**
 * The pinned row's state: shown or not, the offset the current run counts
 * from, and `held` from the app's move until the reader touches the list.
 */
export interface Reveal {
  readonly shown: boolean;
  readonly from: number;
  readonly held?: true;
}

/** The distance one way, in points, that turns the row. */
export const travel = 8;

/** The pinned row at the list's opening: hidden, counting from the resting place. */
export const hidden = (rest: number): Reveal => ({ shown: false, from: rest });

/** The row's state once the list's offset is `scroll`, its resting place `rest`. */
export const revealAt = (state: Reveal, scroll: number, rest: number): Reveal => {
  'worklet';
  if (state.held) return { shown: state.shown, from: scroll, held: true };
  if (scroll <= rest) return { shown: false, from: scroll };
  if (state.shown) {
    if (scroll - state.from >= travel) return { shown: false, from: scroll };
    return { shown: true, from: Math.min(state.from, scroll) };
  }
  if (state.from - scroll >= travel) return { shown: true, from: scroll };
  return { shown: false, from: Math.max(state.from, scroll) };
};

/**
 * The row's state once the app moves the list to `scroll` itself (a tab
 * chosen, a tile picked): the jump turns nothing, and holds the row as it
 * was until the reader touches the list (`touched`). At or above the
 * resting place a held row is out of sight and reach (`inReach`), and a
 * report past it shows the row again.
 */
export const jumped = (state: Reveal, scroll: number): Reveal => {
  'worklet';
  return { shown: state.shown, from: scroll, held: true };
};

/**
 * The row's state once the reader's finger meets the list at `scroll`: the
 * app's move is over, and the next run counts from where the list stands.
 * At or above the resting place the row is hidden, as any scroll there
 * leaves it. Outside a hold it changes nothing.
 */
export const touched = (state: Reveal, scroll: number, rest: number): Reveal => {
  'worklet';
  if (!state.held) return state;
  return { shown: state.shown && scroll > rest, from: scroll };
};

/** Whether the pinned row is shown and takes touches: shown, and the list past the resting place. */
export const inReach = (state: Reveal, scroll: number, rest: number): boolean => {
  'worklet';
  return state.shown && scroll > rest;
};

/**
 * How many points of the list's top the pinned row covers, its box
 * `height` tall: it slides in by `progress` (0 hidden to 1 shown), but its
 * top never stands above the list's own row while that row is in view, so
 * near the resting place the two meet as one. 0 while it is hidden, and at
 * or above the resting place, where the list's own row shows.
 */
export const shownHeight = (
  progress: number,
  height: number,
  scroll: number,
  rest: number,
): number => {
  'worklet';
  if (progress <= 0 || scroll <= rest) return 0;
  return Math.max(0, Math.max(rest - scroll, (progress - 1) * height) + height);
};
