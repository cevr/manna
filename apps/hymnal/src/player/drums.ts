/**
 * The find drums' model, pure: a hymn's number dialled on three drums, one
 * per digit. The hundreds drum runs from 0 to 6 and stops at each end (the
 * book ends at 695); the tens and ones drums run 0 to 9 and wrap, past 9
 * coming 0. Each drum is a dial (`dial.ts`), so it flings, glides and wraps
 * as the key dial does.
 *
 * The number dialled is held to the book, `FIRST` to `LAST`, whatever the
 * drums are turned to: a turn that would dial past it dials its end, and
 * the drums show the number held.
 *
 * A drum's detent is felt as every dial's is, and heard only while the
 * player's Sound switch is on (`drumTell`).
 */

import { Option } from 'effect';

import { type Cue, type DialName, plain, type Tell } from '~/feel/cue';

import { type Detents, ownDetent } from './dial';

/** The first hymn's number and the last's. */
export const FIRST = 1;
export const LAST = 695;

/** The three drums, from the left. */
export type Drum = Extract<DialName, 'hundreds' | 'tens' | 'ones'>;
export const DRUM_ORDER: ReadonlyArray<Drum> = ['hundreds', 'tens', 'ones'];

/** Each drum's detents: one per digit it shows. */
export const DRUMS: Readonly<Record<Drum, Detents>> = {
  hundreds: { name: 'hundreds', count: Math.floor(LAST / 100) + 1, wrap: false },
  tens: { name: 'tens', count: 10, wrap: true },
  ones: { name: 'ones', count: 10, wrap: true },
};

/** How much one step of each drum is worth. */
const WORTH: Readonly<Record<Drum, number>> = { hundreds: 100, tens: 10, ones: 1 };

/** Whether `dial` is one of the drums. */
export const isDrum = (dial: DialName): dial is Drum => dial in WORTH;

/** `n` held to the book: a whole number from `FIRST` to `LAST`. */
export const held = (n: number): number => {
  if (!Number.isFinite(n)) return FIRST;
  return Math.min(Math.max(Math.round(n), FIRST), LAST);
};

/** The digit `drum` shows for `number`, held to the book first. */
export const digitOf = (number: number, drum: Drum): number =>
  Math.floor(held(number) / WORTH[drum]) % 10;

/** The three digits `number` is dialled by, held to the book first. */
export const digitsOf = (number: number): Readonly<Record<Drum, number>> => ({
  hundreds: digitOf(number, 'hundreds'),
  tens: digitOf(number, 'tens'),
  ones: digitOf(number, 'ones'),
});

/**
 * The number dialled once `drum`, at `number`, turns to digit `n`: among
 * its own on a wrapping drum; on the hundreds drum, held to its ends (a
 * VoiceOver turn past an end tells one past it). Held to the book.
 */
export const turn = (number: number, drum: Drum, n: number): number => {
  const digit = ownDetent(DRUMS[drum], Math.round(n));
  const now = held(number);
  return held(now + (digit - digitOf(now, drum)) * WORTH[drum]);
};

/**
 * The Tell the drums give their cues to, over `tell`: while `loud` (the
 * player's Sound switch) is off, a drum's detent is told as a quiet tick
 * (`rail-tick`: the same selection haptic, no sound). Every other cue goes
 * on as it came.
 */
export const drumTell =
  (tell: Tell, loud: () => boolean): Tell =>
  (cue: Cue) => {
    if (cue._tag === 'detent' && isDrum(cue.dial) && !loud()) return tell(plain('rail-tick'));
    return tell(cue);
  };

/**
 * The scroll offset that shows the dialled hymn's row: the first of `placed` (the
 * list's hymns in its order, each with its offset, as `marksOf` gives them)
 * with `number`. None when the list has no such row, and it stays where it is.
 */
export const foundOffset = (
  placed: ReadonlyArray<{ readonly number: number; readonly offset: number }>,
  number: number,
): Option.Option<number> =>
  Option.map(
    Option.fromNullishOr(placed.find((row) => row.number === number)),
    (row) => row.offset,
  );
