/**
 * Where each subscriber's address lives, outside the model: the event log
 * keeps nothing it could not delete, so it names subscribers by id only. The
 * server writes an address there before it sends `SignUp`, and its Postman
 * reads it to send a letter (`../mail/addresses.ts`). The model only asks it
 * to forget: `Forgetting` does when a sign-up runs out.
 */
import { Context, Effect, Ref } from 'effect';

import type { SubscriberId } from './Subscriber.id.ts';

/**
 * Forget a subscriber's address when it was kept at or before `before`. An
 * address kept later came with a newer sign-up, and stays.
 */
export interface Forget {
  readonly subscriber: SubscriberId;
  readonly before: number;
}

export class AddressBook extends Context.Service<
  AddressBook,
  {
    /** Deletes these addresses. Deleting one not kept is nothing. */
    readonly forget: (entries: ReadonlyArray<Forget>) => Effect.Effect<void>;
  }
>()('firsttheblade/AddressBook') {}

/**
 * An address book that only records what it was asked to forget, for the
 * stories: the book, and what it was asked to forget, in order.
 */
export const memory = Effect.gen(function* () {
  const forgotten = yield* Ref.make<ReadonlyArray<Forget>>([]);
  const forget = (entries: ReadonlyArray<Forget>) =>
    Ref.update(forgotten, (all) => [...all, ...entries]);
  return { book: AddressBook.of({ forget }), forgotten: Ref.get(forgotten) };
});
