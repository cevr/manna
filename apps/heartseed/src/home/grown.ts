/**
 * What grew in a run, as pure code the end of a run will draw (hshomejoy):
 * each verse of the plan's done items whose plant ranks higher now than
 * when the plan was made.
 */

import { Array as Arr, Option } from 'effect';

import { plantOf, STAGES, stageOf, type Plant, type ReadGarden, type Stage } from '../garden';
import { verseOf } from '../home';
import { isDone, type Item, type Plan } from '../session';

/** A verse that grew in a run, and its stage as the field shows it now. */
export interface Grown {
  readonly reference: string;
  readonly stage: Stage;
}

/** A stage's rank, seed lowest; -1 for a plant with no recall yet, below a seed. */
const rankOf = (stage: Option.Option<Stage>) =>
  Option.match(stage, { onNone: () => -1, onSome: (some) => STAGES.indexOf(some) });

/** The stage over the first `count` recalls of `plant`, none for none. */
const stageOver = (plant: Plant, count: number) => {
  const first = plant.recalls.slice(0, count);
  if (!Arr.isReadonlyArrayNonEmpty(first)) return Option.none<Stage>();
  return Option.some(stageOf(plantOf(first)));
};

/** Whether `item`'s plant ranks higher over all its recalls than over the recalls it held when the plan was made. */
const grew = (garden: ReadGarden, item: Item) =>
  Option.exists(
    Option.fromNullishOr(garden.plants.get(item.reference)),
    (plant) => rankOf(Option.some(stageOf(plant))) > rankOf(stageOver(plant, item.recalls)),
  );

/** A verse's stage as the field shows it: its own plant's, else a seed (only a phrase of it is planted). */
const stageNow = (garden: ReadGarden, verse: string): Stage =>
  Option.match(Option.fromNullishOr(garden.plants.get(verse)), {
    onNone: (): Stage => 'seed',
    onSome: stageOf,
  });

/**
 * The verses that grew in a run of `plan`: in plan order, the verse (a
 * phrase's folded into it) of each done item whose plant's stage now ranks
 * above its stage over the item's baseline recalls, each verse once. A
 * verse planted from nothing grew; Again and an equal stage did not.
 */
export const grownOf = (plan: Plan, garden: ReadGarden): readonly Grown[] =>
  Arr.dedupeWith(
    plan.items
      .filter((item) => isDone(garden, item) && grew(garden, item))
      .map((item) => verseOf(item.reference)),
    (a, b) => a === b,
  ).map((verse) => ({ reference: verse, stage: stageNow(garden, verse) }));
