import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Paper, Tones, unrimmed } from '../paper.ts';
import { Outline } from './measure.ts';

/** The lower lip in a beard, under the mouth line: its outline and its paper. */
const Lip = Schema.Struct({ outline: Outline, paper: Paper }).check(unrimmed);

/** A beard: its outline as the concept cuts it, its paper, the light on it as tones, and the lip cut in it. */
const BeardPart = Schema.TaggedStruct('Beard', {
  outline: Outline,
  paper: Paper,
  /** Where the light catches it, laid as tones. */
  tones: Schema.optionalKey(Tones),
  lip: Schema.optionalKey(Lip),
}).check(unrimmed);
export type Beard = typeof BeardPart.Type;

/** A beard, checked: an ink on it or its lip is refused by InteriorInk, a rim on either's paper by InnerRim. */
export const decodeBeard = decoder(BeardPart, { fields: { ink: 'InteriorInk' } });

/** A beard traced from the concept (Christ's, the farmer's), and the lip in it. */
export const Beard = (o: Omit<Beard, '_tag'>): Beard =>
  decodeBeard({ _tag: 'Beard', ...o }, 'Beard');
