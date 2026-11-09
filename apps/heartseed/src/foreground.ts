/**
 * The app's returns to the foreground, and the session woken at each. The
 * host reports the app's state as `active`, `inactive` or `background`
 * (`Foreground.states`, its live source in `src/foreground/source.ts`). A
 * return is an `active` after a `background` since the last `active`; the
 * first state a subscription reads, the launch's own, counts as the last
 * one seen. `inactive` alone (the notification center, Control Center, a
 * system prompt such as the microphone's, a call banner) never leaves the
 * app, so it is no return, and neither is a second `active` with no
 * `background` between. Each return wakes the session (`Session.wake`),
 * which makes the plan again unless a recital is under way, and counts in
 * `Returns`, which home's greeting is read again from. The states are read
 * through one subscription, this layer's, for the whole runtime.
 */

import { Context, Effect, Layer, Stream, SubscriptionRef } from 'effect';

import { Session } from './session/service';

/** Whether a `background` was seen since the last `active`. */
export interface Life {
  readonly away: boolean;
}

/** Before the first state a subscription reads. */
export const UNSEEN: Life = { away: false };

/** The life after one state the host reports, and whether that state is a return. */
export interface LifeStep {
  readonly life: Life;
  readonly returned: boolean;
}

/** One state the host reports, and whether it is a return. */
export const lifeStep = (life: Life, state: string): LifeStep => {
  if (state === 'background') return { life: { away: true }, returned: false };
  if (state === 'active') return { life: { away: false }, returned: life.away };
  return { life, returned: false };
};

/** The app's state as the host reports it: the state at the subscription first, then each change. */
export class Foreground extends Context.Service<
  Foreground,
  { readonly states: Stream.Stream<string> }
>()('heartseed/foreground/Foreground') {}

/** The ordinal of each return among `states`, from 1, the first state the launch's own. */
export const returnsOf = <E, R>(states: Stream.Stream<string, E, R>): Stream.Stream<number, E, R> =>
  Stream.mapAccum(
    states,
    () => ({ life: UNSEEN, returns: 0 }),
    (seen, state) => {
      const step = lifeStep(seen.life, state);
      if (!step.returned) return [{ life: step.life, returns: seen.returns }, []] as const;
      const returns = seen.returns + 1;
      return [{ life: step.life, returns }, [returns]] as const;
    },
  );

/** The count of the launch's returns to the foreground so far, from 0: its changes are the returns, read through the one subscription `wakeLayer` holds. */
export class Returns extends Context.Service<Returns, SubscriptionRef.SubscriptionRef<number>>()(
  'heartseed/foreground/Returns',
) {}

/** Counts each return in `Returns` and wakes the session at it, for as long as the app's runtime lives: its scope's close ends the subscription. */
export const wakeLayer: Layer.Layer<Returns, never, Foreground | Session> = Layer.effect(
  Returns,
  Effect.gen(function* () {
    const foreground = yield* Foreground;
    const session = yield* Session;
    const returns = yield* SubscriptionRef.make(0);
    yield* Effect.forkScoped(
      Stream.runForEach(returnsOf(foreground.states), (count) =>
        Effect.andThen(SubscriptionRef.set(returns, count), session.wake),
      ),
      { startImmediately: true },
    );
    return returns;
  }),
);
