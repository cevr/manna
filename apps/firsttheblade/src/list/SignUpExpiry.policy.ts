/**
 * Every sign-up gets its deadline, `PENDING_FOR` after it. Only the newest
 * sign-up's deadline records anything (`ExpireSignUp`), so a later sign-up or
 * a confirmation makes the earlier ones nothing.
 */
import * as Domain from '@alchemy.run/domain';
import { Effect } from 'effect';

import { ExpireSignUp } from './Leave.command.ts';
import { SignedUp } from './SignUp.command.ts';
import { Subscriber } from './Subscriber.aggregate.ts';
import { PENDING_FOR } from './timing.ts';

export class SignUpExpiry extends Domain.Policy('SignUpExpiry', {
  from: Subscriber,
  on: [SignedUp],
}) {}

export const SignUpExpiryLive = SignUpExpiry.toLayer(
  Effect.gen(function* () {
    const subscribers = yield* Subscriber;
    return Effect.fn('SignUpExpiry.schedule')(function* ({ source, event }) {
      yield* subscribers.schedule(source.id, ExpireSignUp.make({ signedUpAt: event.at }), {
        after: PENDING_FOR,
        commandId: `expire/${source.id}/${event.at}`,
      });
    });
  }),
);
