/**
 * The views a slow screen is owed. A consumer of `changes` held up while
 * 10,000 inputs go by, half of them commands and half the source's events
 * through its listener, keeps at most the service's window of 16, never the
 * whole history, and the last view it gets after it resumes is the
 * service's current view. And a native event that lands while a command's
 * fiber yields, at any of its yield points, never leaves `changes` behind
 * the view: a fresh subscriber's replayed view is the current one.
 */

import { describe, expect, it } from 'bun:test';
import { Context, Deferred, Effect, Fiber, Layer, Option, Scheduler, Stream } from 'effect';

import {
  Dictation,
  DictationSource,
  layer,
  type DictationEvent,
  type DictationView,
} from '../dictation';

const BURST = 10_000;

const WINDOW = 16;

const VERSE = 'seed and leaf and root';

const LAST = 'the last recital';

/** A source whose events the test sends through the service's own listener. */
const listened = () => {
  const listeners = new Set<(event: DictationEvent) => void>();
  const source = DictationSource.of({
    engines: () => Effect.succeed([]),
    listen: () => Effect.void,
    finish: Effect.void,
    cancel: Effect.void,
    subscribe: (listener) =>
      Effect.acquireRelease(
        Effect.sync(() => void listeners.add(listener)),
        () => Effect.sync(() => void listeners.delete(listener)),
      ),
  });
  const send = (event: DictationEvent) => {
    for (const listener of listeners) listener(event);
  };
  return { source, send };
};

/**
 * A scheduler that yields a fiber at its `at`-th yield check alone. The
 * task that resumes the fiber after that yield first calls `deliver`, as a
 * native event lands while the fiber waits. `counted` holds the checks so
 * far and whether the event landed.
 */
const yieldingAt = (at: number, deliver: () => void) => {
  const base = new Scheduler.MixedScheduler();
  const counted = { checks: 0, delivered: false, pending: false };
  const scheduler: Scheduler.Scheduler = {
    executionMode: 'async',
    shouldYield: () => {
      counted.checks++;
      counted.pending = counted.checks === at;
      return counted.pending;
    },
    makeDispatcher: () => {
      const dispatcher = base.makeDispatcher();
      return {
        scheduleTask: (task, priority) => {
          if (!counted.pending) return dispatcher.scheduleTask(task, priority);
          counted.pending = false;
          dispatcher.scheduleTask(() => {
            counted.delivered = true;
            deliver();
            task();
          }, priority);
        },
        flush: () => dispatcher.flush(),
      };
    },
  };
  return { counted, scheduler };
};

/** One trial: a start, on its own fiber, that yields at its `at`-th check while the native end of its session lands. */
const trial = (at: number) =>
  Effect.scoped(
    Effect.gen(function* () {
      const { source, send } = listened();
      const services = yield* Layer.build(
        Layer.provide(layer, Layer.succeed(DictationSource, source)),
      );
      const dictation = Context.get(services, Dictation);
      const { counted, scheduler } = yieldingAt(at, () =>
        send({ session: 1, kind: 'end', final: true, runs: [], reason: '' }),
      );
      yield* Fiber.join(
        yield* Effect.forkChild(
          Effect.provideService(dictation.start(VERSE), Scheduler.Scheduler, scheduler),
        ),
      );
      const current = yield* dictation.view;
      const replayed = yield* Stream.runHead(dictation.changes);
      return { at, checks: counted.checks, delivered: counted.delivered, current, replayed };
    }),
  );

describe('the changes of a held consumer', () => {
  it('keeps a bounded window of a 10,000-input burst and ends at the current view', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { source, send } = listened();
          const services = yield* Layer.build(
            Layer.provide(layer, Layer.succeed(DictationSource, source)),
          );
          const dictation = Context.get(services, Dictation);
          const entered = yield* Deferred.make<boolean>();
          const resume = yield* Deferred.make<boolean>();
          const seen: DictationView[] = [];
          const consumer = yield* Effect.forkChild(
            Stream.runForEach(
              Stream.takeUntil(
                dictation.changes,
                (view) => view.verse === LAST && view.status === 'listening',
              ),
              (view) =>
                Effect.gen(function* () {
                  seen.push(view);
                  if (seen.length > 1) return;
                  yield* Deferred.succeed(entered, true);
                  yield* Deferred.await(resume);
                }),
            ),
          );
          yield* Deferred.await(entered);
          for (let session = 1; session <= BURST / 2; session++) {
            yield* dictation.start(VERSE);
            send({ session, kind: 'end', final: true, runs: [], reason: '' });
          }
          yield* dictation.start(LAST);
          const latest = yield* dictation.view;
          expect({ held: seen.length, status: latest.status }).toEqual({
            held: 1,
            status: 'listening',
          });
          yield* Deferred.succeed(resume, true);
          yield* Fiber.join(consumer).pipe(Effect.timeout('1 second'));
          expect(seen.length - 1).toBeLessThanOrEqual(WINDOW);
          expect(seen.at(-1)).toEqual(latest);
        }),
      ),
    ));
});

describe('a native event inside a command', () => {
  it('leaves the replayed view equal to the current view at every yield point of a start', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const whole = yield* trial(Number.POSITIVE_INFINITY);
        expect(whole.checks).toBeGreaterThan(0);
        const trials = yield* Effect.forEach(
          Array.from({ length: whole.checks }, (_, index) => index + 1),
          trial,
        );
        expect(trials.map(({ at, delivered, replayed }) => ({ at, delivered, replayed }))).toEqual(
          trials.map(({ at, current }) => ({
            at,
            delivered: true,
            replayed: Option.some(current),
          })),
        );
      }),
    ));
});
