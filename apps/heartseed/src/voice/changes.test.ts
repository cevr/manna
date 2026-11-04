/**
 * The views a slow screen is owed: a consumer of `changes` held up while
 * thousands of views go by keeps at most the service's window of 16, never the
 * whole history, and the last view it gets after it resumes is the
 * service's current view.
 */

import { describe, expect, it } from 'bun:test';
import { Context, Deferred, Effect, Fiber, Layer, Stream } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { layer, Voice, VoiceSource, type VoiceView } from '../voice';

const BURST = 10_000;

const WINDOW = 16;

const quiet = VoiceSource.of({
  voices: Effect.succeed([]),
  speak: () => Effect.void,
  pause: Effect.void,
  resume: Effect.void,
  stop: Effect.void,
  subscribe: () => Effect.void,
});

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
          for (let index = 0; index < BURST; index++) yield* voice.setEnabled(index % 2 === 0);
          yield* voice.setEnabled(true);
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
