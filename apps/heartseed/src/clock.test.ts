/* oxlint-disable effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, effect/noTryCatch, eslint/no-await-in-loop -- the clock model runs generated commands in order and restores its zone even on failure; real waits independently check that elapsed time never moves its instant. */

import { describe, expect, it } from 'bun:test';
import { Clock, Context, DateTime, Effect, Layer, Logger, ManagedRuntime } from 'effect';
import { constVoid } from 'effect/Function';
import * as TestClock from 'effect/testing/TestClock';

import { clockOf, START, type Time } from './test/clock';
import { deadline } from './test/elapsed';
import { checkAsked, hostAsked } from './test/setup';
import { below, random } from './test/garden-model';
import { hostOffset, hostZone, offsetIn, restore, travel, ZONES } from './test/zone';

const INSTANT = Date.UTC(2026, 10, 10, 15);
const DAY = 86_400_000;

const EDGES = [
  0,
  Date.UTC(2024, 1, 29, 23, 59, 59, 999),
  Date.UTC(2026, 2, 8, 6, 59, 59, 999),
  Date.UTC(2026, 2, 8, 7),
  Date.UTC(2026, 2, 29, 1),
  Date.UTC(2026, 9, 3, 15, 30),
  Date.UTC(2026, 10, 1, 5, 59, 59, 999),
  Date.UTC(2026, 10, 10, 3, 59, 59, 999),
  Date.UTC(2026, 10, 10, 4),
  Date.UTC(2026, 11, 31, 23, 59, 59, 999),
  Date.UTC(2100, 0, 1),
];
const GAPS = [0, 1, 999, 60_000, 3_600_000, 13 * 3_600_000, DAY, 400 * DAY];
const COMMANDS = [
  'set',
  'advance',
  'advance',
  'travel',
  'relaunch',
  'wait',
  'sleep',
  'other',
] as const;

/** All four calendar answers from the provided clock, including its direct synchronous interface. */
const read = (layer: Layer.Layer<never>) =>
  Effect.runSync(
    Effect.gen(function* () {
      const { currentTimeMillisUnsafe, currentTimeNanosUnsafe } = yield* Clock.Clock;
      return {
        millis: yield* Clock.currentTimeMillis,
        nanos: yield* Clock.currentTimeNanos,
        unsafeMillis: currentTimeMillisUnsafe(),
        unsafeNanos: currentTimeNanosUnsafe(),
      };
    }).pipe(Effect.provide(layer)),
  );

describe('the tests’ clock', () => {
  it('starts at the owned instant 2026-11-10T15:00Z', () => {
    expect(START).toBe(1_794_322_800_000);
  });

  it('answers the model’s instant through set, advance, travel, relaunch, waits, sleeps and another clock’s moves', async () => {
    const next = random(0x71de);
    const seen = { set: 0, advance: 0, travel: 0, relaunch: 0, wait: 0, sleep: 0, other: 0 };
    const edges = new Set<number>();
    const zones = new Set<string>();
    const gaps = new Set<number>();
    const before = hostZone();
    try {
      for (let run = 0; run < 200; run += 1) {
        const model = { instant: START, zone: 'UTC', other: START - 7 * DAY };
        const time: Time = { now: START };
        const other: Time = { now: START - 7 * DAY };
        let layer = clockOf(time);
        const shared = clockOf(time);
        const apart = clockOf(other);
        const move = (command: (typeof COMMANDS)[number]) => {
          if (command === 'set') {
            if (below(next, 2) === 0) {
              model.instant = EDGES[below(next, EDGES.length)] ?? 0;
              edges.add(model.instant);
            } else model.instant = below(next, 4_102_444_800) * 1000 + below(next, 1000);
            time.now = model.instant;
          }
          if (command === 'advance' || command === 'other') {
            const gap = GAPS[below(next, GAPS.length)] ?? 0;
            gaps.add(gap);
            if (command === 'advance') {
              model.instant += gap;
              time.now += gap;
            } else {
              model.other += gap;
              other.now += gap;
            }
          }
          if (command === 'travel') {
            model.zone = ZONES[below(next, ZONES.length)] ?? 'UTC';
            zones.add(model.zone);
            travel(model.zone);
          }
        };
        travel('UTC');
        for (let step = 0; step < 30; step += 1) {
          const command = COMMANDS[below(next, COMMANDS.length)] ?? 'set';
          seen[command] += 1;
          move(command);
          if (command === 'relaunch') layer = clockOf(time);
          if (command === 'wait' && seen.wait % 80 === 0) {
            // oxlint-disable-next-line effect/noGlobals -- a bounded real wait proves elapsed host time does not move the logical instant.
            await new Promise((resolve) => setTimeout(resolve, 2));
          }
          if (command === 'sleep' && seen.sleep % 80 === 0) {
            const late = deadline(4);
            await Effect.runPromise(Effect.sleep('8 millis').pipe(Effect.provide(layer)));
            expect(late()).toBe(true);
          }
          const got = read(layer);
          expect({ run, step, command, ...got, offset: hostOffset(got.millis) }).toEqual({
            run,
            step,
            command,
            millis: model.instant,
            nanos: BigInt(model.instant) * 1_000_000n,
            unsafeMillis: model.instant,
            unsafeNanos: BigInt(model.instant) * 1_000_000n,
            offset: offsetIn(model.zone, model.instant),
          });
          expect(read(shared)).toEqual(got);
          expect(read(apart)).toEqual({
            millis: model.other,
            nanos: BigInt(model.other) * 1_000_000n,
            unsafeMillis: model.other,
            unsafeNanos: BigInt(model.other) * 1_000_000n,
          });
        }
      }
    } finally {
      restore(before);
    }
    expect(Object.entries(seen).filter(([, count]) => count < 300)).toEqual([]);
    expect([...edges].sort()).toEqual([...EDGES].sort());
    expect([...zones].sort()).toEqual([...ZONES].sort());
    expect([...gaps].sort()).toEqual([...GAPS].sort());
  });
});

