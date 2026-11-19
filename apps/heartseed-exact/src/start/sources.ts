/**
 * The opening's data source, as `app.ts` registers it: `startRead` is one
 * call through the runner on the call's clock and seed that reads the
 * garden (`readGarden`, which writes nothing) outside the garden's queue,
 * as home's reads do, and answers the launch's opening (`./opening.ts`).
 */

import { runCall, type Host } from '@manna/exact-kit/effect';
import type { FileStorage } from '@manna/exact-kit/storage';
import { Effect, Logger } from 'effect';

import { readGarden } from '../garden/program';
import { startOf, type StartShown } from './opening';

/** Exact's `Store` argument, as much of it as names it: the opening keeps nothing there. */
interface ExactStore {
  readonly forget: (name: string) => void;
}

/** How the source runs: the runner's host, and whether logs are dropped. */
export interface StartOptions {
  readonly host?: Host;
  readonly quiet?: boolean;
}

/** The opening's source. */
export const startSources = (options: StartOptions = {}) => {
  const logged = <A>(program: Effect.Effect<A>) => {
    if (options.quiet === true) return Effect.provide(program, Logger.layer([]));
    return program;
  };
  const startRead = (
    [now, seed]: readonly [number, number],
    _store: ExactStore,
    storage: FileStorage,
  ): Promise<StartShown> =>
    runCall(
      logged(Effect.map(readGarden(storage), (held) => startOf(held.garden))),
      { now, seed },
      options.host,
    );
  return { startRead };
};
