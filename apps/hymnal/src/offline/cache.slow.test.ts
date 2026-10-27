/* oxlint-disable effect/noInlineProvide -- each inner program is a test runtime boundary; restart cases deliberately close and rebuild the layer over the same synthetic disk. */
import { Deferred, Effect, Fiber, Option, References, Stream } from 'effect';
import { expect, it } from 'effect-bun-test';
import { Offline, identityKey } from './cache';
import { fake } from './fixture';

const idle = (cache: typeof Offline.Service) =>
  cache.changes.pipe(
    Stream.filter((s) => s.active + s.queued === 0),
    Stream.take(1),
    Stream.runDrain,
  );

for (let offset = -5; offset <= 6; offset++)
  it.effect(`offline restart keeps all 695 saved identities offset=${offset}`, () =>
    Effect.gen(function* () {
      const f = fake();
      yield* Effect.gen(function* () {
        const cache = yield* Offline;
        for (let number = 1; number <= 695; number++) yield* cache.enqueue({ number, offset });
        yield* idle(cache);
        expect((yield* cache.snapshot).saved).toBe(695);
      }).pipe(Effect.provide(f.layer));
      f.calls.length = 0;
      f.control.networkFails = true;
      yield* Effect.gen(function* () {
        const cache = yield* Offline;
        const faults: number[] = [];
        for (let number = 1; number <= 695; number++) {
          const id = { number, offset };
          if (Option.isNone(yield* cache.local(id))) faults.push(number);
          yield* cache.enqueue(id);
        }
        yield* idle(cache);
        expect(faults.slice(0, 10)).toEqual([]);
        expect(f.calls.length).toBe(0);
        expect((yield* cache.snapshot).bytes).toBe(8340);
        yield* cache.deleteAll;
        expect(f.files.size).toBe(0);
      }).pipe(Effect.provide(f.layer));
    }),
  );

for (let offset = -5; offset <= 6; offset++)
  it.effect(`offline identity phases and joins for all 695 hymns offset=${offset}`, () =>
    Effect.gen(function* () {
      const f = fake();
      f.control.total = 16;
      f.control.chunk = 8;
      const faults: number[][] = [];
      const check = (number: number, phase: number, ok: boolean) => {
        if (!ok) faults.push([number, phase]);
      };
      yield* Effect.gen(function* () {
        const cache = yield* Offline;
        for (let number = 1; number <= 695; number++) {
          const id = { number, offset };
          check(number, 1, Option.isNone(yield* cache.local(id)));
          yield* cache.enqueue(id);
          yield* cache.enqueue(id);
          yield* idle(cache);
          check(number, 2, f.calls.filter((c) => c.id.number === number).length === 2);
          check(
            number,
            3,
            Option.getOrUndefined(yield* cache.local(id)) ===
              `file:///synthetic/${identityKey(id)}`,
          );
          f.control.readFails = true;
          check(number, 4, Option.isNone(yield* cache.local(id)));
          f.control.readFails = false;
          f.control.networkFails = true;
          yield* cache.enqueue(id);
          yield* idle(cache);
          check(number, 5, Option.isNone(yield* cache.local(id)));
          f.control.networkFails = false;
          f.control.writeFails = true;
          yield* cache.enqueue(id);
          yield* idle(cache);
          check(number, 6, Option.isNone(yield* cache.local(id)));
          f.control.writeFails = false;
          f.control.networkFailsAt = 8;
          yield* cache.enqueue(id);
          yield* idle(cache);
          check(
            number,
            8,
            Option.isNone(yield* cache.local(id)) && (yield* cache.snapshot).partialBytes === 8,
          );
          yield* cache.cancel;
          check(number, 9, (yield* cache.snapshot).paused);
          f.control.networkFailsAt = -1;
          yield* cache.enqueue(id);
          yield* idle(cache);
          check(number, 10, f.calls.at(-1)?.at === 8);
          yield* cache.invalidate(id);
          check(number, 7, Option.isNone(yield* cache.local(id)));
        }
        expect((yield* cache.snapshot).saved).toBe(0);
      }).pipe(Effect.provide(f.layer), Effect.provideService(References.MinimumLogLevel, 'None'));
      expect(f.calls.length).toBe(695 * 7);
      expect(f.control.maxActive).toBeLessThanOrEqual(2);
      expect(faults.slice(0, 10)).toEqual([]);
    }),
  );

