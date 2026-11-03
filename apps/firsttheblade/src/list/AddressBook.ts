import { Context, Effect, Ref } from 'effect';

import type { SubscriberId } from './Subscriber.id.ts';

export interface Forget {
  readonly subscriber: SubscriberId;
  readonly before: number;
}

export class AddressBook extends Context.Service<
  AddressBook,
  {
    readonly forget: (entries: ReadonlyArray<Forget>) => Effect.Effect<void>;
  }
>()('firsttheblade/AddressBook') {}

export const memory = Effect.gen(function* () {
  const forgotten = yield* Ref.make<ReadonlyArray<Forget>>([]);
  const forget = (entries: ReadonlyArray<Forget>) =>
    Ref.update(forgotten, (all) => [...all, ...entries]);
  return { book: AddressBook.of({ forget }), forgotten: Ref.get(forgotten) };
});
