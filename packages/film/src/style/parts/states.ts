import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { HexColour, Paper } from '../paper.ts';
import { Length, Point, Share } from './measure.ts';

const StainPart = Schema.TaggedStruct('Stain', {
  at: Point,
  r: Schema.Tuple([Length, Length]),
  soak: Schema.Array(Schema.Tuple([Length, Share])),
  seed: Schema.Int,
  paper: HexColour,
});
export type Stain = typeof StainPart.Type;

const GivenRobePart = Schema.TaggedStruct('GivenRobe', { paper: Paper });
export type GivenRobe = typeof GivenRobePart.Type;

export type State = Stain | GivenRobe;

const decodeStain = decoder(StainPart, { fields: { ink: 'InteriorInk', rim: 'InnerRim' } });

const decodeGivenRobe = decoder(GivenRobePart, { fields: { ink: 'InteriorInk' } });

type StateFields = typeof StainPart.Encoded | typeof GivenRobePart.Encoded;

export const decodeState = (input: StateFields, part: string): State =>
  input._tag === 'GivenRobe' ? decodeGivenRobe(input, part) : decodeStain(input, part);

export const Stain = (o: Omit<Stain, '_tag'>): Stain =>
  decodeStain({ _tag: 'Stain', ...o }, 'Stain');

export const GivenRobe = (paper: Paper): GivenRobe =>
  decodeGivenRobe({ _tag: 'GivenRobe', paper }, 'GivenRobe');
