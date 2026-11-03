import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Stage } from 'alchemy/Stage';
import { Console, Effect, Option, Path } from 'effect';

import { RECORD, shippable } from './approval.ts';

export const checked = Effect.fn('KitShippable.run')(function* (app: string) {
  const approval = yield* shippable(app);
  yield* Console.log(
    `${RECORD}: approved on ask ${approval.ask} (${approval.answer}) in the lab at ${approval.lab}; every image of the build held`,
  );
  return approval;
});

export const prodGate = Effect.fn('KitShippable.prodGate')(function* (app: string) {
  if ((yield* Stage) !== 'prod') return Option.none();
  return Option.some(yield* checked(app));
});

if (import.meta.main)
  Effect.gen(function* () {
    const path = yield* Path.Path;
    yield* checked(path.dirname(import.meta.dir));
  }).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
