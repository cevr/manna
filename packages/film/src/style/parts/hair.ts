import { Schema } from 'effect';
import { decoder, ruleCheck } from '../decode.ts';
import { HexColour, Paper, Tones, colourOfItsOwn, unrimmed } from '../paper.ts';
import { Length, Outline, Point, Share } from './measure.ts';

const TracedHairPart = Schema.TaggedStruct('TracedHair', {
  outline: Outline,
  paper: Paper,
  tones: Schema.optionalKey(Tones),
}).check(unrimmed);

const Curl = Schema.Struct({ at: Point, r: Length });

const CurledHairPart = Schema.TaggedStruct('CurledHair', {
  outline: Outline,
  paper: Paper,
  tones: Schema.optionalKey(Tones),
  curls: Schema.Array(Curl).check(Schema.isMinLength(1)),
  shade: HexColour,
  crescent: Share,
}).check(
  unrimmed,
  ruleCheck('GreyShade', (h: { readonly paper: Paper; readonly shade: `#${string}` }) =>
    colourOfItsOwn(h.paper.color, h.shade),
  ),
);

export type Hair = typeof TracedHairPart.Type | typeof CurledHairPart.Type;

const decodeTracedHair = decoder(TracedHairPart, { fields: { ink: 'InteriorInk' } });

const decodeCurledHair = decoder(CurledHairPart, { fields: { ink: 'InteriorInk' } });

type HairFields = typeof TracedHairPart.Encoded | typeof CurledHairPart.Encoded;

export const decodeHair = (input: HairFields, part: string): Hair =>
  input._tag === 'CurledHair' ? decodeCurledHair(input, part) : decodeTracedHair(input, part);

export const Hair = {
  Traced: (o: Omit<typeof TracedHairPart.Type, '_tag'>): Hair =>
    decodeTracedHair({ _tag: 'TracedHair', ...o }, 'Hair.Traced'),
  Curls: (o: Omit<typeof CurledHairPart.Type, '_tag'>): Hair =>
    decodeCurledHair({ _tag: 'CurledHair', ...o }, 'Hair.Curls'),
};
