/**
 * Home's data sources, as `app.ts` registers them: `homeRead` answers home
 * and `listRead` a list's page. Each is one call through the runner on the
 * call's clock and seed: it reads the garden (`readGarden`, which writes
 * nothing) in the garden's own queue, so no read lands between another
 * call's writes, takes the session's view as the Contract hands it, and
 * answers the screen. A view that does not decode is no plan made. The key
 * argument is the Contract's mark of the garden it last read, so a change
 * asks again; the source reads the file, never the key.
 */

import { runCall, type Host } from '@manna/exact-kit/effect';
import type { FileStorage } from '@manna/exact-kit/storage';
import { Effect, Logger, Option, Schema } from 'effect';

import { readGarden } from '../garden/program';
import { oneAtATime, type makeQueue } from '../garden/writes';
import { listPageOf, type ListShown } from '../list/page';
import type { SessionWire } from '../today/sources';
import { homeOf, type HomeShown } from './home';
import { NO_PLAN } from './session';

const Count = Schema.Number.check(Schema.isFinite());

const Item = Schema.Struct({
  reference: Schema.String,
  fresh: Schema.Boolean,
  recalls: Count,
  seconds: Count,
});

/** The session's view as the Contract hands it (`SessionWire`). */
const Wire = Schema.Struct({
  minutes: Count,
  planned: Schema.Boolean,
  items: Schema.Array(Item),
  held: Schema.NullOr(Item),
  visit: Schema.Array(Item),
});

/** The view `wire` names; no plan made for anything that does not decode as one. */
export const wireOf = (wire: SessionWire): SessionWire =>
  Option.match(Schema.decodeOption(Wire)(wire), {
    onNone: () => NO_PLAN,
    onSome: (each) => ({
      minutes: each.minutes,
      planned: each.planned,
      items: [...each.items],
      held: each.held,
      visit: [...each.visit],
    }),
  });

/** Exact's `Store` argument, as much of it as names it: home keeps nothing there. */
interface ExactStore {
  readonly forget: (name: string) => void;
}

/** How the sources run: the garden's queue (one per launch, shared with the garden's sources), the runner's host, and whether logs are dropped. */
export interface HomeOptions {
  readonly queue: ReturnType<typeof makeQueue>;
  readonly host?: Host;
  readonly quiet?: boolean;
}

/** Home's sources over the garden's queue. */
export const homeSources = (options: HomeOptions) => {
  const logged = <A>(program: Effect.Effect<A>) => {
    if (options.quiet === true) return Effect.provide(program, Logger.layer([]));
    return program;
  };
  const read = <A>(
    storage: FileStorage,
    now: number,
    seed: number,
    answer: (held: Effect.Success<ReturnType<typeof readGarden>>) => A,
  ) =>
    oneAtATime(options.queue, () =>
      runCall(logged(Effect.map(readGarden(storage), answer)), { now, seed }, options.host),
    );

  const homeRead = (
    [offset, wire, _key, now, seed]: readonly [number, SessionWire, string, number, number],
    _store: ExactStore,
    storage: FileStorage,
  ): Promise<HomeShown> =>
    read(storage, now, seed, (held) => homeOf({ held, wire: wireOf(wire), at: { now, offset } }));

  const listRead = (
    [slug, offset, wire, _key, now, seed]: readonly [
      string,
      number,
      SessionWire,
      string,
      number,
      number,
    ],
    _store: ExactStore,
    storage: FileStorage,
  ): Promise<ListShown> =>
    read(storage, now, seed, (held) =>
      listPageOf({ held, wire: wireOf(wire), at: { now, offset } }, slug),
    );

  return { homeRead, listRead };
};
