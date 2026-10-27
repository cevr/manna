// A figure's hair, cut inside its traced head's outline: one paper and the
// light on it, with no ink and no rim of its own, so the head's one line goes
// round both (`silhouette`, `rig/parts.ts`). Traced from the concept, its
// outline in the head's frame. Curled hair is that mass with its curls laid
// on it, each a disc fitted to a lobe of the concept's hair (`film concept
// trace`, a part written as `curls`): its paper, its shade showing as the
// crescent on its side away from the light, crawling whole about its
// centre, so a curl stays round as it boils. Pure.

import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { HexColour, Paper, Tones, unrimmed } from '../paper.ts';
import { Length, Outline, Point, Share } from './measure.ts';

/** Traced hair: its outline as the concept cuts it, its paper, and the light on it as tones. */
const TracedHairPart = Schema.TaggedStruct('TracedHair', {
  outline: Outline,
  paper: Paper,
  /** Where the light catches it, laid as tones: a lit tuft, lighter lumps of curls. */
  tones: Schema.optionalKey(Tones),
}).check(unrimmed);

/** A curl: its centre, in the head's frame, and its radius. */
const Curl = Schema.Struct({ at: Point, r: Length });

/** Curled hair: its mass as traced, and its curls on it, each a disc in its paper whose shade shows as a crescent away from the light. */
const CurledHairPart = Schema.TaggedStruct('CurledHair', {
  /** The mass under the curls, as the concept cuts it. */
  outline: Outline,
  paper: Paper,
  tones: Schema.optionalKey(Tones),
  /** Its curls, front first. */
  curls: Schema.Array(Curl).check(Schema.isMinLength(1)),
  /** The dark of a curl: its side away from the light. */
  shade: HexColour,
  /** How far a curl's lit disc lies toward the light, a share of its radius: the crescent's width. */
  crescent: Share,
}).check(unrimmed);

export type Hair = typeof TracedHairPart.Type | typeof CurledHairPart.Type;

/** Traced hair, checked: an ink on it is refused by InteriorInk, a rim on its paper by InnerRim. */
const decodeTracedHair = decoder(TracedHairPart, { fields: { ink: 'InteriorInk' } });

/** Curled hair, checked as traced hair is. */
const decodeCurledHair = decoder(CurledHairPart, { fields: { ink: 'InteriorInk' } });

/** Hair's fields as a figure is given them: each kind's own, still to check. */
type HairFields = typeof TracedHairPart.Encoded | typeof CurledHairPart.Encoded;

/** Hair, checked as its kind. */
export const decodeHair = (input: HairFields, part: string): Hair =>
  input._tag === 'CurledHair' ? decodeCurledHair(input, part) : decodeTracedHair(input, part);

/** The hair. */
export const Hair = {
  /** Hair traced from the concept (the prosecutor's tuft, the judge's curls). */
  Traced: (o: Omit<typeof TracedHairPart.Type, '_tag'>): Hair =>
    decodeTracedHair({ _tag: 'TracedHair', ...o }, 'Hair.Traced'),
  /** Hair traced from the concept with its curls laid on it, each a disc fitted to a lobe of the concept's hair (the feast's lead). */
  Curls: (o: Omit<typeof CurledHairPart.Type, '_tag'>): Hair =>
    decodeCurledHair({ _tag: 'CurledHair', ...o }, 'Hair.Curls'),
};
