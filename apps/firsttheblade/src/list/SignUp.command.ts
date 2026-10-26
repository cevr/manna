import * as Domain from '@alchemy.run/domain';
import { Schema } from 'effect';

import { Millis, Origin, SubscriberId } from './Subscriber.id.ts';

/** An address signed up, or signed up again; it waits for its confirmation. */
export class SignedUp extends Domain.Event('SignedUp', { at: Millis }) {}

/**
 * A confirm link was issued at `issued`: the newest one, and the only one
 * that confirms. Its letter's links lead to `origin`.
 */
export class ConfirmLinkIssued extends Domain.Event('ConfirmLinkIssued', {
  issued: Millis,
  origin: Origin,
}) {}

/**
 * Put an address on the list, or back on it after it left. A confirmed
 * subscriber stays as it is. A confirm link is issued unless one went out
 * within `RESEND_AFTER`, even before the address left.
 */
export class SignUp extends Domain.Command('SignUp', {
  target: SubscriberId,
  /** The site the sign-up was made at. */
  input: { origin: Origin },
  events: [SignedUp, ConfirmLinkIssued],
  rejects: [],
  /** The link issued now, if one was. */
  reply: { issued: Schema.OptionFromNullOr(Millis) },
}) {}
