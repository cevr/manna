import { Option, Schema } from 'effect';

import type { Timeline } from '../follow/timeline';

export const SLOWEST = 50;
export const FASTEST = 150;
export const STEP = 5;
export const DEFAULT_TEMPO = 100;

export const STOPS: ReadonlyArray<number> = Array.from(
  { length: (FASTEST - SLOWEST) / STEP + 1 },
  (_, k) => SLOWEST + STEP * k,
);

export const Tempo = Schema.Int.check(
  Schema.isBetween({ minimum: SLOWEST, maximum: FASTEST }),
  Schema.isMultipleOf(STEP),
);
export type Tempo = typeof Tempo.Type;

export const saidOf = (tempo: number): string => `${tempo}%`;

export const stopIndexOf = (tempo: number): number => {
  if (!Schema.is(Tempo)(tempo)) return STOPS.indexOf(DEFAULT_TEMPO);
  return STOPS.indexOf(tempo);
};

export const stopAt = (n: number): number =>
  STOPS[Math.min(Math.max(n, 0), STOPS.length - 1)] ?? DEFAULT_TEMPO;

export const rateOf = (tempo: number): number => {
  if (!Schema.is(Tempo)(tempo)) return 1;
  return tempo / 100;
};

export interface Beat {
  readonly quarters: number;
  readonly name: string;
  readonly note: number;
  readonly dotted: boolean;
}

const NOTES: ReadonlyMap<number, string> = new Map([
  [1, 'whole note'],
  [2, 'half note'],
  [4, 'quarter note'],
  [8, 'eighth note'],
  [16, 'sixteenth note'],
]);

const noteName = (denominator: number): string =>
  Option.getOrElse(Option.fromUndefinedOr(NOTES.get(denominator)), () => 'note');

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

export const bpmOf = (tempo: Timeline['tempo']): number =>
  60e6 / tempo.microsPerQuarter / beatOf(tempo).quarters;

export const bpmAt = (hymnBpm: number, tempo: number): number =>
  Math.round((hymnBpm * tempo) / 100);

export const TAPS = 4;

export const GAP = 3000;

export type TapRun = ReadonlyArray<number>;

export interface Tapped {
  readonly run: TapRun;
  readonly tempo: Option.Option<number>;
}

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
