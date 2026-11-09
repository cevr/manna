/**
 * The reading view's words, pure: what each word shows (`shownWordsOf`) and
 * which word lies under a finger (`wordAt`). A word is the voice's
 * (`wordSpans`: a whitespace run holding a letter or number), so the view's
 * word `i` is the word the voice lights as `i`.
 */

import { Option } from 'effect';

import { wordSpans } from '../voice/reading';

/** A word's box in the reading view's own coordinates, as its `onLayout` gives it. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * What each word of the reading view shows: the text from its run's start
 * (the text's start, for the first word) to the next word's run's start (the
 * text's end, for the last), trimmed. So a mark-only run (`—`, `...`) stays
 * with the word before it, one before the first word goes with the first,
 * and no character but whitespace is lost.
 */
export const shownWordsOf = (text: string): ReadonlyArray<string> => {
  const spans = wordSpans(text);
  const cuts = [0, ...spans.slice(1).map((span) => span.start), text.length];
  return spans.map((_, index) => text.slice(cuts[index], cuts[index + 1]).trim());
};

/** How far `point` lies outside `[from, to]`: 0 inside. */
const outside = (point: number, from: number, to: number): number =>
  Math.max(0, from - point, point - to);

/** The nearest of `candidates` by `distance`, the earliest on a tie. */
const nearest = <A>(
  candidates: ReadonlyArray<A>,
  distance: (each: A) => number,
): Option.Option<A> =>
  candidates
    .reduce<Option.Option<readonly [A, number]>>((best, each) => {
      const far = distance(each);
      if (Option.isSome(best) && best.value[1] <= far) return best;
      return Option.some([each, far] as const);
    }, Option.none())
    .pipe(Option.map(([each]) => each));

/**
 * The word under a finger at `(x, y)` in the reading view's coordinates,
 * over each laid-out word's box (by word number): first the line (the boxes
 * that share a top) nearest the point vertically, then the word of that line
 * nearest it horizontally. A distance inside a box is 0, and a tie goes to
 * the earlier line, then the earlier word. None with no boxes.
 */
export const wordAt = (
  x: number,
  y: number,
  boxes: ReadonlyMap<number, Box>,
): Option.Option<number> => {
  const words = [...boxes.entries()].sort(([a], [b]) => a - b);
  const tops = [...new Set(words.map(([, box]) => box.y))].sort((a, b) => a - b);
  return nearest(tops, (top) => {
    const bottom = Math.max(
      ...words.filter(([, box]) => box.y === top).map(([, box]) => box.y + box.height),
    );
    return outside(y, top, bottom);
  }).pipe(
    Option.flatMap((top) =>
      nearest(
        words.filter(([, box]) => box.y === top),
        ([, box]) => outside(x, box.x, box.x + box.width),
      ),
    ),
    Option.map(([word]) => word),
  );
};
