/* oxlint-disable effect/noNullish -- the model writes the hswake spec's rules out as plain branches over null, apart from `src/foreground.ts` and `src/session/service.ts`'s Option code, so the two cannot share a mistake. */

/**
 * The return to the foreground written plainly from the hswake spec (R8a,
 * R8b, R8c), apart from the app's own code: which states the host reports
 * are returns, read over the whole sequence rather than folded, and the run
 * after a return, over `src/test/run-model.ts`'s run and
 * `src/test/session-model.ts`'s plan.
 *
 * - R8a a return is an `active` with a `background` after the last
 *   `active` before it; the launch's own state is the first one seen.
 * - R8b at a return with a plan made in this launch, a read garden and no
 *   recital under way, the plan is made at that instant and the hold is
 *   dropped.
 * - R8c otherwise nothing changes.
 * - R9a Listen shows exactly when the voice is on and reads nothing, no
 *   recital is under way, and the button reads Say it on the plan's new
 *   piece.
 */

import { actionModel, madeModel, shownModel, type RecallsNow, type RunModel } from './run-model';
import type { ModelItem } from './session-model';

/** R8a: for each of `events`, whether it is a return, after the launch's own state `current`. */
export const returnsModel = (current: string, events: readonly string[]): boolean[] => {
  const seen = [current, ...events];
  return events.map((state, index) => {
    if (state !== 'active') return false;
    const before = seen.slice(0, index + 1);
    const lastActive = before.lastIndexOf('active');
    return before.slice(lastActive + 1).includes('background');
  });
};

/** What a return meets: whether the garden is unread, and whether a recital listens or finishes. */
export interface WakeAt {
  readonly unread: boolean;
  readonly underWay: boolean;
}

/** R8b, R8c: the run after a return, `plan` the plan made at its instant. */
export const wakeModel = (
  run: RunModel,
  plan: () => readonly ModelItem[],
  at: WakeAt,
): RunModel => {
  if (at.unread) return run;
  if (run.plan === null) return run;
  if (at.underWay) return run;
  return madeModel(run, plan(), false);
};

/** What Today's Listen meets: an unread garden, the voice's switch, a reading under way, a recital under way. */
export interface ListenAt {
  readonly unread: boolean;
  readonly voiceOn: boolean;
  readonly reading: boolean;
  readonly underWay: boolean;
}

/** R9a: whether Today offers Listen: the voice on and reading nothing, no recital under way, and the button reading Say it on the plan's new piece. */
export const listenModel = (run: RunModel, recallsNow: RecallsNow, at: ListenAt): boolean => {
  if (at.unread || run.plan === null) return false;
  if (!at.voiceOn || at.reading || at.underWay) return false;
  const shown = shownModel(run, recallsNow);
  if (shown === null || !shown.fresh) return false;
  return actionModel(run, recallsNow) === 'Say it';
};
