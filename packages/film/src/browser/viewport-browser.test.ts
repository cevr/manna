import { expect, it } from 'effect-bun-test';
import { Duration, Effect, Option, Stream } from 'effect';
import { Viewport } from './viewport.ts';
import { viewportLayer } from './viewport-browser.ts';

const fakeWindow = (matches: boolean) => {
  const list = Object.assign(new EventTarget(), { matches, media: '' });
  const set = (to: boolean) => {
    list.matches = to;
    list.dispatchEvent(new Event('change'));
  };
  return { list, set };
};

const withWindow = <A, E, R>(list: EventTarget, effect: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const had = Reflect.get(globalThis, 'matchMedia');
      Reflect.set(globalThis, 'matchMedia', () => list);
      return had;
    }),
    () => effect,
    (had) =>
      Effect.sync(() =>
        Option.match(Option.fromNullishOr(had), {
          onNone: () => Reflect.deleteProperty(globalThis, 'matchMedia'),
          onSome: (own) => Reflect.set(globalThis, 'matchMedia', own),
        }),
      ),
  );

it.live(
  'a window that crossed the breakpoint before the page followed it: the follow starts at the crossing',
  () =>
    Effect.gen(function* () {
      const { list, set } = fakeWindow(false);
      const answers = yield* withWindow(
        list,
        Effect.gen(function* () {
          const viewport = yield* Viewport;
          const read = yield* viewport.matches('(max-width: 899px)');
          set(true);
          const first = yield* viewport
            .changes('(max-width: 899px)')
            .pipe(Stream.take(1), Stream.runCollect, Effect.timeoutOption(Duration.millis(200)));
          return { read, first: Option.getOrNull(first) };
        }),
      );
      expect(answers).toEqual({ read: false, first: [true] });
    }).pipe(Effect.provide(viewportLayer)),
);

it.live('follows each change after the answer it started with', () =>
  Effect.gen(function* () {
    const { list, set } = fakeWindow(true);
    const seen = yield* withWindow(
      list,
      Effect.gen(function* () {
        const viewport = yield* Viewport;
        let said = 0;
        const turnsOnce = Effect.sync(() => {
          said += 1;
          if (said === 1) {
            set(false);
            set(true);
          }
        });
        const seen = yield* viewport.changes('(max-width: 899px)').pipe(
          Stream.tap(() => turnsOnce),
          Stream.take(3),
          Stream.runCollect,
          Effect.timeoutOption(Duration.millis(200)),
        );
        return Option.getOrNull(seen);
      }),
    );
    expect(seen).toEqual([true, false, true]);
  }).pipe(Effect.provide(viewportLayer)),
);
