import { Match, Schema } from 'effect';
import { decoder } from '../decode.ts';
import { HexColour, Paper, Tones } from '../paper.ts';
import { SHOE_POINTS } from '../rig/shapes.ts';
import { Corners, Length, Outline, oneRadiusOrEach } from './measure.ts';

const StubLegsPart = Schema.TaggedStruct('StubLegs', {
  x: Length,
  r: Length,
  paper: Paper,
});
export type StubLegs = typeof StubLegsPart.Type;

const ShoePoint = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: SHOE_POINTS - 1 }));

const ShoeLight = Schema.Struct({
  color: HexColour,
  from: ShoePoint,
  to: ShoePoint,
  depth: Length,
});

const runs = Schema.makeFilter((light: { readonly from: number; readonly to: number }) =>
  light.from === light.to ? `its light runs from point ${light.from} to itself` : true,
);

const Shoe = Schema.Struct({ paper: Paper, light: ShoeLight.check(runs) });

const ShoesPart = Schema.TaggedStruct('Shoes', {
  x: Length,
  w: Length,
  h: Length,
  near: Shoe,
  far: Shoe,
});
export type Shoes = typeof ShoesPart.Type;

const SandalFoot = Schema.Struct({
  corners: Corners,
  radii: Schema.Array(Length).check(Schema.isMinLength(1)),
  tones: Schema.optionalKey(Tones),
}).check(oneRadiusOrEach);

const SandalsPart = Schema.TaggedStruct('Sandals', {
  paper: Paper,
  near: SandalFoot,
  far: SandalFoot,
  sole: HexColour,
  soleDepth: Schema.optional(Length),
});
export type Sandals = typeof SandalsPart.Type;

const TracedPiece = Schema.Struct({
  outline: Outline,
  tones: Schema.optionalKey(Tones),
});

const TrousersPart = Schema.TaggedStruct('Trousers', {
  paper: Paper,
  near: TracedPiece,
  far: TracedPiece,
  shoes: Schema.Struct({ paper: Paper, near: TracedPiece, far: TracedPiece }),
});
export type Trousers = typeof TrousersPart.Type;

export type Feet = StubLegs | Shoes | Sandals | Trousers;

const decodeStubLegs = decoder(StubLegsPart, { fields: { ink: 'InteriorInk' } });

const decodeShoes = decoder(ShoesPart, { fields: { ink: 'InteriorInk' } });

const decodeSandals = decoder(SandalsPart, { fields: { ink: 'InteriorInk' } });

const decodeTrousers = decoder(TrousersPart, { fields: { ink: 'InteriorInk' } });

type FeetFields =
  | typeof StubLegsPart.Encoded
  | typeof ShoesPart.Encoded
  | typeof SandalsPart.Encoded
  | typeof TrousersPart.Encoded;

export const decodeFeet = (input: FeetFields, part: string): Feet =>
  Match.value(input).pipe(
    Match.withReturnType<Feet>(),
    Match.tagsExhaustive({
      StubLegs: (legs) => decodeStubLegs(legs, part),
      Shoes: (shoes) => decodeShoes(shoes, part),
      Sandals: (sandals) => decodeSandals(sandals, part),
      Trousers: (trousers) => decodeTrousers(trousers, part),
    }),
  );

export const StubLegs = (o: Omit<StubLegs, '_tag'>): StubLegs =>
  decodeStubLegs({ _tag: 'StubLegs', ...o }, 'StubLegs');

export const Shoes = (o: Omit<Shoes, '_tag'>): Shoes =>
  decodeShoes({ _tag: 'Shoes', ...o }, 'Shoes');

export const Sandals = (o: Omit<Sandals, '_tag'>): Sandals =>
  decodeSandals({ _tag: 'Sandals', ...o }, 'Sandals');

export const Trousers = (o: Omit<Trousers, '_tag'>): Trousers =>
  decodeTrousers({ _tag: 'Trousers', ...o }, 'Trousers');
