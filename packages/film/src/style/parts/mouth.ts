import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { HexColour } from '../paper.ts';
import { Length } from './measure.ts';

/** An open mouth: its width and height at its widest, units, and its one colour. */
const OpenMouthPart = Schema.TaggedStruct('OpenMouth', {
  w: Length,
  h: Length,
  paper: HexColour,
});
export type OpenMouth = typeof OpenMouthPart.Type;

/** An open mouth, checked: it lies inside the head, so an ink is refused by InteriorInk and a rim by InnerRim. */
export const decodeMouth = decoder(OpenMouthPart, {
  fields: { ink: 'InteriorInk', rim: 'InnerRim' },
});

/** A mouth thrown open where the kit's mouth sits: it adds `shout`, 0 at rest. */
export const OpenMouth = (o: Omit<OpenMouth, '_tag'>): OpenMouth =>
  decodeMouth({ _tag: 'OpenMouth', ...o }, 'OpenMouth');
