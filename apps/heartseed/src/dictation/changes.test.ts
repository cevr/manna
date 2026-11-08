/**
 * The views a slow screen is owed: a consumer of `changes` held up while
 * 10,000 inputs go by, half of them commands and half the source's events
 * through its listener, keeps at most the service's window of 16, never the
 * whole history, and the last view it gets after it resumes is the
 * service's current view.
 */

import { describe, expect, it } from 'bun:test';
import { Context, Deferred, Effect, Fiber, Layer, Stream } from 'effect';

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

describe('the changes of a held consumer', () => {
  it('keeps a bounded window of a 10,000-input burst and ends at the current view', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
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
          const services = yield* Layer.build(
            Layer.provide(layer, Layer.succeed(DictationSource, source)),
          );
          const dictation = Context.get(services, Dictation);
          const send = (event: DictationEvent) => {
            for (const listener of listeners) listener(event);
          };
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