it.effect('offline queue bounds concurrent writers, cancel and delete reject late completion', () =>
  Effect.gen(function* () {
    const f = fake();
    const entered = yield* Deferred.make<boolean>();
    const release = yield* Deferred.make<boolean>();
    f.control.before = () =>
      Effect.gen(function* () {
        if (f.control.active === 2) yield* Deferred.succeed(entered, true);
        yield* Deferred.await(release);
      });
    yield* Effect.gen(function* () {
      const cache = yield* Offline;
      yield* cache.downloadAll;
      yield* Deferred.await(entered);
      expect((yield* cache.snapshot).active).toBe(2);
      expect(f.calls.length).toBe(2);
      yield* cache.cancel;
      yield* cache.deleteAll;
      yield* Deferred.succeed(release, true);
      yield* idle(cache);
      expect((yield* cache.snapshot).bytes).toBe(0);
      expect((yield* cache.snapshot).saved).toBe(0);
      expect(f.entries.size).toBe(0);
      f.control.before = () => Effect.void;
      yield* cache.downloadAll;
      yield* idle(cache);
      expect((yield* cache.snapshot).printed).toBe(695);
      expect(f.calls.every((c) => c.id.offset === 0)).toBe(true);
      expect(f.control.maxActive).toBe(2);
      expect((yield* cache.snapshot).bytes).toBe(695 * 12);
      yield* cache.deleteAll;
      expect(f.files.size).toBe(0);
    }).pipe(Effect.provide(f.layer));
  }),
);

it.effect('offline interruption resumes only a matching validator and exact durable offset', () =>
  Effect.gen(function* () {
    const f = fake();
    f.control.chunk = 8;
    f.control.total = 16;
    const interrupted = yield* Deferred.make<boolean>();
    const hold = yield* Deferred.make<boolean>();
    const id = { number: 100, offset: -5 };
    f.control.before = (_id, at) => {
      if (at === 8)
        return Deferred.succeed(interrupted, true).pipe(
          Effect.andThen(Deferred.await(hold)),
          Effect.asVoid,
        );
      return Effect.void;
    };
    yield* Effect.gen(function* () {
      const cache = yield* Offline;
      yield* cache.enqueue(id);
      yield* Deferred.await(interrupted);
      expect(Option.isNone(yield* cache.local(id))).toBe(true);
      yield* cache.cancel;
    }).pipe(Effect.provide(f.layer));
    expect(f.entries.get(identityKey(id))?.bytes).toBe(8);
    f.control.before = () => Effect.void;
    yield* Effect.gen(function* () {
      const cache = yield* Offline;
      expect((yield* cache.snapshot).failed).toBe(1);
      yield* cache.enqueue(id);
      yield* idle(cache);
      expect((yield* cache.snapshot).saved).toBe(1);
      expect((yield* cache.snapshot).bytes).toBe(16);
    }).pipe(Effect.provide(f.layer));
    expect(f.calls.at(-1)?.at).toBe(8);
    expect(Option.getOrUndefined(f.calls.at(-1)?.etag ?? Option.none())).toBe('"v1"');
  }),
);

it.effect('offline changed validators and torn writes restart instead of mixing versions', () =>
  Effect.gen(function* () {
    for (const mode of ['validator', 'torn', 'metadata'] as const) {
      const f = fake();
      f.control.chunk = 8;
      f.control.total = 16;
      const id = { number: 100, offset: 2 };
      f.entries.set(identityKey(id), {
        ...id,
        bytes: 8,
        total: 16,
        etag: '"old"',
        complete: false,
      });
      let size = 8;
      if (mode === 'torn') size = 9;
      f.files.set(identityKey(id), new Uint8Array(size));
      if (mode === 'metadata') f.control.saveFails = true;
      yield* Effect.gen(function* () {
        const cache = yield* Offline;
        yield* cache.enqueue(id);
        yield* idle(cache);
        if (mode === 'metadata') {
          expect(Option.isNone(yield* cache.local(id))).toBe(true);
          f.control.saveFails = false;
          yield* cache.enqueue(id);
          yield* idle(cache);
        }
        expect((yield* cache.snapshot).saved).toBe(1);
        expect((yield* cache.snapshot).bytes).toBe(16);
      }).pipe(Effect.provide(f.layer), Effect.provideService(References.MinimumLogLevel, 'None'));
      expect(f.calls.some((c) => c.at === 0)).toBe(true);
      expect(f.files.get(identityKey(id))?.slice(0, 2)).toEqual(Uint8Array.of(255, 251));
    }
  }),
);

it.effect('offline delete waits for its own disk write and prevents its publication', () =>
  Effect.gen(function* () {
    const f = fake();
    const writing = yield* Deferred.make<boolean>();
    const release = yield* Deferred.make<boolean>();
    f.control.writing = Deferred.succeed(writing, true).pipe(
      Effect.andThen(Deferred.await(release)),
      Effect.asVoid,
    );
    yield* Effect.gen(function* () {
      const cache = yield* Offline;
      yield* cache.enqueue({ number: 100, offset: 0 });
      yield* Deferred.await(writing);
      const deleting = yield* cache.deleteAll.pipe(Effect.forkChild);
      yield* Deferred.succeed(release, true);
      yield* Fiber.join(deleting);
      yield* idle(cache);
      expect((yield* cache.snapshot).saved).toBe(0);
      expect(f.files.size).toBe(0);
    }).pipe(Effect.provide(f.layer));
  }),
);
