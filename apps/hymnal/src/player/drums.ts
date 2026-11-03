import { Option } from 'effect';

import { type Cue, type DialName, plain, type Tell } from '~/feel/cue';

import { type Detents, ownDetent } from './dial';

export const FIRST = 1;
export const LAST = 695;

export type Drum = Extract<DialName, 'hundreds' | 'tens' | 'ones'>;
export const DRUM_ORDER: ReadonlyArray<Drum> = ['hundreds', 'tens', 'ones'];

export const DRUMS: Readonly<Record<Drum, Detents>> = {
  hundreds: { name: 'hundreds', count: Math.floor(LAST / 100) + 1, wrap: false },
  tens: { name: 'tens', count: 10, wrap: true },
  ones: { name: 'ones', count: 10, wrap: true },
};

const WORTH: Readonly<Record<Drum, number>> = { hundreds: 100, tens: 10, ones: 1 };

export const isDrum = (dial: DialName): dial is Drum => dial in WORTH;

export const held = (n: number): number => {
  if (!Number.isFinite(n)) return FIRST;
  return Math.min(Math.max(Math.round(n), FIRST), LAST);
};

export const digitOf = (number: number, drum: Drum): number =>
  Math.floor(held(number) / WORTH[drum]) % 10;

export const digitsOf = (number: number): Readonly<Record<Drum, number>> => ({
  hundreds: digitOf(number, 'hundreds'),
  tens: digitOf(number, 'tens'),
  ones: digitOf(number, 'ones'),
});

export const turn = (number: number, drum: Drum, n: number): number => {
  const digit = ownDetent(DRUMS[drum], Math.round(n));
  const now = held(number);
  return held(now + (digit - digitOf(now, drum)) * WORTH[drum]);
};

export const drumTell =
  (tell: Tell, loud: () => boolean): Tell =>
  (cue: Cue) => {
    if (cue._tag === 'detent' && isDrum(cue.dial) && !loud()) return tell(plain('rail-tick'));
    return tell(cue);
  };

export const foundOffset = (
  placed: ReadonlyArray<{ readonly number: number; readonly offset: number }>,
  number: number,
): Option.Option<number> =>
  Option.map(
    Option.fromNullishOr(placed.find((row) => row.number === number)),
    (row) => row.offset,
  );
