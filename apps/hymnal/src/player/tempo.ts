/**
 * A hymn's tempo, in percent of its own: the Tempo dial's stops, 50 % to
 * 150 % in steps of 5 %, 100 % until turned. With Sound off the score clock
 * (`sound.ts`) moves the place `rateOf(tempo)` ms of the hymn for each ms.
 *
 * The dial's bpm read-out counts the hymn's first tempo (`Timeline['tempo']`)
 * in its meter's beat (`beatOf`, `bpmOf`) and says it at the dial's tempo
 * (`bpmAt`); `tap` turns a run of taps on `Tap` into the stop they ask for.
 */

import { Option, Schema } from 'effect';

import type { Timeline } from '../follow/timeline';

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

/** The note a meter is counted in: its length in quarter notes, and its name. */
export interface Beat {
  readonly quarters: number;
  readonly name: string;
  /** The plain note it is drawn as, by the denominator that writes it (4 a quarter, 8 an eighth). */
  readonly note: number;
  /** Whether it is that note dotted, worth half as much again. */
  readonly dotted: boolean;
}

/** The plain notes' names, by the denominator that writes them. */
const NOTES: ReadonlyMap<number, string> = new Map([
  [1, 'whole note'],
  [2, 'half note'],
  [4, 'quarter note'],
  [8, 'eighth note'],
  [16, 'sixteenth note'],
]);

const noteName = (denominator: number): string =>
  Option.getOrElse(Option.fromUndefinedOr(NOTES.get(denominator)), () => 'note');

/**
 * The beat of a meter, as a player counts it. A simple meter (three or fewer
 * to the bar, or a count not divisible by three) beats its denominator's
 * note: 3/4 a quarter, 3/2 a half. A compound one (6, 9, 12 … to the bar)
 * beats the dotted note worth three of them: 6/8 a dotted quarter, 6/4 a
 * dotted half. A compound count over a whole note has no dotted note above
 * it and beats the whole note.
 */
export const beatOf = (meter: {
  readonly numerator: number;
  readonly denominator: number;
}): Beat => {
  const { numerator, denominator } = meter;
  if (numerator > 3 && numerator % 3 === 0 && denominator >= 2)
    return {
      quarters: (3 * 4) / denominator,
      name: `dotted ${noteName(denominator / 2)}`,
      note: denominator / 2,
      dotted: true,
    };
  return {
    quarters: 4 / denominator,
    name: noteName(denominator),
    note: denominator,
    dotted: false,
  };
};

/** A hymn's own bpm: its first tempo counted in its meter's beat, unrounded. */
export const bpmOf = (tempo: Timeline['tempo']): number =>
  60e6 / tempo.microsPerQuarter / beatOf(tempo).quarters;

/** The bpm the dial's read-out says: the hymn's bpm at `tempo` percent, rounded. */
export const bpmAt = (hymnBpm: number, tempo: number): number =>
  Math.round((hymnBpm * tempo) / 100);

/** Taps that set the dial: the tapped bpm is read over the last four. */
export const TAPS = 4;

/** The longest pause, in ms, between two taps of one run: a longer one starts the count over. */
export const GAP = 3000;

/** A run of taps: their times in ms, oldest first, the last `TAPS` kept; `[]` is no run. */
export type TapRun = ReadonlyArray<number>;

/** What one tap leaves: the run it is in, and the stop it sets, none when the run is short. */
export interface Tapped {
  readonly run: TapRun;
  readonly tempo: Option.Option<number>;
}

/**
 * A tap at `at` ms on a hymn of `hymnBpm`. It runs on from `run` when it
 * comes after the last tap by at most `GAP`; otherwise (a longer pause, or a
 * time at or before the last) it starts a new run. From the `TAPS`th tap on,
 * each tap sets the stop nearest the tapped bpm over the hymn's, held to the
 * dial's ends.
 */
export const tap = (run: TapRun, at: number, hymnBpm: number): Tapped => {
  const next = Option.match(
    Option.filter(Option.fromUndefinedOr(run.at(-1)), (last) => at > last && at - last <= GAP),
    { onNone: () => [at], onSome: () => [...run, at].slice(-TAPS) },
  );
  const tempo = Option.map(
    Option.liftPredicate(next, (times) => times.length >= TAPS),
    (times) => {
      const span = (times.at(-1) ?? 0) - (times[0] ?? 0);
      const tapped = (60000 * (TAPS - 1)) / span;
      return Math.min(
        FASTEST,
        Math.max(SLOWEST, STEP * Math.round((100 * tapped) / hymnBpm / STEP)),
      );
    },
  );
  return { run: next, tempo };
};
