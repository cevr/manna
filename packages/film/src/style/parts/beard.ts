import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Paper, Tones, unrimmed } from '../paper.ts';
import { Outline } from './measure.ts';

const Lip = Schema.Struct({ outline: Outline, paper: Paper }).check(unrimmed);

const BeardPart = Schema.TaggedStruct('Beard', {
  outline: Outline,
  paper: Paper,
  tones: Schema.optionalKey(Tones),
  lip: Schema.optionalKey(Lip),
}).check(unrimmed);
export type Beard = typeof BeardPart.Type;

export const decodeBeard = decoder(BeardPart, { fields: { ink: 'InteriorInk' } });

export const Beard = (o: Omit<Beard, '_tag'>): Beard =>
  decodeBeard({ _tag: 'Beard', ...o }, 'Beard');
