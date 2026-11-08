/**
 * When I need…'s rule, pure: the promises the reader already knows, by
 * situation. The cards come in the situations' order (the brief's fear,
 * temptation, worry, sickness, guilt, guidance, need and grief, then the
 * rest in Selah's order). A taught collection's card always shows, with
 * the count of its promises still to learn; any other shows only once the
 * reader knows one of its promises, and never names a count. A promise is
 * known when every verse of it has a plant in the read garden, at any
 * stage; references match exactly.
 */

import type { ReadGarden } from './garden';
import { type Range, verseReference } from './passages';
import { COLLECTIONS } from './promises';

/** One card of When I need…: its collection's id and title, the promises known in the collection's order, and how many of a taught collection's promises are still to learn (0 on a card not taught). */
export interface NeedCard {
  readonly id: string;
  readonly title: string;
  readonly known: readonly Range[];
  readonly toLearn: number;
}

/** The collections' ids in the situations' order: the brief's eight first, then the rest as Selah lists them. */
const SITUATIONS: readonly string[] = [
  'protection',
  'victory',
  'peace',
  'healing',
  'forgiveness',
  'guidance',
  'provision',
  'comfort',
  'strength',
  'spirit',
  'salvation',
  'return',
  'prayer',
  'rest',
];

/** A promise with each verse's reference it names, in order. */
interface Named {
  readonly range: Range;
  readonly references: readonly string[];
}

/** Each collection in the situations' order, its promises named once. */
const CARDS: readonly {
  readonly id: string;
  readonly title: string;
  readonly promises: readonly Named[];
}[] = SITUATIONS.flatMap((id) =>
  COLLECTIONS.filter((collection) => collection.id === id).map((collection) => ({
    id,
    title: collection.title,
    promises: collection.promises.map((range) => ({
      range,
      references: Array.from({ length: Math.max(0, range.last - range.first + 1) }, (_, index) =>
        verseReference(range.book, range.chapter, range.first + index),
      ),
    })),
  })),
);

/** When I need…'s cards over a read garden, the collections of `taught` being the ones the session teaches. */
export const needOf = (garden: ReadGarden, taught: readonly string[]): readonly NeedCard[] =>
  CARDS.flatMap(({ id, title, promises }): readonly NeedCard[] => {
    const known = promises
      .filter(({ references }) => references.every((reference) => garden.plants.has(reference)))
      .map(({ range }) => range);
    if (taught.includes(id)) return [{ id, title, known, toLearn: promises.length - known.length }];
    if (known.length === 0) return [];
    return [{ id, title, known, toLearn: 0 }];
  });
