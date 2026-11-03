import { Duration, Effect, Schedule, Stream } from 'effect';
import type { PhoneCopy } from '../../core/served.ts';

const PHONE_ASKED_EVERY = Duration.seconds(3);

export const copyAwaited = <E, R>(
  ask: Effect.Effect<PhoneCopy, E, R>,
): Stream.Stream<PhoneCopy, never, R> =>
  Stream.fromEffectSchedule(
    ask.pipe(Effect.orElseSucceed((): PhoneCopy => 'pending')),
    Schedule.spaced(PHONE_ASKED_EVERY),
  ).pipe(Stream.takeUntil((copy) => copy !== 'pending'));
