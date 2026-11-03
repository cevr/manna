import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Paper } from '../paper.ts';
import { Share } from './measure.ts';

const HandsPart = Schema.TaggedStruct('Hands', {
  paper: Paper,
  share: Share,
});
export type Hands = typeof HandsPart.Type;

export const decodeHands = decoder(HandsPart, {
  any: 'CircleHands',
  fields: { ink: 'InteriorInk' },
});

export const Hands = (o: Omit<Hands, '_tag'>): Hands =>
  decodeHands({ _tag: 'Hands', ...o }, 'Hands');
