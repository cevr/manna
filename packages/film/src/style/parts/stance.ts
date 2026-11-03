import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Length, Units } from './measure.ts';

const StandingBreath = Schema.Struct({
  period: Length,
  trunk: Length,
  neck: Units,
});

const StandingPart = Schema.TaggedStruct('Standing', { breath: StandingBreath });
export type Standing = typeof StandingPart.Type;

const SeatedBreath = Schema.Struct({
  period: Length,
  width: Length,
  neck: Units,
});

const SeatedPart = Schema.TaggedStruct('Seated', { breath: SeatedBreath });
export type Seated = typeof SeatedPart.Type;

export type Stance = Standing | Seated;

export const decodeStanding = decoder(StandingPart);

export const decodeSeated = decoder(SeatedPart);

export const Stance = {
  Standing: (o: Omit<Standing, '_tag'>): Standing =>
    decodeStanding({ _tag: 'Standing', ...o }, 'Stance.Standing'),
  Seated: (o: Omit<Seated, '_tag'>): Seated =>
    decodeSeated({ _tag: 'Seated', ...o }, 'Stance.Seated'),
};
