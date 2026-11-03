import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Paper, Tones, unrimmed } from '../paper.ts';
import { Outline } from './measure.ts';

const Band = Schema.Struct({
  outline: Outline,
  paper: Paper,
  tones: Schema.optionalKey(Tones),
}).check(unrimmed);

const Edge = Schema.Struct({
  outline: Outline,
  paper: Paper,
  tones: Schema.optionalKey(Tones),
}).check(unrimmed);

const HeadclothPart = Schema.TaggedStruct('Headcloth', {
  outline: Outline,
  paper: Paper,
  band: Schema.optionalKey(Band),
  edge: Schema.optionalKey(Edge),
}).check(unrimmed);
export type Headcloth = typeof HeadclothPart.Type;

export const decodeHeadcloth = decoder(HeadclothPart, { fields: { ink: 'InteriorInk' } });

export const Headcloth = (o: Omit<Headcloth, '_tag'>): Headcloth =>
  decodeHeadcloth({ _tag: 'Headcloth', ...o }, 'Headcloth');
