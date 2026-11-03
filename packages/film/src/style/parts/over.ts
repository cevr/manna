import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Paper, Tones, unrimmed } from '../paper.ts';
import { Length, Units } from './measure.ts';

const topAboveEnds = Schema.makeFilter((b: { readonly from: number; readonly to: number }) =>
  b.from < b.to
    ? true
    : `their top (${b.from}) lies at or below their ends (${b.to}): bands hang from their top down to their ends`,
);

const BandsPart = Schema.TaggedStruct('Bands', {
  x: Units,
  gap: Length,
  top: Length,
  bottom: Length,
  splay: Units,
  from: Units,
  to: Units,
  paper: Paper,
  tones: Schema.optionalKey(Tones),
}).check(unrimmed, topAboveEnds);
export type Bands = typeof BandsPart.Type;

export type Over = Bands;

export const decodeOver = decoder(BandsPart, { fields: { ink: 'InteriorInk' } });

export const Bands = (o: Omit<Bands, '_tag'>): Bands =>
  decodeOver({ _tag: 'Bands', ...o }, 'Bands');
