/**
 * The field: every passage is a row and every verse a plant (Mark 4:28:
 * seed, then blade, then ear, then full corn), derived each time from a
 * garden whose read completed, and nothing else. Nothing is stored for it.
 *
 * The passages given come first, in their order, each verse at the stage
 * the garden derives (`not planted` before its first recall). After them,
 * every other verse the garden holds is a passage of one verse, in the
 * order first sown: by its earliest recall, then by its reference in code
 * units. References match exactly. A passage the reader chose carries its
 * range to its row, so its list page's `Remove this list` names that range
 * and never finds it by the row's place.
 *
 * The pieces of verses an earlier build kept (`src/phrase.ts`) fold into
 * their verse: a piece is never a row or a plant here, and its stage is
 * never its verse's. A verse with no plant of its own is `not planted`
 * whatever pieces of it are planted, until it is said whole (owner,
 * 2026-11-12); a piece's plant whose verse no passage holds makes a row for
 * that verse among the other plants, first sown by the earliest recall of
 * the verse and its pieces.
 *
 * Days sown is the number of distinct days (`dayOf`: the reader's local day
 * from 04:00 by each record's own stored offset, or the UTC date of a record
 * kept before offsets were stored) on which any recall of any verse or
 * piece was kept. A recall's day is a function of its record alone, so the
 * same disk shows the same count in every time zone, and as the garden never
 * removes a recall and a rewrite keeps its start and offset, the count never
 * falls. The harvest is the number of verses (never pieces) at full corn
 * now.
 */

import { Array as Arr, Option, Order, pipe } from 'effect';

import { dayOf } from './day';
import { stageOf, type Plant, type ReadGarden, type Stage } from './garden';
import type { Range } from './passages';
import { phraseOf } from './phrase';

/** A verse's stage on the field: the garden's stage, or `not planted` before its first recall. */
export type PlantStage = Stage | 'not planted';

/** A passage the field shows as one row: its title, its verses' references, in order, and its range when the reader chose it. */
export interface FieldPassage {
  readonly title: string;
  readonly verses: ReadonlyArray<string>;
  readonly range?: Range;
}

export interface FieldPlant {
  readonly reference: string;
  readonly stage: PlantStage;
}

export interface FieldRow {
  readonly title: string;
  readonly plants: ReadonlyArray<FieldPlant>;
  /** The range of the reader's passage the row shows; none on the app's own row and on a verse no passage holds. */
  readonly range?: Range;
}

export interface Field {
  readonly rows: ReadonlyArray<FieldRow>;
  /** The distinct days (`dayOf`) on which any recall was kept. */
  readonly sown: number;
  /** The verses at full corn now. */
  readonly harvest: number;
}

/** A verse the field shows outside the passages, and its earliest recall among its own plant and its old pieces'. */
interface Sown {
  readonly verse: string;
  readonly first: number;
}

/** The order first sown: by the earliest recall, then by the verse's reference in code units. */
const firstSown: Order.Order<Sown> = Order.combine(
  Order.mapInput(Order.Number, (sown: Sown) => sown.first),
  Order.mapInput(Order.String, (sown: Sown) => sown.verse),
);

/** The verse a plant's reference belongs to: an old piece's verse, else the reference itself. */
const verseOf = (reference: string) =>
  Option.match(phraseOf(reference), {
    onNone: () => reference,
    onSome: (phrase) => phrase.verse,
  });

const isPhrase = (plant: Plant) => Option.isSome(phraseOf(plant.reference));

/** Each verse no passage holds, with its earliest recall: old pieces' plants fold into their verse. */
const othersOf = (plants: ReadonlyArray<Plant>, taught: ReadonlySet<string>) => {
  const firsts = new Map<string, number>();
  for (const plant of plants) {
    const verse = verseOf(plant.reference);
    if (taught.has(verse)) continue;
    const first = Arr.headNonEmpty(plant.recalls).startedAt;
    firsts.set(verse, Math.min(firsts.get(verse) ?? first, first));
  }
  return pipe(
    [...firsts].map(([verse, first]): Sown => ({ verse, first })),
    Arr.sort(firstSown),
    Arr.map((sown): FieldPassage => ({ title: sown.verse, verses: [sown.verse] })),
  );
};

/** The field of a read garden over the passages the app teaches, each old piece folded into its verse. */
export const fieldOf = (garden: ReadGarden, passages: ReadonlyArray<FieldPassage>): Field => {
  const plants = [...garden.plants.values()];
  const taught = new Set(passages.flatMap((passage) => passage.verses));
  const stageAt = (reference: string): PlantStage =>
    Option.match(Option.fromNullishOr(garden.plants.get(reference)), {
      onNone: () => 'not planted',
      onSome: stageOf,
    });
  const days = new Set(plants.flatMap((plant) => plant.recalls.map(dayOf)));
  return {
    rows: [...passages, ...othersOf(plants, taught)].map((passage) => ({
      title: passage.title,
      plants: passage.verses.map((reference) => ({ reference, stage: stageAt(reference) })),
      range: passage.range,
    })),
    sown: days.size,
    harvest: plants.filter((plant) => !isPhrase(plant) && stageOf(plant) === 'full corn').length,
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
