// The host's moves of the address bar: a reload loads the page at the place
// its URL keeps, a write made the moment before among it (`UrlState`
// flushes a tick's writes after the tick, so a reload that did not wait
// would load the place before); and each move is named by its cause, the
// place's declaration saying which is a step Back walks.

import { Location, UrlState } from '@manna/url-state';
import { layerMemory } from '@manna/url-state/testing';
import { Effect, Fiber, Layer, Option, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { addressOn, hostOf } from './host.ts';

/** The entry `moves` (one tick's writes) commit, as `<navigation> <href>`. */
const entryOf = (moves: () => void) =>
  Effect.gen(function* () {
    const next = yield* Location.use((bar) =>
      bar.changes.pipe(
        Stream.drop(1),
        Stream.map((entry) => `${entry.navigation} ${entry.href}`),
        Stream.runHead,
        Effect.forkChild({ startImmediately: true }),
      ),
    );
    moves();
    return Option.getOrElse(yield* Fiber.join(next), () => 'none');
  });

describe('the address bar', () => {
  it.live(
    "a viewer's move is a step where its place declares one; the URL following the page never is",
    () => {
      const host = hostOf(UrlState.layer.pipe(Layer.provideMerge(layerMemory('/asks/a1'))));
      const address = addressOn(host);
      return Effect.gen(function* () {
        // A still opened full size: a cited key, a step.
        expect(yield* entryOf(() => address.go('/asks/a1?still=x'))).toBe('push /asks/a1?still=x');
        // The page following its own still: written in place.
        expect(yield* entryOf(() => address.follow('/asks/a1?still=y'))).toBe(
          'replace /asks/a1?still=y',
        );
        // Another ask: a step.
        expect(yield* entryOf(() => address.go('/asks/a2'))).toBe('push /asks/a2');
        // A follow and a move in one tick are one step, judged from the entry on screen.
        expect(
          yield* entryOf(() => {
            address.follow('/asks/a2?still=x');
            address.go('/asks/a2?still=y');
          }),
        ).toBe('push /asks/a2?still=y');
      }).pipe(Effect.provide(Layer.succeedContext(host)));
    },
  );

  it.live(
    'a dismissal goes Back over the entry its opening pushed only when Back lands where it would write',
    () => {
      const host = hostOf(
        UrlState.layer.pipe(Layer.provideMerge(layerMemory('/films/p/lab/one?view=wipe&size=2'))),
      );
      const address = addressOn(host);
      /** Open a sheet with a step (`go`): the entry it pushed, and the href of the entry it left. */
      const open = (to: string) =>
        Effect.gen(function* () {
          const before = (yield* Location.use((bar) => bar.current)).href;
          yield* entryOf(() => address.go(to));
          const { key } = yield* Location.use((bar) => bar.current);
          return Option.some({ key, before });
        });
      return Effect.gen(function* () {
        // Back lands exactly where the Close writes (its query in any order): Back.
        const first = yield* open('/films/p/lab/one?view=wipe&size=2&cue=rise');
        expect(
          yield* entryOf(() =>
            address.dismiss(first, Option.some('/films/p/lab/one?size=2&view=wipe')),
          ),
        ).toBe('traverse /films/p/lab/one?view=wipe&size=2');
        // Time moved while the sheet was open: Back would rewind it, so the entry is rewritten.
        const second = yield* open('/films/p/lab/one?cue=rise');
        yield* entryOf(() => address.follow('/films/p/lab/one?cue=rise#t=2'));
        expect(
          yield* entryOf(() => address.dismiss(second, Option.some('/films/p/lab/one#t=2'))),
        ).toBe('replace /films/p/lab/one#t=2');
        // An entry the page did not push (a link's, a reload's): rewritten, never Back.
        yield* entryOf(() => address.go('/films/p/lab/one?cue=fall#t=2'));
        expect(
          yield* entryOf(() => address.dismiss(Option.none(), Option.some('/films/p/lab/one#t=2'))),
        ).toBe('replace /films/p/lab/one#t=2');
        // The pushed entry is no longer on screen (another step since): rewritten.
        const third = yield* open('/films/p/lab/one?cue=rise#t=2');
        yield* entryOf(() => address.go('/films/p/lab/two?cue=rise#t=2'));
        expect(
          yield* entryOf(() => address.dismiss(third, Option.some('/films/p/lab/two#t=2'))),
        ).toBe('replace /films/p/lab/two#t=2');
      }).pipe(Effect.provide(Layer.succeedContext(host)));
    },
  );
});
