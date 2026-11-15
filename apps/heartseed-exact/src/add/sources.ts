/**
 * Add verses' reads, as `app.ts` registers them: `addRead` the shelves,
 * `addSection` a Handbook section's lists, `addList` one list's page. Each
 * is one call through the runner that reads the garden (`readGarden`,
 * which writes nothing) outside the garden's queue, as home's reads do:
 * Exact's iOS bake refuses a resource whose answer waits on a promise no
 * storage step settles. The key argument is the Contract's mark of the
 * garden it last read, so a change asks again; the source reads the file,
 * never the key. Planting is the garden's `addPlant` and `gardenPlant`,
 * through its queue.
 */

import { runCall, type Host } from '@manna/exact-kit/effect';
import type { FileStorage } from '@manna/exact-kit/storage';
import { Effect, Logger } from 'effect';

import { readGarden, type Held } from '../garden/program';
import {
  addListOf,
  addSectionOf,
  addShownOf,
  type AddList,
  type AddSection,
  type AddShown,
} from './shelves';

/** Exact's `Store` argument, as much of it as names it: Add verses keeps nothing there. */
interface ExactStore {
  readonly forget: (name: string) => void;
}

/** How the sources run: the runner's host, and whether logs are dropped. */
export interface AddOptions {
  readonly host?: Host;
  readonly quiet?: boolean;
}

/** Add verses' read sources. */
export const addSources = (options: AddOptions = {}) => {
  const logged = <A>(program: Effect.Effect<A>) => {
    if (options.quiet === true) return Effect.provide(program, Logger.layer([]));
    return program;
  };
  const read = <A>(storage: FileStorage, now: number, seed: number, answer: (held: Held) => A) =>
    runCall(logged(Effect.map(readGarden(storage), answer)), { now, seed }, options.host);

  const addRead = (
    [_key, now, seed]: readonly [string, number, number],
    _store: ExactStore,
    storage: FileStorage,
  ): Promise<AddShown> => read(storage, now, seed, addShownOf);

  const addSection = (
    [slug, _key, now, seed]: readonly [string, string, number, number],
    _store: ExactStore,
    storage: FileStorage,
  ): Promise<AddSection> => read(storage, now, seed, (held) => addSectionOf(slug, held));

  const addList = (
    [slug, answer, _key, now, seed]: readonly [string, string, string, number, number],
    _store: ExactStore,
    storage: FileStorage,
  ): Promise<AddList> => read(storage, now, seed, (held) => addListOf(slug, held, answer));

  return { addRead, addSection, addList };
};
