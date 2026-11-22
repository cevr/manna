/**
 * The tuner screen's own rules, pure, which `Tuner.tsx` draws: the note
 * heard under the string's name, how often the reading's words change, the
 * string Auto turned off picks, a tap on a string's circle, the circle's
 * hint, the gauge's swing and ticks, and the strings across the headstock.
 */

import { Option } from 'effect';

import { LEFT, RIGHT } from './session';
import type { Reading, StringId } from './tuning';

/** The note heard, small under the string's name: `E2`, `A2 · in tune`, or nothing. */
export const noteOf = (heard: Option.Option<Pick<Reading, 'note' | 'octave' | 'inTune'>>): string =>
  Option.match(heard, {
    onNone: () => '',
    onSome: ({ note, octave, inTune }) => {
      if (inTune) return `${note}${octave} · in tune`;
      return `${note}${octave}`;
    },
  });

/** The words read aloud change at most this often. */
export const LABEL_EVERY = 1000;

/** The string a frame is read against when nothing was heard and Auto is turned off. */
export const LOWEST: StringId = 'E2';

/** A tap on `id`'s circle from `aim`: the picked string goes back to Auto, any other is picked. */
export const pickOf = (aim: Option.Option<StringId>, id: StringId): Option.Option<StringId> => {
  if (Option.contains(aim, id)) return Option.none();
  return Option.some(id);
};

/** Auto turned from `aim`: on clears the target; off picks the string last heard, or the lowest. */
export const autoOf = (
  aim: Option.Option<StringId>,
  last: Option.Option<StringId>,
): Option.Option<StringId> => {
  if (Option.isSome(aim)) return Option.none();
  return Option.some(Option.getOrElse(last, () => LOWEST));
};

/** What a second tap on the picked string does, as VoiceOver reads it after the circle's name. */
export const BACK_TO_AUTO = 'Goes back to Auto';

/** The circle's VoiceOver hint: the picked string's says a second tap goes back to Auto; the others have none. */
export const pickedHint = (picked: boolean): Option.Option<string> => {
  if (picked) return Option.some(BACK_TO_AUTO);
  return Option.none();
};

/** The needle's swing either side of centre, in degrees, at `NEEDLE_CENTS`. */
export const SWING = 50;

/** The scale's ticks, in cents: one each 10, and the in-tune window's edges at ±5. */
export const TICKS = [-50, -40, -30, -20, -10, -5, 0, 5, 10, 20, 30, 40, 50] as const;

/** The strings across the headstock, low to high, as they run down from the nut. */
export const ACROSS: ReadonlyArray<StringId> = [...LEFT].reverse().concat(RIGHT);
