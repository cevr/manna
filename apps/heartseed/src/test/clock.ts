import { Clock, Effect, Layer } from 'effect';
import type { Duration } from 'effect';

import type { Recall } from '../sayit';
import { dueModel, MINUTE } from './session-model';

/** The default instant owned by a test that needs no particular date. */
export const START = Date.UTC(2026, 10, 10, 15);

/** A settable instant moved only by the test's commands. */
export interface Time {
  now: number;
}

/** The host clock's elapsed capabilities; its calendar time is never read. */
const hostClock = Effect.runSync(
  Clock.clockWith((clock) =>
    Effect.succeed({
      monotonicTimeNanosUnsafe: () => clock.monotonicTimeNanosUnsafe(),
      monotonicTimeNanos: clock.monotonicTimeNanos,
      sleep: (duration: Duration.Duration) => clock.sleep(duration),
    }),
  ),
);

/** Effect's clock with its instant at `time.now`; sleeps and monotonic time measure real elapsed time without moving that instant. */
export const clockOf = (time: Time) => {
  const millis = () => time.now;
  const clock: Clock.Clock = {
    currentTimeMillisUnsafe: millis,
    currentTimeMillis: Effect.sync(millis),
    currentTimeNanosUnsafe: () => BigInt(millis()) * 1_000_000n,
    currentTimeNanos: Effect.sync(() => BigInt(millis()) * 1_000_000n),
    ...hostClock,
  };
  return Layer.succeed(Clock.Clock, clock);
};

/** A plant's recalls as the garden reads them: one per instant, the last written wins. */
const distinct = (recalls: readonly Recall[]) => [
  ...new Map(recalls.map((recall) => [recall.startedAt, recall])).values(),
];

/**
 * Sets `time` to the due of the plant of `recalls` (one past it), or a
 * minute on when that is later, so a recital said there starts at an
 * instant of its own; a verse with no recall stays where it is but for the
 * minute.
 */
export const toDue = (time: Time, recalls: readonly Recall[]) => {
  const now = time.now;
  let due = 0;
  if (recalls.length > 0) due = dueModel(distinct(recalls)) + 1;
  time.now = Math.max(now + MINUTE, due);
  return time.now;
};
