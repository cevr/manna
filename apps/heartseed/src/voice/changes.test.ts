/**
 * The views a slow screen is owed. A consumer of `changes` held up while
 * thousands of views go by keeps at most the service's window of 16, never the
 * whole history, and the last view it gets after it resumes is the
 * service's current view. And a native event that lands while a command's
 * fiber yields, at any of its yield points, never leaves `changes` behind
 * the view: a fresh subscriber's replayed view is the current one.
 */

import { describe, expect, it } from 'bun:test';
import { Context, Deferred, Effect, Fiber, Layer, Option, Scheduler, Stream } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { CHOICES, layer, Voice, VoiceSource, type VoiceEvent, type VoiceView } from '../voice';

const BURST = 10_000;

const WINDOW = 16;

const TEXT = 'seed and leaf';

const quiet = VoiceSource.of({
  voices: Effect.succeed([]),
  speak: () => Effect.void,
  pause: Effect.void,
  resume: Effect.void,
  stop: Effect.void,
  subscribe: () => Effect.void,
});

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

/** One trial: a read, on its own fiber, that yields at its `at`-th check while the native finish of its utterance lands. */
const trial = (at: number) =>
  Effect.scoped(
    Effect.gen(function* () {
      const listeners = new Set<(event: VoiceEvent) => void>();
      const source = VoiceSource.of({
        ...quiet,
        subscribe: (listener) =>
          Effect.acquireRelease(
            Effect.sync(() => void listeners.add(listener)),
            () => Effect.sync(() => void listeners.delete(listener)),
          ),
      });
      const services = yield* Layer.build(
        Layer.provide(
          layer,
          Layer.mergeAll(Layer.succeed(VoiceSource, source), KeyValueStore.layerMemory),
        ),
      );
      const voice = Context.get(services, Voice);
      yield* voice.choose('him');
      const { counted, scheduler } = yieldingAt(at, () => {
        for (const listener of listeners)
          listener({ utterance: 1, kind: 'finish', location: 0, length: 0 });
      });
      yield* Fiber.join(
        yield* Effect.forkChild(
          Effect.provideService(voice.read(TEXT), Scheduler.Scheduler, scheduler),
        ),
      );
      const current = yield* voice.view;
      const replayed = yield* Stream.runHead(voice.changes);
      return { at, checks: counted.checks, delivered: counted.delivered, current, replayed };
    }),
  );

describe('the changes of a held consumer', () => {
  it('keeps a bounded window of a 10,000-view burst and ends at the current view', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const services = yield* Layer.build(
            Layer.provide(
              layer,
              Layer.mergeAll(Layer.succeed(VoiceSource, quiet), KeyValueStore.layerMemory),
            ),
          );
          const voice = Context.get(services, Voice);
          const entered = yield* Deferred.make<boolean>();
          const resume = yield* Deferred.make<boolean>();
          const seen: VoiceView[] = [];
          const consumer = yield* Effect.forkChild(
            Stream.runForEach(
              Stream.takeUntil(voice.changes, (view) => view.status === 'reading'),
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
          for (let index = 0; index < BURST; index++)
            yield* voice.choose(CHOICES[index % CHOICES.length] ?? 'off');
          yield* voice.choose('him');
          yield* voice.read('Jesus wept.');
          const latest = yield* voice.view;
          expect(seen).toHaveLength(1);
          yield* Deferred.succeed(resume, true);
          yield* Fiber.join(consumer);
          expect(seen.length - 1).toBeLessThanOrEqual(WINDOW);
          expect(seen.at(-1)).toEqual(latest);
        }),
      ),
    ));
});

describe('a native event inside a command', () => {
  it('leaves the replayed view equal to the current view at every yield point of a read', () =>
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
