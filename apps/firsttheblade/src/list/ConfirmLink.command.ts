import * as Domain from '@alchemy.run/domain';

import { Millis, SubscriberId } from './Subscriber.id.ts';

export class ConfirmLinkReleased extends Domain.Event('ConfirmLinkReleased', { issued: Millis }) {}

export class ReleaseConfirmLink extends Domain.Command('ReleaseConfirmLink', {
  target: SubscriberId,
  input: { issued: Millis },
  events: [ConfirmLinkReleased],
  rejects: [],
}) {}

export class Confirmed extends Domain.Event('Confirmed', { at: Millis }) {}

export class StaleLink extends Domain.Rejection('StaleLink') {}

export class Confirm extends Domain.Command('Confirm', {
  target: SubscriberId,
  input: { issued: Millis },
  events: [Confirmed],
  rejects: [StaleLink],
}) {}
