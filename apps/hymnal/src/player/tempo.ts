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

/** The dial's read-out: `<tempo>%`, as `Text size` reads its share. */
export const saidOf = (tempo: number): string => `${tempo}%`;

/** Where `tempo` sits among the stops; a value off them sits at 100. */
export const stopIndexOf = (tempo: number): number => {
  if (!Schema.is(Tempo)(tempo)) return STOPS.indexOf(DEFAULT_TEMPO);
  return STOPS.indexOf(tempo);
};

/** The stop at place `n`, held to the dial's ends: a turn one past an end stays at it. */
export const stopAt = (n: number): number =>
  STOPS[Math.min(Math.max(n, 0), STOPS.length - 1)] ?? DEFAULT_TEMPO;

/** Ms of the hymn for each ms of the host's clock at `tempo`; a value off the stops runs at 1. */
export const rateOf = (tempo: number): number => {
  if (!Schema.is(Tempo)(tempo)) return 1;
  return tempo / 100;
};
