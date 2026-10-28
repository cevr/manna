/**
 * When the home list's search field comes back over the list's top, from
 * the scroll offset alone, as Safari's toolbar does: past the field's
 * resting place, an upward scroll of `travel` points (a drag or its glide)
 * shows it, and a downward scroll of as much sends it away. Each step is a
 * worklet, so the list's UI thread runs it in the frame the offset moves.
 *
 * A run is the distance scrolled one way since the offset last turned: the
 * hidden field tracks the deepest offset reached, the shown one the highest,
 * and the field turns once the offset has come `travel` back from it. At or
 * above the resting place the field is the list's own, so the overlay is
 * hidden there and its run starts afresh.
 */

/** The field's state: shown or not, and the offset the current run counts from. */
export interface Reveal {
  readonly shown: boolean;
  readonly from: number;
}

/** The distance one way, in points, that turns the field. */
export const travel = 8;

/** The overlay at the list's opening: hidden, counting from the resting place. */
export const hidden = (rest: number): Reveal => ({ shown: false, from: rest });

/** The field's state once the list's offset is `scroll`, its resting place `rest`. */
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
 * How many points of the field show over the list's top: `progress` (0
 * hidden to 1 shown, as it slides) of the field's `height`, and never more
 * than the list has scrolled past its resting place, so it is 0 exactly
 * where the list's own field takes over.
 */
export const shownHeight = (
  progress: number,
  height: number,
  scroll: number,
  rest: number,
): number => {
  'worklet';
  return Math.max(0, Math.min(progress * height, scroll - rest));
};

/**
 * Whether the shown field can take a touch and VoiceOver's focus: only
 * while some of its box shows below the title. Its box ends `margin` above
 * the layer's bottom (`cover`), and the title's bottom is `title` points
 * down, less what the list has scrolled past its resting place. Near the
 * list's top the title covers the field, and a drag there must reach the
 * list, as it does on the title.
 */
export const reachable = (
  cover: number,
  scroll: number,
  rest: number,
  title: number,
  margin: number,
): boolean => {
  'worklet';
  return cover - margin > Math.max(0, title - (scroll - rest));
};