const quiet = Logger.layer([Logger.make(constVoid)]);

/** One ask of the calendar time of each kind a runtime makes: a clock read, a `DateTime`, a log line's stamp. */
const ASKS = [
  Clock.currentTimeMillis,
  DateTime.now,
  Effect.logInfo('line').pipe(Effect.provide(quiet)),
] as const;

/** The class Effect's default clock is made from. */
const DefaultClock: new () => Clock.Clock = Object.getPrototypeOf(
  Clock.Clock.defaultValue(),
).constructor;

/** Effect's default clock with the host's answer replaced by the test's instant, so its own reads (a clock read, a `DateTime`, a log line's stamp) are counted without asking the host. */
class Held extends DefaultClock {
  override currentTimeMillisUnsafe() {
    return START;
  }
}

const early = new Held();
hostAsked(Held.prototype);

/** A runtime whose layer reads the time as it is built, given `clock` by `Layer.provide` alone, so its later reads fall back to the default clock. */
class Opened extends Context.Service<Opened, { readonly at: number }>()('heartseed/test/Opened') {}

describe('the default clock’s count', () => {
  it('counts each ask of a held clock once, a clock made before the count began too, and starts again after it is read', () => {
    const next = random(0x7a5e);
    const counts = new Set<number>();
    const kinds = new Set<number>();
    for (let run = 0; run < 60; run += 1) {
      const asks = below(next, 9);
      counts.add(asks);
      for (let ask = 0; ask < asks; ask += 1) {
        const kind = below(next, ASKS.length);
        kinds.add(kind);
        const held = [early, new Held()][below(next, 2)] ?? early;
        Effect.runSync(
          (ASKS[kind] ?? Clock.currentTimeMillis).pipe(Effect.provideService(Clock.Clock, held)),
        );
      }
      if (asks === 0) expect(checkAsked).not.toThrow();
      else
        expect(checkAsked).toThrow(
          `the case asked the host’s clock the time through Effect’s default clock, ${asks} in all:`,
        );
      expect(checkAsked).not.toThrow();
    }
    expect([...counts].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...kinds].sort()).toEqual([0, 1, 2]);
  });

  it('counts a runtime whose layer was given the clock but not merged with it, at its later read', () => {
    const time: Time = { now: START };
    const opened = Layer.effect(
      Opened,
      Effect.map(Clock.currentTimeMillis, (at) => Opened.of({ at })),
    );
    const provided = ManagedRuntime.make(
      opened.pipe(
        Layer.provide(clockOf(time)),
        Layer.provideMerge(Layer.succeed(Clock.Clock, early)),
      ),
    );
    time.now = START + DAY;
    expect(provided.runSync(Effect.map(Opened, ({ at }) => at))).toBe(START + DAY);
    expect(checkAsked).not.toThrow();
    expect(provided.runSync(Clock.currentTimeMillis)).toBe(START);
    expect(checkAsked).toThrow('default clock, 1 in all:');
  });

  it('counts nothing under the test’s clock, a TestClock or a log line on the test’s clock', () => {
    const time: Time = { now: START };
    const merged = ManagedRuntime.make(Layer.merge(quiet, clockOf(time)));
    for (const ask of ASKS) merged.runSync(ask);
    for (const ask of ASKS) Effect.runSync(ask.pipe(Effect.provide(clockOf(time))));
    for (const ask of ASKS) Effect.runSync(ask.pipe(Effect.provide(TestClock.layer())));
    expect(merged.runSync(Effect.map(DateTime.now, DateTime.toEpochMillis))).toBe(START);
    expect(checkAsked).not.toThrow();
  });
});

describe('the elapsed boundary', () => {
  it('expires while the test’s instant stands still, never because that instant jumps', async () => {
    const time = { now: INSTANT };
    const read = () => Effect.runSync(Clock.currentTimeMillis.pipe(Effect.provide(clockOf(time))));
    const late = deadline(30);
    expect(late()).toBe(false);
    time.now += 3650 * DAY;
    expect(read()).toBe(INSTANT + 3650 * DAY);
    expect(late()).toBe(false);
    time.now = INSTANT;
    let turns = 0;
    while (!late() && turns < 2000) {
      turns += 1;
      // oxlint-disable-next-line effect/noGlobals -- a real timer is the independent oracle for this elapsed-host-time boundary.
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    expect(late()).toBe(true);
    expect(turns).toBeGreaterThan(0);
    expect(turns).toBeLessThan(2000);
    expect(read()).toBe(INSTANT);
  });

  it('keeps each deadline’s start and expires a zero-length deadline by the next turn', async () => {
    const none = deadline(0);
    const long = deadline(60_000);
    // oxlint-disable-next-line effect/noGlobals -- a real timer establishes the next turn without consulting the logical clock.
    await new Promise((resolve) => setTimeout(resolve, 3));
    expect([none(), long()]).toEqual([true, false]);
  });
});
