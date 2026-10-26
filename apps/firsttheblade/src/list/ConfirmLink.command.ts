import * as Domain from '@alchemy.run/domain';

import { Millis, SubscriberId } from './Subscriber.id.ts';

/** A confirm link's letter never went: the next sign-up may issue one at once. */
export class ConfirmLinkReleased extends Domain.Event('ConfirmLinkReleased', { issued: Millis }) {}

/** Give back the link issued at `issued` when its letter could not be sent. Any other link is left as it is. */
export class ReleaseConfirmLink extends Domain.Command('ReleaseConfirmLink', {
  target: SubscriberId,
  input: { issued: Millis },
  events: [ConfirmLinkReleased],
  rejects: [],
}) {}

/** The subscriber confirmed: the list sends it films. */
export class Confirmed extends Domain.Event('Confirmed', { at: Millis }) {}

/** The link ran out, was replaced by a newer one, or names a subscriber that is not waiting to confirm. */
export class StaleLink extends Domain.Rejection('StaleLink') {}

/** Confirm with the link issued at `issued`. A subscriber already confirmed stays so. */
export class Confirm extends Domain.Command('Confirm', {
  target: SubscriberId,
  input: { issued: Millis },
  events: [Confirmed],
  rejects: [StaleLink],
}) {}
