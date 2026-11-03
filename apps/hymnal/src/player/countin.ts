/**
 * The count-in: one bar of a hymn's first tempo, counted in its meter's
 * beat before the first sung line. The beat is `beatOf`, the one the dial's
 * bpm read-out and `Tap` count, so a count-in at 72 bpm beats 72 to the
 * minute. At the dial's tempo each beat takes `beatMs / rateOf(tempo)` ms of
 * the host's clock.
 */

import type { FirstTempo } from '../follow/timeline';

import { beatOf } from './tempo';

/** A hymn's count-in: `beats` beats of `beatMs` ms of the hymn each, one bar in all. */
export interface CountIn {
  readonly beats: number;
  readonly beatMs: number;
}

/** The beat a count-in stands at: `index` from 0, of `of` beats. */
export interface Beat {
  readonly index: number;
  readonly of: number;
}

/**
 * The count-in of `tempo`: one bar (numerator × 4 / denominator quarters)
 * in the meter's beat. The bar is a whole number of beats for every meter
 * `beatOf` names: a compound count is a multiple of three, and a simple one
 * beats its own note.
 */
export const countInOf = (tempo: FirstTempo): CountIn => {
  const { quarters } = beatOf(tempo);
  return {
    beats: Math.max(1, Math.round((tempo.numerator * (4 / tempo.denominator)) / quarters)),
    beatMs: (quarters * tempo.microsPerQuarter) / 1000,
  };
};

/**
 * The host ms each beat of `countIn` falls at from its start, beat k at
 * k × beatMs / rate, then the first sung line's, one beat after the last:
 * `beats + 1` times.
 */
export const beatTimes = (countIn: CountIn, rate: number): ReadonlyArray<number> =>
  Array.from({ length: countIn.beats + 1 }, (_, k) => (k * countIn.beatMs) / rate);
