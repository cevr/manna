/**
 * When the home list's tab row comes back pinned over the list's top, from
 * the scroll offset alone, as Safari's toolbar does: past the row's resting
 * place, an upward scroll of `travel` points (a drag or its glide) shows it,
 * and a downward scroll of as much sends it away. Each step is a worklet, so
 * the list's UI thread runs it in the frame the offset moves.
 *
 * A run is the distance scrolled one way since the offset last turned: the
 * hidden row tracks the deepest offset reached, the shown one the highest,
 * and the row turns once the offset has come `travel` back from it. At or
 * above the resting place (the offset at which the list's own row meets the
 * list's top) the row is the list's own, so the pinned copy is hidden there
 * and its run starts afresh.
 */

/** The pinned row's state: shown or not, and the offset the current run counts from. */
export interface Reveal {
  readonly shown: boolean;
  readonly from: number;
}

/** The distance one way, in points, that turns the row. */
export const travel = 8;

/** The pinned row at the list's opening: hidden, counting from the resting place. */
export const hidden = (rest: number): Reveal => ({ shown: false, from: rest });

/** The row's state once the list's offset is `scroll`, its resting place `rest`. */
export const revealAt = (state: Reveal, scroll: number, rest: number): Reveal => {
  'worklet';
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
 * chosen, a tile picked): the jump is no scroll of the reader's, so it turns
 * nothing; the pinned row stays as it was, unless the jump lands at or above
 * the resting place, and the next run counts from where it landed.
 */
export const jumped = (state: Reveal, scroll: number, rest: number): Reveal => ({
  shown: state.shown && scroll > rest,
  from: scroll,
});

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
