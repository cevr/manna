/* oxlint-disable effect/noNullish -- a test clock: its instant is a plain number a test sets between steps, the host's while it is null. */

/**
 * The tests' clock for Today: Effect's `Clock`, provided under the app's
 * layer with its instant frozen where the test sets it (or the host's moved
 * on by a test's shift), and the step that
 * moves it to a verse's due, so a new plan made there (a Minutes tap, or a
 * relaunch) offers the verse again. The due is the session model's
 * (`dueModel`, hsdaily's S1), written apart from the app.
 */

import { Clock, Effect, Layer } from 'effect';
import type { Duration } from 'effect';

import type { Recall } from '../sayit';
import { dueModel, MINUTE } from './session-model';

/** A settable instant: the host's own while `now` is null. */
export interface Time {
  now: number | null;
}

/** Effect's clock with its instant `at(host)`, `host` the host's instant now; its sleeps and monotonic time are the host's. */
export const clockAt = (at: (host: number) => number) => {
  const real = Effect.runSync(Clock.clockWith((clock) => Effect.succeed(clock)));
  const millis = () => at(real.currentTimeMillisUnsafe());
  const clock: Clock.Clock = {
    currentTimeMillisUnsafe: millis,
    currentTimeMillis: Effect.sync(millis),
    currentTimeNanosUnsafe: () => BigInt(millis()) * 1_000_000n,
    currentTimeNanos: Effect.sync(() => BigInt(millis()) * 1_000_000n),
    monotonicTimeNanosUnsafe: () => real.monotonicTimeNanosUnsafe(),
    monotonicTimeNanos: real.monotonicTimeNanos,
    sleep: (duration: Duration.Duration) => real.sleep(duration),
  };
  return Layer.succeed(Clock.Clock, clock);
};

/** Effect's clock with its instant frozen at `time.now` (the host's while it is null); its sleeps are the host's. */
export const clockOf = (time: Time) => clockAt((host) => time.now ?? host);

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
  const now = time.now ?? Effect.runSync(Clock.currentTimeMillis);
  let due = 0;
  if (recalls.length > 0) due = dueModel(distinct(recalls)) + 1;
  time.now = Math.max(now + MINUTE, due);
  return time.now;
};
