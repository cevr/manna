import { Duration, Effect } from 'effect';

/**
 * How long a test that waits on a real process waits on any one handshake (its readiness, its answer, its exit)
 * before it fails, naming what never came: far past any load, so a busy host only makes the test slower.
 */
export const WATCHDOG = Duration.seconds(30);

/**
 * The timeout of a test that starts real processes and waits on them by handshake: `WATCHDOG` and the platform
 * spawner's group stop on top, under the gate's 60 s bound on a test process (spawn budget).
 */
export const LIVE_MS = 45_000;

/** `effect`, or a defect naming `lost` once `WATCHDOG` passes first. */
export const watched = <A, E, R>(effect: Effect.Effect<A, E, R>, lost: string) =>
  Effect.timeoutOrElse(effect, {
    duration: WATCHDOG,
    orElse: () =>
      Effect.die(new Error(`${lost}: the watchdog gave up after ${Duration.format(WATCHDOG)}`)),
  });
