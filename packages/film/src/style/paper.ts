import { type Brand, Schema } from 'effect';
import { type Hex, channelsOf } from '../canvas/colour.ts';
import { hsvOf, shadeKind } from '../core/figure.ts';
import { decoder, ruleCheck } from './decode.ts';
import { shaded } from './house.ts';
import { Opacity, Outline } from './parts/measure.ts';
import type { PieceLook } from './rig/parts.ts';

export const HexColour = Schema.TemplateLiteral(['#', Schema.String]).check(
  Schema.isPattern(/^#[0-9a-f]{6}$/i, { message: 'a colour as #rrggbb hex' }),
);

const Crease = Schema.Struct({
  at: Schema.optionalKey(Schema.Finite),
  soft: Schema.optionalKey(Schema.Finite),
  toward: Schema.optionalKey(Schema.Finite),
  crescent: Schema.optionalKey(Schema.Finite),
});
export type Crease = typeof Crease.Type;

const PaperFields = Schema.Struct({
  color: HexColour,
  shade: Schema.optionalKey(HexColour),
  light: HexColour,
  crease: Schema.optionalKey(Crease),
  rim: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
});
type PaperFields = typeof PaperFields.Type;

export const colourOfItsOwn = (color: Hex, shade: Hex): true | string =>
  shadeKind(hsvOf(channelsOf(color)), hsvOf(channelsOf(shade))) === 'colour'
    ? true
    : `its shade ${shade} is ${color} greyed or blackened: give it a hue of its own`;

const colourShade = ruleCheck('GreyShade', (p: PaperFields) =>
  p.shade === undefined ? true : colourOfItsOwn(p.color, p.shade),
);

export const Paper = PaperFields.check(colourShade).pipe(Schema.brand('Paper'));
export type Paper = typeof Paper.Type;

const decodePaper = decoder(Paper, { fields: { ink: 'InteriorInk' } });

export const unrimmed = ruleCheck('InnerRim', (part: { readonly paper: Paper }) =>
  part.paper.rim === undefined
    ? true
    : `its paper is rimmed ${part.paper.rim} wide, inside the outline of the piece it lies within`,
);

const ToneFields = {
  pts: Outline,
  color: HexColour,
  alpha: Schema.optionalKey(Opacity),
  soft: Schema.optionalKey(Schema.Boolean),
};

export const Tones = Schema.Array(Schema.Struct(ToneFields));

export const GarmentTones = Schema.Array(
  Schema.Struct({ ...ToneFields, skin: Schema.optionalKey(Schema.Literal(true)) }),
);

export const paper = (fields: PaperFields, name = 'paper'): Paper => decodePaper(fields, name);

type Papers<P> = { readonly [K in keyof P]: P[K] & Brand.Brand<'Paper'> };

const checkPapers: <P extends Readonly<Record<string, PaperFields>>>(
  fields: P,
) => asserts fields is P & Papers<P> = (fields) => {
  for (const [name, f] of Object.entries(fields)) paper(f, `paper ${name}`);
};

export const papers = <const P extends Readonly<Record<string, PaperFields>>>(
  fields: P,
): Papers<P> => {
  checkPapers(fields);
  return fields;
};

export const rampedPaper = (base: Hex): Paper => {
  const r = shaded(base);
  return paper({ color: r.base, shade: r.shade, light: r.light }, `the ramp of ${base}`);
};

export const looked = (p: Paper, extra: Partial<PieceLook> = {}): PieceLook => ({
  ...p,
  ...extra,
});
