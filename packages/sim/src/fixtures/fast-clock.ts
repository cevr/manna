/**
 * A clock for a drive run over stand-in tools: its time is the real one, and
 * every sleep (a scroll's rest and looks, a readiness wait's retry, a port's
 * second look, a tool's time limit) is `SPEED` times shorter. The stand-ins
 * answer at once, so a sleep waits on nothing but the clock; the order of
 * the drive's steps is the same at any speed.
 */
import { Clock, Duration, Effect } from 'effect';

/** How much shorter every sleep is than the drive's own. */
export const SPEED = 20;

/** `program` on the real clock with every sleep `SPEED` times shorter. */
export const fast = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  Effect.clockWith((real) => {
    const clock: Clock.Clock = {
      currentTimeMillisUnsafe: () => real.currentTimeMillisUnsafe(),
      currentTimeMillis: real.currentTimeMillis,
      currentTimeNanosUnsafe: () => real.currentTimeNanosUnsafe(),
      currentTimeNanos: real.currentTimeNanos,
      monotonicTimeNanosUnsafe: () => real.monotonicTimeNanosUnsafe(),
      monotonicTimeNanos: real.monotonicTimeNanos,
      sleep: (duration) => real.sleep(Duration.millis(Duration.toMillis(duration) / SPEED)),
    };
    return Effect.provideService(program, Clock.Clock, clock);
  });
