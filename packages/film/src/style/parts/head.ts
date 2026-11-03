import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Paper, Tones } from '../paper.ts';
import { Length, Outline, Units } from './measure.ts';

const RoundHeadPart = Schema.TaggedStruct('RoundHead', {
  y: Units,
  r: Schema.Tuple([Length, Length]),
  neck: Units,
  paper: Paper,
});
export type RoundHead = typeof RoundHeadPart.Type;

const View = Schema.Literals(['front', 'threeQuarter', 'side', 'back']);

const TracedHeadPart = Schema.TaggedStruct('TracedHead', {
  outline: Outline,
  view: View,
  y: Units,
  neck: Units,
  set: Schema.Struct({ x: Units, cant: Schema.optionalKey(Units) }),
  paper: Paper,
  tones: Schema.optionalKey(Tones),
  chin: Schema.optionalKey(Schema.Literal('open')),
});
export type TracedHead = typeof TracedHeadPart.Type;

export type Head = RoundHead | TracedHead;

const decodeRoundHead = decoder(RoundHeadPart, { fields: { ink: 'InteriorInk' } });

const decodeTracedHead = decoder(TracedHeadPart, { fields: { ink: 'InteriorInk' } });

type HeadFields = typeof RoundHeadPart.Encoded | typeof TracedHeadPart.Encoded;

export const decodeHead = (input: HeadFields, part: string): Head =>
  input._tag === 'TracedHead' ? decodeTracedHead(input, part) : decodeRoundHead(input, part);

export const Head = {
  Round: (o: Omit<RoundHead, '_tag'>): RoundHead =>
    decodeRoundHead({ _tag: 'RoundHead', ...o }, 'Head.Round'),
  Traced: (o: Omit<TracedHead, '_tag'>): TracedHead =>
    decodeTracedHead({ _tag: 'TracedHead', ...o }, 'Head.Traced'),
};
