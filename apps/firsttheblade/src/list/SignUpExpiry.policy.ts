/**
 * Every sign-up gets its deadline, `PENDING_FOR` after it, and so does a
 * subscriber imported while it waited to confirm. Only the newest sign-up's
 * deadline records anything (`ExpireSignUp`), so a later sign-up or a
 * confirmation makes the earlier ones nothing. A deadline already past, as an
 * old import's may be, comes due at once.
 */
import * as Domain from '@alchemy.run/domain';
import { DateTime, Duration, Effect } from 'effect';

import { Imported } from './Import.command.ts';
import { ExpireSignUp } from './Leave.command.ts';
import { SignedUp } from './SignUp.command.ts';
import { Subscriber } from './Subscriber.aggregate.ts';
import type { SubscriberId } from './Subscriber.id.ts';
import { PENDING_FOR } from './timing.ts';

export class SignUpExpiry extends Domain.Policy('SignUpExpiry', {
  from: Subscriber,
  on: [SignedUp, Imported],
}) {}

export const SignUpExpiryLive = SignUpExpiry.toLayer(
  Effect.gen(function* () {
    const subscribers = yield* Subscriber;
    const deadline = (id: SubscriberId, signedUpAt: number) =>
      subscribers.schedule(id, ExpireSignUp.make({ signedUpAt }), {
        at: DateTime.makeUnsafe(signedUpAt + Duration.toMillis(PENDING_FOR)),
        commandId: `expire/${id}/${signedUpAt}`,
      });
    return Effect.fn('SignUpExpiry.schedule')(function* ({ source, event }) {
      if (event._tag === 'SignedUp') return yield* deadline(source.id, event.at);
      if (event.standing._tag !== 'Pending') return;
      yield* deadline(source.id, event.signedUpAt);
    });
  }),
);
