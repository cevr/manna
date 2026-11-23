/**
 * The reading view's hold, pure: how long a finger rests still before the
 * hold takes it (`LONG_PRESS`), and what each moment of the hold makes of
 * the held word and asks of the voice. The view's pan calls `activate` at
 * its activation, `update` on each move and `finalize` at its end, and
 * `drop` when the view goes; it keeps the held word and acts on the answer:
 * the held word first, then the ask.
 */

import { Option } from 'effect';

/** How long a finger rests still on the words before the hold takes it, in milliseconds. */
export const LONG_PRESS = 350;

/** What a moment of the hold asks of the voice: pause at its start, read on from a word at a release, resume at a cancel. */
export type Ask =
  | { readonly _tag: 'Hold' }
  | { readonly _tag: 'Seek'; readonly word: number }
  | { readonly _tag: 'LetGo' };

/** One moment of the hold: the held word after it, whether the screen is told it (`onHeld`), and the one ask, if any. */
export interface Moment {
  readonly held: Option.Option<number>;
  readonly told: boolean;
  readonly ask: Option.Option<Ask>;
}

const still = (held: Option.Option<number>): Moment => ({
  held,
  told: false,
  ask: Option.none(),
});

/** The hold's activation with `word` under the finger: that word held and the pause asked for; with no word under it, nothing. */
export const activate = (held: Option.Option<number>, word: Option.Option<number>): Moment =>
  Option.match(word, {
    onNone: () => still(held),
    onSome: (each) => ({
      held: Option.some(each),
      told: true,
      ask: Option.some({ _tag: 'Hold' }),
    }),
  });

/** A move with `word` under the finger: while a word is held, that word held; else nothing. */
export const update = (held: Option.Option<number>, word: Option.Option<number>): Moment => {
  if (Option.isNone(held) || Option.isNone(word)) return still(held);
  return { held: word, told: true, ask: Option.none() };
};

/** What an end asks for: a resume at a cancel, else a seek to the held `word`. */
const endAsk = (word: number, canceled: boolean): Ask => {
  if (canceled) return { _tag: 'LetGo' };
  return { _tag: 'Seek', word };
};

/** The hold's end: while a word is held, none held and one ask, a seek to it at a release and a resume at a cancel; else nothing. */
export const finalize = (held: Option.Option<number>, canceled: boolean): Moment =>
  Option.match(held, {
    onNone: () => still(held),
    onSome: (word) => ({
      held: Option.none(),
      told: true,
      ask: Option.some(endAsk(word, canceled)),
    }),
  });

/** The view gone: a held word dropped with no ask, so a later end asks for nothing. */
export const drop = (held: Option.Option<number>): Moment => {
  if (Option.isNone(held)) return still(held);
  return { held: Option.none(), told: true, ask: Option.none() };
};
