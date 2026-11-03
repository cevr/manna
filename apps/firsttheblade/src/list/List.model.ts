/**
 * The email list as an `@alchemy.run/domain` model: one aggregate per
 * subscriber, its letters sent by policies, and what lives outside the model
 * (addresses, the roster) kept by projections. It runs in memory in the
 * stories (`./List.story.test.ts`) and the route tests, and on Durable
 * Objects on Cloudflare (`../mail/model.ts`).
 */
import * as Domain from '@alchemy.run/domain';
import { Layer } from 'effect';

import { ConfirmLetter, ConfirmLetterLive } from './ConfirmLetter.policy.ts';
import { Forgetting, ForgettingLive } from './Forgetting.projection.ts';
import { Roster, RosterLive } from './Roster.projection.ts';
import { SignUpExpiry, SignUpExpiryLive } from './SignUpExpiry.policy.ts';
import { Subscriber } from './Subscriber.aggregate.ts';

export class List extends Domain.Model('List', {
  aggregates: [Subscriber],
  policies: [ConfirmLetter, SignUpExpiry],
  projections: [Forgetting, Roster],
}) {}

/** Every policy and projection of the list, as one Layer. */
export const ListHandlers = Layer.mergeAll(
  ConfirmLetterLive,
  SignUpExpiryLive,
  ForgettingLive,
  RosterLive,
);
