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

export const ListHandlers = Layer.mergeAll(
  ConfirmLetterLive,
  SignUpExpiryLive,
  ForgettingLive,
  RosterLive,
);
