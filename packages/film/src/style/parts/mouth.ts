import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { HexColour } from '../paper.ts';
import { Length } from './measure.ts';

const OpenMouthPart = Schema.TaggedStruct('OpenMouth', {
  w: Length,
  h: Length,
  paper: HexColour,
});
export type OpenMouth = typeof OpenMouthPart.Type;

export const decodeMouth = decoder(OpenMouthPart, {
  fields: { ink: 'InteriorInk', rim: 'InnerRim' },
});

export const OpenMouth = (o: Omit<OpenMouth, '_tag'>): OpenMouth =>
  decodeMouth({ _tag: 'OpenMouth', ...o }, 'OpenMouth');
