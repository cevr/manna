/**
 * Where each subscriber's address lives, outside the model: the event log
 * keeps nothing it could not delete, so it names subscribers by id only. The
 * server writes an address here before it sends `SignUp`, and the Postman
 * reads it to send a letter. `Forgetting` deletes it when a sign-up runs out.
 */
import type { RuntimeContext } from 'alchemy/RuntimeContext';
import { Context, Effect, Ref } from 'effect';

import type { SubscriberId } from './Subscriber.id.ts';

export class AddressBook extends Context.Service<
  AddressBook,
  {
    /** Deletes the addresses of these subscribers. Deleting one not kept is nothing. */
    readonly forget: (
      ids: ReadonlyArray<SubscriberId>,
    ) => Effect.Effect<void, never, RuntimeContext>;
  }
>()('firsttheblade/AddressBook') {}

/**
 * An address book that only records what it was asked to forget, for the
 * stories: the book, and the ids it was asked to forget, in order.
 */
export const memory = Effect.gen(function* () {
  const forgotten = yield* Ref.make<ReadonlyArray<SubscriberId>>([]);
  const forget = (ids: ReadonlyArray<SubscriberId>) =>
    Ref.update(forgotten, (all) => [...all, ...ids]);
  return { book: AddressBook.of({ forget }), forgotten: Ref.get(forgotten) };
});
