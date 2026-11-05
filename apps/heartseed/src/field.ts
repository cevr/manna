/**
 * The field: every passage is a row and every verse a plant (Mark 4:28:
 * seed, then blade, then ear, then full corn), derived each time from a
 * garden whose read completed, and nothing else. Nothing is stored for it.
 *
 * The passages given come first, in their order, each verse at the stage
 * the garden derives (`not planted` before its first recall). After them,
 * every other verse the garden holds is a passage of one verse, in the
 * order first sown: by its earliest recall, then by its reference in code
 * units. References match exactly.
 *
 * Days sown is the number of distinct UTC calendar days on which any recall
 * of any verse was kept. A UTC day is a function of the stored `startedAt`
 * alone, so the same disk shows the same count in every time zone, and as
 * the garden never removes a recall, the count never falls. The harvest is
 * the number of verses at full corn now.
 */

import { Array as Arr, Option, Order, pipe } from 'effect';

import { stageOf, type Plant, type ReadGarden, type Stage } from './garden';

/** A verse's stage on the field: the garden's stage, or `not planted` before its first recall. */
export type PlantStage = Stage | 'not planted';

/** A passage the field shows as one row: its title and its verses' references, in order. */
export interface FieldPassage {
  readonly title: string;
  readonly verses: ReadonlyArray<string>;
}

export interface FieldPlant {
  readonly reference: string;
  readonly stage: PlantStage;
}

export interface FieldRow {
  readonly title: string;
  readonly plants: ReadonlyArray<FieldPlant>;
}

export interface Field {
  readonly rows: ReadonlyArray<FieldRow>;
  /** The distinct UTC days on which any recall was kept. */
  readonly sown: number;
  /** The verses at full corn now. */
  readonly harvest: number;
}

const DAY_MS = 86_400_000;

/** The UTC calendar day a recall started on, counted from the epoch. */
export const utcDayOf = (startedAt: number) => Math.floor(startedAt / DAY_MS);

/** The order first sown: by a plant's earliest recall, then by its reference in code units. */
const firstSown: Order.Order<Plant> = Order.combine(
  Order.mapInput(Order.Number, (plant: Plant) => Arr.headNonEmpty(plant.recalls).startedAt),
  Order.mapInput(Order.String, (plant: Plant) => plant.reference),
);

/** The field of a read garden over the passages the app teaches. */
export const fieldOf = (garden: ReadGarden, passages: ReadonlyArray<FieldPassage>): Field => {
  const plants = [...garden.plants.values()];
  const taught = new Set(passages.flatMap((passage) => passage.verses));
  const stageAt = (reference: string): PlantStage =>
    Option.match(Option.fromNullishOr(garden.plants.get(reference)), {
      onNone: () => 'not planted',
      onSome: stageOf,
    });
  const others = pipe(
    plants.filter((plant) => !taught.has(plant.reference)),
    Arr.sort(firstSown),
    Arr.map((plant): FieldPassage => ({ title: plant.reference, verses: [plant.reference] })),
  );
  const days = new Set(
    plants.flatMap((plant) => plant.recalls.map((recall) => utcDayOf(recall.startedAt))),
  );
  return {
    rows: [...passages, ...others].map((passage) => ({
      title: passage.title,
      plants: passage.verses.map((reference) => ({ reference, stage: stageAt(reference) })),
    })),
    sown: days.size,
    harvest: plants.filter((plant) => stageOf(plant) === 'full corn').length,
  };
};

/** `<n> <noun>s`, or `1 <noun>` alone. */
const counted = (n: number, one: string, many: string) => {
  if (n === 1) return `1 ${one}`;
  return `${n} ${many}`;
};

/** The days sown as the field writes them. */
export const sownText = (days: number) => counted(days, 'day sown', 'days sown');

/** The harvest as the field writes it. */
export const harvestText = (verses: number) =>
  counted(verses, 'verse at full corn', 'verses at full corn');

/** The number a plant shows under it: what follows its reference's last colon, empty when none does. */
export const verseNumberOf = (reference: string) => {
  const at = reference.lastIndexOf(':');
  if (at < 0) return '';
  return reference.slice(at + 1);
};
