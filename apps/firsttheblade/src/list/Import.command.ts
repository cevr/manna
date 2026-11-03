import * as Domain from '@alchemy.run/domain';
import { Schema } from 'effect';

import { Letters, Millis, SubscriberId } from './Subscriber.id.ts';

export const Standing = Schema.Union([
  Schema.TaggedStruct('Pending', { leftAt: Schema.OptionFromNullOr(Millis) }),
  Schema.TaggedStruct('Confirmed', { at: Millis }),
  Schema.TaggedStruct('Left', { at: Millis }),
]);
export type Standing = typeof Standing.Type;

const fields = {
  signedUpAt: Millis,
  link: Schema.OptionFromNullOr(Millis),
  standing: Standing,
  letters: Letters,
};

export class Imported extends Domain.Event('Imported', fields) {}

export class Import extends Domain.Command('Import', {
  target: SubscriberId,
  input: fields,
  events: [Imported],
  rejects: [],
}) {}
