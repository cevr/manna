import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Paper } from '../paper.ts';
import { Share } from './measure.ts';

const HandsPart = Schema.TaggedStruct('Hands', {
  paper: Paper,
  /**
   * Its circle's width against the head's, as the concept draws it. The
   * house draws nothing from it: the host sizes each hand by a scale of its
   * own, worked out from this share by hand (RBF's `court-cast.ts` `HAND`).
   */
  share: Share,
});
export type Hands = typeof HandsPart.Type;

/** Hands, checked: a circle of a paper and a share; an ink of its own is refused by InteriorInk, any other field by CircleHands. */
export const decodeHands = decoder(HandsPart, {
  any: 'CircleHands',
  fields: { ink: 'InteriorInk' },
});

/** A figure's two circle hands. */
export const Hands = (o: Omit<Hands, '_tag'>): Hands =>
  decodeHands({ _tag: 'Hands', ...o }, 'Hands');
