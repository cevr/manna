import * as Domain from '@alchemy.run/domain';

import { Millis, SubscriberId } from './Subscriber.id.ts';

export class Left extends Domain.Event('Left', { at: Millis }) {}

export class Leave extends Domain.Command('Leave', {
  target: SubscriberId,
  input: {},
  events: [Left],
  rejects: [],
}) {}

export class SignUpExpired extends Domain.Event('SignUpExpired', { signedUpAt: Millis }) {}

export class SignUpLapsed extends Domain.Event('SignUpLapsed', { leftAt: Millis }) {}

export class ExpireSignUp extends Domain.Command('ExpireSignUp', {
  target: SubscriberId,
  input: { signedUpAt: Millis },
  events: [SignUpExpired, SignUpLapsed],
  rejects: [],
}) {}
