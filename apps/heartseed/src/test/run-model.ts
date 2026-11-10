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
 * - H9 the end of a run (`tendedModel`, `grewLine`): written over the garden
 *   model's stage rule and the phrase model's verse rule alone.
 */

import type { Recall } from '../sayit';
import { inOrder, referenceStage, type ModelStage } from './garden-model';
import { verseOfRule } from './phrase-model';
import type { ModelItem } from './session-model';

const RANK: Readonly<Record<ModelStage, number>> = { seed: 0, blade: 1, ear: 2, 'full corn': 3 };

/** An item of a run as the end reads it: its reference and the recalls its plant held when it was planned. */
type ModelBaseline = Pick<ModelItem, 'reference' | 'recalls'>;

/** A verse the end lists as grown, at its stage on the field now. */
interface ModelGrown {
  readonly reference: string;
  readonly stage: ModelStage;
}

/**
 * H9: what the end of a run shows over `records` (one per recital, the
 * garden read), null while Today is not the end. The run is `visit`, then
 * the plan; it is the end when a plan is made, nothing is held, the run is
 * not empty and each of its items holds more recalls than its baseline.
 * Then each item whose stage over all its recalls ranks above its stage
 * over its baseline (none below a seed) lists its verse, in run order, once,
 * at the verse's own stage, a seed while only a phrase of it is planted.
 */
export const tendedModel = (
  run: { readonly plan: readonly ModelBaseline[] | null; readonly hold: ModelBaseline | null },
  visit: readonly ModelBaseline[],
  records: readonly Recall[],
): ModelGrown[] | null => {
  if (run.plan === null || run.hold !== null) return null;
  const items = [...visit, ...run.plan];
  if (items.length === 0) return null;
  const of = (reference: string) =>
    inOrder(records.filter((recall) => recall.reference === reference));
  for (const item of items) if (of(item.reference).length <= item.recalls) return null;
  const out: ModelGrown[] = [];
  for (const item of items) {
    const recalls = of(item.reference);
    const before = recalls.slice(0, item.recalls);
    const was = before.length === 0 ? -1 : RANK[referenceStage(before)];
    if (RANK[referenceStage(recalls)] <= was) continue;
    const verse = verseOfRule(item.reference);
    if (out.some((grown) => grown.reference === verse)) continue;
    const own = of(verse);
    out.push({ reference: verse, stage: own.length === 0 ? 'seed' : referenceStage(own) });
  }
  return out;
};

/** H9: the end's line over `n` verses grown. */
export const grewLine = (n: number) => {
  if (n === 0) return 'Nothing grew this time.';
  return `${n} grew a stage.`;
};

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
