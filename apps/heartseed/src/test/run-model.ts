/* oxlint-disable effect/noNullish, effect/noTernary -- the model writes the hsrun spec's run rules out as plain branches over null, apart from `src/session/run.ts` and `src/session/service.ts`'s Option code, so the two cannot share a mistake. */

/**
 * Today's run written plainly from the hsrun spec (R1, R2, R4, R7), apart
 * from the app's own code: a reducer over the plan made last (the model's
 * plan, `planModel` of `src/test/session-model.ts`), the item held, and the
 * recall counts now.
 *
 * - R1 the shown item: the held item if one is held, else the plan's first
 *   item not done; none (R4, the done state) when every item is done and
 *   none is held.
 * - R2 the action: `Next` when the shown item is done (its plant holds more
 *   recalls than when its plan was made) and no recital is under way, else
 *   `Say it`; none in the done state.
 * - R7 a recital's start holds the shown item; `Next` lets it go; a making
 *   of the plan lets it go unless a recital is under way; a relaunch starts
 *   with none.
 */

import type { ModelItem } from './session-model';

/** The run of a launch: the plan made last (none before Today's first show with a read garden, and in an unread launch) and the item held. */
export interface RunModel {
  readonly plan: readonly ModelItem[] | null;
  readonly hold: ModelItem | null;
}

/** A launch's run before Today first shows. */
export const NO_RUN: RunModel = { plan: null, hold: null };

/** The recalls a reference's plant holds now. */
export type RecallsNow = (reference: string) => number;

/** S12: whether `item` is done over the recalls now. */
export const doneModel = (item: ModelItem, recallsNow: RecallsNow) =>
  recallsNow(item.reference) > item.recalls;

/** R1: the item Today shows, null for the done state; meaningful with a plan only. */
export const shownModel = (run: RunModel, recallsNow: RecallsNow): ModelItem | null => {
  if (run.hold !== null) return run.hold;
  if (run.plan === null) return null;
  for (const item of run.plan) if (!doneModel(item, recallsNow)) return item;
  return null;
};

/** R2: the action button at rest, null in the done state. */
export const actionModel = (run: RunModel, recallsNow: RecallsNow): 'Next' | 'Say it' | null => {
  const shown = shownModel(run, recallsNow);
  if (shown === null) return null;
  return doneModel(shown, recallsNow) ? 'Next' : 'Say it';
};

/** R7: a making of the plan, a recital under way or not. */
export const madeModel = (
  run: RunModel,
  plan: readonly ModelItem[],
  underWay: boolean,
): RunModel => ({ plan, hold: underWay ? run.hold : null });

/** R7: a press of Say it starts a recital on the shown item. */
export const startedModel = (run: RunModel, recallsNow: RecallsNow): RunModel => ({
  ...run,
  hold: run.plan === null ? null : shownModel(run, recallsNow),
});

/** R2, R7: a tap on Next. */
export const nextModel = (run: RunModel): RunModel => ({ ...run, hold: null });
