/**
 * A hymn's tempo, in percent of its own: the Tempo dial's stops, 50 % to
 * 150 % in steps of 5 %, 100 % until turned. With Sound off the score clock
 * (`sound.ts`) moves the place `rateOf(tempo)` ms of the hymn for each ms.
 */

import { Schema } from 'effect';

export const SLOWEST = 50;
export const FASTEST = 150;
export const STEP = 5;
export const DEFAULT_TEMPO = 100;

/** The dial's stops, slowest first: a detent's `at` is its place here. */
export const STOPS: ReadonlyArray<number> = Array.from(
  { length: (FASTEST - SLOWEST) / STEP + 1 },
  (_, k) => SLOWEST + STEP * k,
);

/**
 * A stop of the dial: a stored value off the stops (outside 50 to 150, or
 * off the 5 % step) does not decode, so its setting falls back to 100.
 */
export const Tempo = Schema.Int.check(
  Schema.isBetween({ minimum: SLOWEST, maximum: FASTEST }),
  Schema.isMultipleOf(STEP),
);
export type Tempo = typeof Tempo.Type;

/** Ms of the hymn for each ms of the host's clock at `tempo`; a value off the stops runs at 1. */
export const rateOf = (tempo: number): number => {
  if (!Schema.is(Tempo)(tempo)) return 1;
  return tempo / 100;
};
