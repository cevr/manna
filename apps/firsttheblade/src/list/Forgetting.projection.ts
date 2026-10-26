/**
 * A sign-up that ran out unconfirmed deletes the address it gave from the
 * address book: the one kept by `PENDING_FOR` after it, when the deadline
 * came. An address kept after that came with a newer sign-up, and stays.
 */
import * as Domain from '@alchemy.run/domain';
import { Duration, Effect } from 'effect';

import { AddressBook } from './AddressBook.ts';
import { SignUpExpired } from './Leave.command.ts';
import { Subscriber } from './Subscriber.aggregate.ts';
import { PENDING_FOR } from './timing.ts';

export class Forgetting extends Domain.Projection('Forgetting', {
  from: [Subscriber],
  key: Subscriber,
  on: [SignUpExpired],
}) {}

export const ForgettingLive = Forgetting.toLayer(
  Effect.gen(function* () {
    const book = yield* AddressBook;
    return Effect.fn('Forgetting.forget')(function* (batch) {
      yield* book.forget(
        batch.map(({ key, event }) => ({
          subscriber: key.id,
          before: event.signedUpAt + Duration.toMillis(PENDING_FOR),
        })),
      );
    });
  }),
);
