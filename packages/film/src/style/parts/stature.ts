import { Schema } from 'effect';
import { decoder } from '../decode.ts';

const PlainLeadPart = Schema.TaggedStruct('PlainLead', {});
type PlainLead = typeof PlainLeadPart.Type;

const CanonPart = Schema.TaggedStruct('Canon', {});
type Canon = typeof CanonPart.Type;

export type Stature = PlainLead | Canon;

const decodePlainLead = decoder(PlainLeadPart);

const decodeCanon = decoder(CanonPart);

type StatureFields = typeof PlainLeadPart.Encoded | typeof CanonPart.Encoded;

export const decodeStature = (input: StatureFields, part: string): Stature =>
  input._tag === 'Canon' ? decodeCanon(input, part) : decodePlainLead(input, part);

export const Stature = {
  PlainLead: (): PlainLead => decodePlainLead({ _tag: 'PlainLead' }, 'Stature.PlainLead'),
  Canon: (): Canon => decodeCanon({ _tag: 'Canon' }, 'Stature.Canon'),
};
