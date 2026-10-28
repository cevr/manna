/* oxlint-disable effect/noInlineProvide -- restart programs deliberately close and rebuild their real layer over the same synthetic disk. */
import { Deferred, Effect, Fiber, Option, References, Stream } from 'effect';
import { expect, it } from 'effect-bun-test';
import { TestClock } from 'effect/testing';
import { Offline, identityKey } from './cache';
import { fake } from './fixture';

const idle = (cache: typeof Offline.Service) =>
  cache.changes.pipe(
    Stream.filter((s) => !s.indexing && s.active + s.queued === 0),
    Stream.take(1),
    Stream.runDrain,
  );

it.effect('offline a save requested during discovery joins the retained file', () => {
  const f = fake(),
    id = { number: 100, offset: 0 };
  return Effect.gen(function* () {
    yield* Effect.gen(function* () {
      const cache = yield* Offline;
      yield* cache.enqueue(id);
      yield* idle(cache);
    }).pipe(Effect.provide(f.layer));
    f.calls.length = 0;
    const entered = yield* Deferred.make<boolean>(),
      release = yield* Deferred.make<boolean>();
    f.control.listing = Deferred.succeed(entered, true).pipe(
      Effect.andThen(Deferred.await(release)),
      Effect.asVoid,
    );
    yield* Effect.gen(function* () {
      const cache = yield* Offline;
      yield* Deferred.await(entered);
      const pending = yield* cache.enqueue(id).pipe(Effect.forkChild);
      yield* TestClock.adjust(0);
      expect(f.calls.length).toBe(0);
      expect(Option.isNone(yield* cache.local(id))).toBe(true);
      yield* Deferred.succeed(release, true);
      yield* Fiber.join(pending);
      yield* idle(cache);
      expect(f.calls.length).toBe(0);
      expect(Option.isSome(yield* cache.local(id))).toBe(true);
      expect((yield* cache.snapshot).saved).toBe(1);
    }).pipe(Effect.provide(f.layer));
  });
});

it.effect('offline Cancel retires save intentions waiting for discovery', () => {
  const f = fake();
  return Effect.gen(function* () {
    const entered = yield* Deferred.make<boolean>(),
      release = yield* Deferred.make<boolean>();
    f.control.listing = Deferred.succeed(entered, true).pipe(
      Effect.andThen(Deferred.await(release)),
      Effect.asVoid,
    );
    const program = Effect.gen(function* () {
      const cache = yield* Offline;
      yield* Deferred.await(entered);
      const single = yield* cache.enqueue({ number: 100, offset: 0 }).pipe(Effect.forkChild);
      const all = yield* cache.downloadAll.pipe(Effect.forkChild);
      yield* cache.shown(100);
      yield* TestClock.adjust(750);
      yield* cache.cancel;
      yield* Deferred.succeed(release, true);
      yield* Fiber.join(single);
      yield* Fiber.join(all);
      yield* idle(cache);
      expect(f.calls.length).toBe(0);
    });
    yield* program.pipe(Effect.provide(f.layer));
  });
});

it.effect('offline quick page turns and Cancel retire pending open saves', () => {
  const f = fake();
  return Effect.gen(function* () {
    const cache = yield* Offline;
    yield* cache.shown(100);
    yield* cache.shown(3);
    yield* TestClock.adjust(750);
    yield* idle(cache);
    expect(f.calls.map((c) => c.id.number)).toEqual([3]);
    yield* cache.shown(100);
    yield* cache.cancel;
    yield* TestClock.adjust(750);
    yield* idle(cache);
    expect(f.calls.map((c) => c.id.number)).toEqual([3]);
  }).pipe(Effect.provide(f.layer));
});

for (const offset of [-5, 0, 6])
  for (const removalAt of [8, 16])
    it.effect(
      `offline removal during range restarts the whole file offset=${offset} at=${removalAt}`,
      () => {
        const f = fake();
        f.control.chunk = 8;
        f.control.total = 24;
        const id = { number: 100, offset };
        return Effect.gen(function* () {
          const entered = yield* Deferred.make<boolean>(),
            release = yield* Deferred.make<boolean>();
          let held = false;
          f.control.before = (_id, at) => {
            if (at !== removalAt || held) return Effect.void;
            held = true;
            return Deferred.succeed(entered, true).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.asVoid,
            );
          };
          const cache = yield* Offline;
          yield* cache.enqueue(id);
          yield* Deferred.await(entered);
          yield* cache.invalidate(id);
          yield* Deferred.succeed(release, true);
          yield* idle(cache);
          expect((yield* cache.snapshot).saved).toBe(1);
          expect((yield* cache.snapshot).failed).toBe(0);
          expect(Array.from(f.files.get(identityKey(id))?.slice(0, 2) ?? [])).toEqual([255, 251]);
          expect(f.calls.filter((c) => c.at === 0).length).toBe(2);
          expect(Option.isSome(yield* cache.local(id))).toBe(true);
        }).pipe(Effect.provide(f.layer));
      },
    );

it.effect('offline full storage halts the bulk after at most two ranges', () => {
  const f = fake();
  f.control.writeFails = true;
  return Effect.gen(function* () {
    const cache = yield* Offline;
    yield* cache.downloadAll;
    yield* idle(cache);
    expect(f.calls.length).toBeLessThanOrEqual(2);
    expect((yield* cache.snapshot).storage).toBe(true);
    expect((yield* cache.snapshot).paused).toBe(true);
    f.control.writeFails = false;
    yield* cache.downloadAll;
    yield* idle(cache);
    expect((yield* cache.snapshot).printed).toBe(695);
    expect((yield* cache.snapshot).storage).toBe(false);
  }).pipe(Effect.provide(f.layer), Effect.provideService(References.MinimumLogLevel, 'None'));
});

it.effect('offline Cancel stays paused after Open and All retries failed changed keys', () => {
  const f = fake();
  return Effect.gen(function* () {
    const cache = yield* Offline;
    yield* cache.cancel;
    yield* cache.enqueue({ number: 3, offset: 0 });
    yield* idle(cache);
    expect((yield* cache.snapshot).paused).toBe(true);
    f.control.networkFails = true;
    yield* cache.enqueue({ number: 100, offset: 2 });
    yield* idle(cache);
    expect((yield* cache.snapshot).failed).toBe(1);
    f.control.networkFails = false;
    yield* cache.downloadAll;
    yield* idle(cache);
    expect((yield* cache.snapshot).failed).toBe(0);
    expect((yield* cache.snapshot).paused).toBe(false);
    expect((yield* cache.snapshot).saved).toBe(696);
  }).pipe(Effect.provide(f.layer), Effect.provideService(References.MinimumLogLevel, 'None'));
});

it.effect('offline a defect in one job leaves both workers available', () => {
  const f = fake();
  f.control.before = (id) => {
    if (id.number < 3) return Effect.die('synthetic defect');
    return Effect.void;
  };
  return Effect.gen(function* () {
    const cache = yield* Offline;
    yield* cache.enqueue({ number: 1, offset: 0 });
    yield* cache.enqueue({ number: 2, offset: 0 });
    yield* idle(cache);
    yield* cache.enqueue({ number: 3, offset: 0 });
    yield* idle(cache);
    expect((yield* cache.snapshot).saved).toBe(1);
    expect((yield* cache.snapshot).failed).toBe(2);
  }).pipe(Effect.provide(f.layer), Effect.provideService(References.MinimumLogLevel, 'None'));
});
