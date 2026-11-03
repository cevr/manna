import { Match, Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Paper, Tones, unrimmed } from '../paper.ts';
import { Length, Outline, Point } from './measure.ts';

const RoundEarPart = Schema.TaggedStruct('RoundEar', {
  at: Point,
  r: Schema.Tuple([Length, Length]),
  paper: Paper,
}).check(unrimmed);
type RoundEar = typeof RoundEarPart.Type;

const TracedEarPart = Schema.TaggedStruct('TracedEar', {
  outline: Outline,
  paper: Paper,
  tones: Schema.optionalKey(Tones),
}).check(unrimmed);
type TracedEar = typeof TracedEarPart.Type;

const BothEarsPart = Schema.TaggedStruct('BothEars', {
  near: Outline,
  far: Outline,
  paper: Paper,
  tones: Schema.optionalKey(Tones),
}).check(unrimmed);
type BothEars = typeof BothEarsPart.Type;

export type Ear = RoundEar | TracedEar | BothEars;

const decodeRoundEar = decoder(RoundEarPart, { fields: { ink: 'InteriorInk' } });
const decodeTracedEar = decoder(TracedEarPart, { fields: { ink: 'InteriorInk' } });
const decodeBothEars = decoder(BothEarsPart, { fields: { ink: 'InteriorInk' } });

type EarFields =
  | typeof RoundEarPart.Encoded
  | typeof TracedEarPart.Encoded
  | typeof BothEarsPart.Encoded;

export const decodeEar = (input: EarFields, part: string): Ear =>
  Match.value(input).pipe(
    Match.withReturnType<Ear>(),
    Match.tagsExhaustive({
      RoundEar: (ear) => decodeRoundEar(ear, part),
      TracedEar: (ear) => decodeTracedEar(ear, part),
      BothEars: (ears) => decodeBothEars(ears, part),
    }),
  );

export const Ear = {
  Round: (o: Omit<RoundEar, '_tag'>): RoundEar =>
    decodeRoundEar({ _tag: 'RoundEar', ...o }, 'Ear.Round'),
  Traced: (o: Omit<TracedEar, '_tag'>): TracedEar =>
    decodeTracedEar({ _tag: 'TracedEar', ...o }, 'Ear.Traced'),
  Both: (o: Omit<BothEars, '_tag'>): BothEars =>
    decodeBothEars({ _tag: 'BothEars', ...o }, 'Ear.Both'),
};
