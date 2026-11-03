import { Clock, Effect, Random } from 'effect';

/** A fresh id of the kind `brand` makes: the time it was made, and a random part, in base 36. */
export const uniqueId = <A>(brand: { readonly make: (id: string) => A }): Effect.Effect<A> =>
  Effect.map(Effect.all([Clock.currentTimeMillis, Random.nextIntBetween(0, 2 ** 52)]), ([at, n]) =>
    brand.make(`${at.toString(36)}-${n.toString(36)}`),
  );
