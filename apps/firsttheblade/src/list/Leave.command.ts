import * as Domain from '@alchemy.run/domain';

import { Millis, SubscriberId } from './Subscriber.id.ts';

/** The subscriber left the list. */
export class Left extends Domain.Event('Left', { at: Millis }) {}

/** Take a subscriber off the list. Leaving twice is leaving. */
export class Leave extends Domain.Command('Leave', {
  target: SubscriberId,
  input: {},
  events: [Left],
  rejects: [],
}) {}

/** A sign-up that never confirmed ran out: the subscriber is forgotten, its address with it. */
export class SignUpExpired extends Domain.Event('SignUpExpired', {}) {}

/** A sign-up after leaving ran out unconfirmed: the subscriber is off the list again, as it was at `leftAt`. */
export class SignUpLapsed extends Domain.Event('SignUpLapsed', { leftAt: Millis }) {}

/**
 * The deadline of the sign-up made at `signedUpAt`, `PENDING_FOR` after it.
 * It records nothing when the subscriber confirmed or signed up again since.
 */
export class ExpireSignUp extends Domain.Command('ExpireSignUp', {
  target: SubscriberId,
  input: { signedUpAt: Millis },
  events: [SignUpExpired, SignUpLapsed],
  rejects: [],
}) {}
