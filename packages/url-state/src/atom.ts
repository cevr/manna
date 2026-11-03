import { Context, Effect, Exit, Layer, Option, Scheduler, Scope, Stream } from 'effect';
import * as Atom from 'effect/reactivity/Atom';

import { Location, type Entry } from './location.js';
import * as Place from './place.js';
import { printHref, readHref } from './url-parts.js';
import * as UrlState from './url-state.js';

export const layer: Atom.Writable<Layer.Layer<Location>> = Atom.keepAlive(
  Atom.make<Layer.Layer<Location>>(
    Layer.effect(Location, Effect.die('seed UrlAtom.layer through the registry’s initial values')),
  ),
);

const services: Atom.Atom<Services> = Atom.keepAlive(
  Atom.make((get) => {
    const scope = Scope.makeUnsafe();
    get.addFinalizer(() => Effect.runSync(Scope.close(scope, Exit.void)));
    return Effect.runSync(
      Effect.gen(function* () {
        const given = yield* Layer.buildWithScope(get(layer), scope);
        return yield* Option.match(Context.getOption(given, UrlState.UrlState), {
          onSome: (own) => Effect.succeed(Context.add(given, UrlState.UrlState, own)),
          onNone: () =>
            Layer.buildWithScope(
              UrlState.layer.pipe(Layer.provideMerge(Layer.succeedContext(given))),
              scope,
            ),
        });
      }),
    );
  }),
);

const follow =
  <A>(
    read: (context: Services) => Effect.Effect<A>,
    changes: (context: Services) => Stream.Stream<A>,
  ) =>
  (get: Atom.AtomContext): A => {
    const context = get(services);
    const fiber = Effect.runForkWith(context)(
      changes(context).pipe(
        Stream.runForEach((value) => Effect.sync(() => get.setSelf(value))),
        Effect.provideService(Scheduler.Scheduler, new Scheduler.MixedScheduler('sync')),
      ),
    );
    get.addFinalizer(() => fiber.interruptUnsafe());
    return Effect.runSyncWith(context)(read(context));
  };

type Services = Context.Context<Location | UrlState.UrlState>;

const currentHref = (context: Services) => Context.get(context, UrlState.UrlState).href;

const hrefState = Atom.keepAlive(
  Atom.writable(
    follow(currentHref, (context) => Context.get(context, UrlState.UrlState).changes),
    (ctx, value: string) => ctx.setSelf(value),
  ),
);

export const href: Atom.Atom<string> = hrefState;

export const entry: Atom.Atom<Entry> = Atom.keepAlive(
  Atom.make(
    follow(
      (context) => Context.get(context, Location).current,
      (context) => Context.get(context, Location).changes,
    ),
  ),
);

const withoutHash = (url: string): string => printHref({ ...readHref(url), hash: {} });

export const place = <A>(at: Place.Place<A>): Atom.Writable<Option.Option<A>, A> => {
  const atom = Atom.writable(
    (get) => Place.decode(at, get(href)),
    (ctx, value: A) => {
      const context = ctx.get(services);
      Effect.runSyncWith(context)(UrlState.set(at, value));
      ctx.set(hrefState, Effect.runSyncWith(context)(currentHref(context)));
    },
  );
  if (at.policies.hash.size === 0) return atom;
  return Atom.withServerValue(atom, (get) => Place.decode(at, withoutHash(get(href))));
};
