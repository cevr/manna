import * as D1Client from '@effect/sql-d1/D1Client';
import { Effect, Layer } from 'effect';

import { SqlAtomic } from '@manna/core/egw-db';

export const D1Atomic: Layer.Layer<SqlAtomic, never, D1Client.D1Client> = Layer.effect(
  SqlAtomic,
  Effect.gen(function* () {
    const d1 = yield* D1Client.D1Client;
    return SqlAtomic.of({ run: (statements) => Effect.asVoid(d1.batch(statements)) });
  }),
);
