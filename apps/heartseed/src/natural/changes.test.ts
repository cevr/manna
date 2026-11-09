/**
 * The natural voice's views against a download event that lands inside a
 * command. The module's download events run the service's step in their
 * native listener, at once; a command's fiber that yields to the scheduler
 * at any of its yield points while such an event lands never leaves
 * `changes` behind the view: a fresh subscriber's replayed view is the
 * current one.
 */

import { describe, expect, it } from 'bun:test';
import { Context, Effect, Fiber, Layer, Logger, Option, Scheduler, Stream } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { yieldingAt } from '../test/yielding';
import { NaturalModule, NaturalUnavailable, type InstallEvent } from './module';
import { layer, Natural } from './service';

/** A module with no files and no crash, whose install starts and whose download events the trial sends. */
const moduleOf = (listeners: Set<(event: InstallEvent) => void>) =>
  NaturalModule.of({
    status: (revision) =>
      Effect.succeed({
        revision,
        files: 0,
        bytes: 0,
        excluded: true,
        crashed: false,
        loaded: false,
        installing: false,
        footprint: 0,
        peak: 0,
      }),
    install: () => Effect.void,
    cancelInstall: Effect.void,
    remove: Effect.void,
    load: () => Effect.fail(NaturalUnavailable.make({ reason: 'test' })),
    prosody: () => Effect.fail(NaturalUnavailable.make({ reason: 'test' })),
    render: () => Effect.fail(NaturalUnavailable.make({ reason: 'test' })),
    play: () => Effect.void,
    pause: Effect.void,
    resume: Effect.void,
    stop: Effect.void,
    subscribe: () => Effect.void,
    subscribeInstall: (listener) =>
      Effect.acquireRelease(
        Effect.sync(() => void listeners.add(listener)),
        () => Effect.sync(() => void listeners.delete(listener)),
      ),
  });

/** One trial: the launch's begin with Her, on its own fiber, that yields at its `at`-th check while the download's progress lands. */
const trial = (at: number) =>
  Effect.scoped(
    Effect.gen(function* () {
      const listeners = new Set<(event: InstallEvent) => void>();
      const services = yield* Layer.build(
        Layer.provide(
          layer(false),
          Layer.mergeAll(
            Layer.succeed(NaturalModule, moduleOf(listeners)),
            KeyValueStore.layerMemory,
          ),
        ),
      );
      const natural = Context.get(services, Natural);
      const { counted, scheduler } = yieldingAt(at, () => {
        for (const listener of listeners)
          listener({ kind: 'progress', bytes: 1_000_000, total: 83_332_513, reason: '' });
      });
      yield* Fiber.join(
        yield* Effect.forkChild(
          Effect.provideService(natural.begin('her'), Scheduler.Scheduler, scheduler),
        ),
      );
      const current = yield* natural.view;
      const replayed = yield* Stream.runHead(natural.changes);
      return { at, checks: counted.checks, delivered: counted.delivered, current, replayed };
    }),
  );

describe('a download event inside a command', () => {
  it('leaves the replayed view equal to the current view at every yield point of the launch’s begin', () =>
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
      }).pipe(Effect.provide(Logger.layer([]))),
    ));
});
