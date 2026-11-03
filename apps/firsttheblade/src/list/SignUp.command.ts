import * as Domain from '@alchemy.run/domain';
import { Schema } from 'effect';

import { Millis, Origin, SubscriberId } from './Subscriber.id.ts';

export class SignedUp extends Domain.Event('SignedUp', { at: Millis }) {}

export class ConfirmLinkIssued extends Domain.Event('ConfirmLinkIssued', {
  issued: Millis,
  origin: Origin,
}) {}

export class SignUp extends Domain.Command('SignUp', {
  target: SubscriberId,
  input: { origin: Origin },
  events: [SignedUp, ConfirmLinkIssued],
  rejects: [],
  reply: { issued: Schema.OptionFromNullOr(Millis) },
}) {}
