/**
 * The range a reader taps in one chapter of the chooser, as a pure rule.
 *
 * The first tap chooses one verse; a second tap on another verse of the
 * chapter ends the range there, clipped to 20 verses counted from the
 * first tap in either direction, so the verse the reader started on stays.
 * A tap on the one verse chosen clears the range, and a tap with a range of
 * more than one verse starts again at the verse tapped. A tap on no verse of
 * the chapter (0, past its end, a fraction, NaN) changes nothing, so every
 * range the rule gives is choosable (`choosable` in `./passages`).
 */

import { Option } from 'effect';

import { MOST_VERSES } from './passages';

/** The line the field's bar and the chooser's footer show once 3 or more passages and lists are held together. */
export const LIMIT_LINE = '3 passages or lists, the most for now. Remove one to add another.';

/** The verses chosen in one chapter, first to last. */
export interface Verses {
  readonly first: number;
  readonly last: number;
}

/** Whether `verse` is a verse of a chapter of `count` verses. */
const inside = (verse: number, count: number): boolean =>
  Number.isInteger(verse) && verse >= 1 && verse <= count;

/** The range after a tap on `verse` of a chapter of `count` verses, from the range `chosen`. */
export const tapVerse = (
  chosen: Option.Option<Verses>,
  verse: number,
  count: number,
): Option.Option<Verses> => {
  if (!inside(verse, count)) return chosen;
  if (Option.isNone(chosen) || chosen.value.first !== chosen.value.last)
    return Option.some({ first: verse, last: verse });
  const start = chosen.value.first;
  if (verse === start) return Option.none();
  if (verse > start)
    return Option.some({ first: start, last: Math.min(verse, start + MOST_VERSES - 1) });
  return Option.some({ first: Math.max(verse, start - MOST_VERSES + 1), last: start });
};
