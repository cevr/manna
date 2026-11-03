import { Location, UrlState } from '@manna/url-state';
import { layerMemory } from '@manna/url-state/testing';
import { Effect, Fiber, Layer, Option, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { addressOn, hostOf } from './host.ts';

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
        expect(yield* entryOf(() => address.go('/asks/a1?still=x'))).toBe('push /asks/a1?still=x');
        expect(yield* entryOf(() => address.follow('/asks/a1?still=y'))).toBe(
          'replace /asks/a1?still=y',
        );
        expect(yield* entryOf(() => address.go('/asks/a2'))).toBe('push /asks/a2');
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
      const open = (to: string) =>
        Effect.gen(function* () {
          const before = (yield* Location.use((bar) => bar.current)).href;
          yield* entryOf(() => address.go(to));
          const { key } = yield* Location.use((bar) => bar.current);
          return Option.some({ key, before });
        });
      return Effect.gen(function* () {
        const first = yield* open('/films/p/lab/one?view=wipe&size=2&cue=rise');
        expect(
          yield* entryOf(() =>
            address.dismiss(first, Option.some('/films/p/lab/one?size=2&view=wipe')),
          ),
        ).toBe('traverse /films/p/lab/one?view=wipe&size=2');
        const second = yield* open('/films/p/lab/one?cue=rise');
        yield* entryOf(() => address.follow('/films/p/lab/one?cue=rise#t=2'));
        expect(
          yield* entryOf(() => address.dismiss(second, Option.some('/films/p/lab/one#t=2'))),
        ).toBe('replace /films/p/lab/one#t=2');
        yield* entryOf(() => address.go('/films/p/lab/one?cue=fall#t=2'));
        expect(
          yield* entryOf(() => address.dismiss(Option.none(), Option.some('/films/p/lab/one#t=2'))),
        ).toBe('replace /films/p/lab/one#t=2');
        const third = yield* open('/films/p/lab/one?cue=rise#t=2');
        yield* entryOf(() => address.go('/films/p/lab/two?cue=rise#t=2'));
        expect(
          yield* entryOf(() => address.dismiss(third, Option.some('/films/p/lab/two#t=2'))),
        ).toBe('replace /films/p/lab/two#t=2');
      }).pipe(Effect.provide(Layer.succeedContext(host)));
    },
  );
});
