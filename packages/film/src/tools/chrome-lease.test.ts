import { describe, expect, it } from 'effect-bun-test';
import { Data, Deferred, Effect, Exit, Fiber, Scope } from 'effect';
import { leased, makeLease } from './chrome-lease.ts';

/** A process stand-in: each start a generation, whose every operation fails once it was stopped. */
class Stopped extends Data.TaggedError('Stopped')<{ readonly generation: number }> {}

interface FakeProcess {
  readonly generation: number;
  stopped: boolean;
}

const fakeLauncher = () => {
  let generation = 0;
  const stops: Array<number> = [];
  const lease = makeLease(
    Effect.sync((): FakeProcess => {
      generation += 1;
      return { generation, stopped: false };
    }),
    (held) =>
      Effect.sync(() => {
        held.stopped = true;
        stops.push(held.generation);
      }),
  );
  const use = (process: FakeProcess) =>
    Effect.suspend(() => {
      if (process.stopped) return Effect.fail(new Stopped({ generation: process.generation }));
      return Effect.succeed(process.generation);
    });
  /** A view of the fake: opened under the lease, its own release logged after it. */
  const view = (log: Array<string>, name: string, fails = false) =>
    leased(lease, (process) =>
      Effect.acquireRelease(
        Effect.suspend(() => {
          if (fails) return Effect.fail(new Stopped({ generation: -1 }));
          return Effect.succeed(process);
        }),
        () => Effect.sync(() => log.push(`${name} closed stopped=${process.stopped}`)),
      ),
    );
  /** A view of the fake whose opening waits on `gate` (interruptible) before it opens. */
  const slowView = (log: Array<string>, name: string, gate: Deferred.Deferred<boolean>) =>
    leased(lease, (process) =>
      Effect.andThen(
        Deferred.await(gate),
        Effect.acquireRelease(
          Effect.suspend(() => Effect.succeed(process)),
          () => Effect.sync(() => log.push(`${name} closed`)),
        ),
      ),
    );
  return { lease, use, view, slowView, stops };
};

describe('the Chrome lease', () => {
  it.effect(
    'an opening that fails or is interrupted gives its lease back at once, while the caller scope stays open',
    () =>
      Effect.gen(function* () {
        const fake = fakeLauncher();
        const log: Array<string> = [];
        const caller = yield* Scope.make();
        const live = yield* Scope.provide(caller)(fake.view(log, 'live'));
        expect(yield* fake.lease.holders).toBe(1);
        const refused = yield* Effect.exit(Scope.provide(caller)(fake.view(log, 'refused', true)));
        expect(Exit.isFailure(refused)).toBe(true);
        expect(yield* fake.lease.holders).toBe(1);
        const gate = yield* Deferred.make<boolean>();
        const fiber = yield* Effect.forkChild(
          Scope.provide(caller)(fake.slowView(log, 'waiting', gate)),
        );
        yield* Effect.yieldNow;
        expect(yield* fake.lease.holders).toBe(2);
        yield* Fiber.interrupt(fiber);
        expect(yield* fake.lease.holders).toBe(1);
        expect(yield* fake.use(live)).toBe(1);
        expect([log, fake.stops]).toEqual([[], []]);
        yield* Scope.close(caller, Exit.void);
        expect([log, fake.stops]).toEqual([['live closed stopped=false'], [1]]);
        expect(yield* fake.lease.holders).toBe(0);
      }),
  );

  it.effect('a view still open keeps its process when another scope that held it closes', () =>
    Effect.gen(function* () {
      const fake = fakeLauncher();
      const log: Array<string> = [];
      const a = yield* Scope.make();
      const b = yield* Scope.make();
      const first = yield* Scope.provide(a)(fake.view(log, 'a'));
      const kept = yield* Scope.provide(b)(fake.lease.hold);
      const second = yield* Scope.provide(b)(fake.view(log, 'b'));
      expect(second).toBe(first);
      yield* Scope.close(b, Exit.void);
      expect(yield* fake.use(first)).toBe(1);
      expect(kept.stopped).toBe(false);
      yield* Scope.close(a, Exit.void);
      expect(log).toEqual(['b closed stopped=false', 'a closed stopped=false']);
      expect(fake.stops).toEqual([1]);
      expect(Exit.isFailure(yield* Effect.exit(fake.use(first)))).toBe(true);
      expect(yield* fake.lease.holders).toBe(0);
    }),
  );

  it.effect(
    'a holder that fails or is interrupted gives its lease back, and the others keep working',
    () =>
      Effect.gen(function* () {
        const fake = fakeLauncher();
        const log: Array<string> = [];
        const live = yield* Scope.make();
        const process = yield* Scope.provide(live)(fake.view(log, 'live'));
        const failed = yield* Effect.exit(
          Effect.scoped(Effect.andThen(fake.view(log, 'failing'), Effect.fail('boom'))),
        );
        expect(Exit.isFailure(failed)).toBe(true);
        const opened = yield* Deferred.make<boolean>();
        const fiber = yield* Effect.forkChild(
          Effect.scoped(
            Effect.andThen(
              fake.view(log, 'interrupted'),
              Effect.andThen(Deferred.succeed(opened, true), Effect.never),
            ),
          ),
        );
        yield* Deferred.await(opened);
        yield* Fiber.interrupt(fiber);
        const refused = yield* Effect.exit(Effect.scoped(fake.view(log, 'refused', true)));
        expect(Exit.isFailure(refused)).toBe(true);
        expect(yield* fake.lease.holders).toBe(1);
        expect(yield* fake.use(process)).toBe(1);
        expect(fake.stops).toEqual([]);
        yield* Scope.close(live, Exit.void);
        expect(log).toEqual([
          'failing closed stopped=false',
          'interrupted closed stopped=false',
          'live closed stopped=false',
        ]);
        expect(fake.stops).toEqual([1]);
      }),
  );

  it.effect(
    'a hold right after the last release starts a new generation, and the old stays stopped',
    () =>
      Effect.gen(function* () {
        const fake = fakeLauncher();
        const log: Array<string> = [];
        const old = yield* Effect.scoped(fake.view(log, 'old'));
        const fresh = yield* Scope.make();
        const now = yield* Scope.provide(fresh)(fake.view(log, 'new'));
        expect([old.generation, now.generation]).toEqual([1, 2]);
        expect(Exit.isFailure(yield* Effect.exit(fake.use(old)))).toBe(true);
        expect(yield* fake.use(now)).toBe(2);
        yield* Scope.close(fresh, Exit.void);
        expect(fake.stops).toEqual([1, 2]);
      }),
  );

  it.effect(
    'views opened at once share one process, which stops once the last of them closes',
    () =>
      Effect.gen(function* () {
        const fake = fakeLauncher();
        const log: Array<string> = [];
        const scopes = yield* Effect.forEach([0, 1, 2, 3], () => Scope.make());
        const opened = yield* Effect.forEach(
          scopes,
          (scope, i) => Scope.provide(scope)(fake.view(log, `v${i}`)),
          {
            concurrency: 4,
          },
        );
        expect(new Set(opened.map((p) => p.generation))).toEqual(new Set([1]));
        for (const scope of scopes.slice(0, 3)) yield* Scope.close(scope, Exit.void);
        expect(yield* fake.use(opened[0] ?? { generation: 0, stopped: true })).toBe(1);
        yield* Scope.close(scopes[3] ?? (yield* Scope.make()), Exit.void);
        expect(fake.stops).toEqual([1]);
      }),
  );
});
