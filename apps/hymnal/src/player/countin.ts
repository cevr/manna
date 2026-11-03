import type { FirstTempo } from '../follow/timeline';

import { beatOf } from './tempo';

export interface CountIn {
  readonly beats: number;
  readonly beatMs: number;
}

export interface Beat {
  readonly index: number;
  readonly of: number;
}

export const countInOf = (tempo: FirstTempo): CountIn => {
  const { quarters } = beatOf(tempo);
  return {
    beats: Math.max(1, Math.round((tempo.numerator * (4 / tempo.denominator)) / quarters)),
    beatMs: (quarters * tempo.microsPerQuarter) / 1000,
  };
};

export const beatTimes = (countIn: CountIn, rate: number): ReadonlyArray<number> =>
  Array.from({ length: countIn.beats + 1 }, (_, k) => (k * countIn.beatMs) / rate);
