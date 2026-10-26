/**
 * A subscriber brought over from the D1 list the model replaced
 * (`../mail/legacy.ts`), as that list kept it: when it last signed up, its
 * newest confirm link, where it stood, and its film letters. The model takes
 * it only into a subscriber it has never seen, so importing twice, or after
 * the address signed up here, changes nothing.
 */
import * as Domain from '@alchemy.run/domain';
import { Schema } from 'effect';

import { Letters, Millis, SubscriberId } from './Subscriber.id.ts';

/** Where an imported subscriber stood. */
export const Standing = Schema.Union([
  /** Waiting to confirm; `leftAt` is when it last left, if it ever did. */
  Schema.TaggedStruct('Pending', { leftAt: Schema.OptionFromNullOr(Millis) }),
  Schema.TaggedStruct('Confirmed', { at: Millis }),
  Schema.TaggedStruct('Left', { at: Millis }),
]);
export type Standing = typeof Standing.Type;

const fields = {
  signedUpAt: Millis,
  /** When its newest confirm link was issued, if one stands. */
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
