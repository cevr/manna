import { Clock, Effect, Random } from 'effect';

export const uniqueId = <A>(brand: { readonly make: (id: string) => A }): Effect.Effect<A> =>
  Effect.map(Effect.all([Clock.currentTimeMillis, Random.nextIntBetween(0, 2 ** 52)]), ([at, n]) =>
    brand.make(`${at.toString(36)}-${n.toString(36)}`),
  );
