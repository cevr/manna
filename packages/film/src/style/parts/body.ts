import { Match, Schema } from 'effect';
import { decoder } from '../decode.ts';
import { GarmentTones, Paper } from '../paper.ts';
import { Corners, Length, Outline, Units, oneRadiusOrEach } from './measure.ts';

const neckAboveHem = Schema.makeFilter((t: { readonly neck: number; readonly hem: number }) =>
  t.neck < t.hem
    ? true
    : `its neck (${t.neck}) lies at or below its hem (${t.hem}): a tunic is cut from its neck down to its hem`,
);

const TunicPart = Schema.TaggedStruct('Tunic', {
  neck: Units,
  hem: Units,
  half: Schema.Struct({ neck: Length, hem: Length }),
  radius: Length,
  bow: Units,
  paper: Paper,
}).check(neckAboveHem);
export type Tunic = typeof TunicPart.Type;

const CutRobePart = Schema.TaggedStruct('CutRobe', {
  corners: Corners,
  radii: Schema.Array(Length).check(Schema.isMinLength(1)),
  hem: Units,
  paper: Paper,
  tones: Schema.optionalKey(GarmentTones),
}).check(oneRadiusOrEach);
type CutRobe = typeof CutRobePart.Type;

const TracedRobePart = Schema.TaggedStruct('TracedRobe', {
  outline: Outline,
  hem: Units,
  paper: Paper,
  tones: Schema.optionalKey(GarmentTones),
});
type TracedRobe = typeof TracedRobePart.Type;

export type Garment = Tunic | CutRobe | TracedRobe;

export const tonesOn = (g: Garment) => (g._tag === 'Tunic' ? [] : (g.tones ?? []));

const decodeTunic = decoder(TunicPart, { fields: { ink: 'InteriorInk' } });
const decodeCutRobe = decoder(CutRobePart, { fields: { ink: 'InteriorInk' } });
const decodeTracedRobe = decoder(TracedRobePart, { fields: { ink: 'InteriorInk' } });

type GarmentFields =
  | typeof TunicPart.Encoded
  | typeof CutRobePart.Encoded
  | typeof TracedRobePart.Encoded;

export const decodeGarment = (input: GarmentFields, part: string): Garment =>
  Match.value(input).pipe(
    Match.withReturnType<Garment>(),
    Match.tagsExhaustive({
      Tunic: (tunic) => decodeTunic(tunic, part),
      CutRobe: (robe) => decodeCutRobe(robe, part),
      TracedRobe: (robe) => decodeTracedRobe(robe, part),
    }),
  );

export const Tunic = (o: Omit<Tunic, '_tag'>): Tunic =>
  decodeTunic({ _tag: 'Tunic', ...o }, 'Tunic');

export const Robe = {
  Cut: (o: Omit<CutRobe, '_tag'>): CutRobe => decodeCutRobe({ _tag: 'CutRobe', ...o }, 'Robe.Cut'),
  Traced: (o: Omit<TracedRobe, '_tag'>): TracedRobe =>
    decodeTracedRobe({ _tag: 'TracedRobe', ...o }, 'Robe.Traced'),
};
