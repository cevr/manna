/* oxlint-disable effect/noNullish, effect/noTernary -- the model writes the hspromise spec's rules out as plain branches, apart from the app's code, so the two cannot share a mistake. */

/**
 * The hspromise spec's rules written plainly, apart from `src/need.ts`,
 * the session and the screens. Its collection data is the committed list
 * (`COLLECTIONS`), which the content test and the acceptance check hold to
 * Selah's; references come from `test/passages-model.ts`.
 *
 * - N3 the cards: the brief's situations in its words' order (fear,
 *   temptation, worry, sickness, guilt, guidance, need, grief), then every
 *   other collection in the list's order; a taught card always, any other
 *   only with a promise known.
 * - N4 a card: its known promises in the collection's order, a promise
 *   known when each of its verses is a key of the garden; a taught card's
 *   count of the promises not known, 0 on any other.
 */

import type { Range } from '../passages';
import { COLLECTIONS } from '../promises';
import { verseRef } from './passages-model';

/** The brief's situations, each the collection it names. */
const BRIEF: readonly (readonly [situation: string, id: string])[] = [
  ['fear', 'protection'],
  ['temptation', 'victory'],
  ['worry', 'peace'],
  ['sickness', 'healing'],
  ['guilt', 'forgiveness'],
  ['guidance', 'guidance'],
  ['need', 'provision'],
  ['grief', 'comfort'],
];

/** A card as the model writes it. */
export interface ModelCard {
  readonly id: string;
  readonly title: string;
  readonly known: readonly Range[];
  readonly toLearn: number;
}

/** The collections' ids in card order: the brief's, then the rest in the list's order. */
export const cardOrder = (): readonly string[] => {
  const first = BRIEF.map(([, id]) => id);
  const rest = COLLECTIONS.map((collection) => collection.id).filter((id) => !first.includes(id));
  return [...first, ...rest];
};

/** Each verse of `range`, by reference. */
export const promiseVerses = (range: Range): string[] => {
  const out: string[] = [];
  for (let verse = range.first; verse <= range.last; verse++)
    out.push(verseRef(range.book, range.chapter, verse));
  return out;
};

/** N3-N4: When I need…'s cards over the references planted, the collections `taught` taught. */
export const needModel = (planted: ReadonlySet<string>, taught: readonly string[]): ModelCard[] => {
  const cards: ModelCard[] = [];
  for (const id of cardOrder()) {
    const collection = COLLECTIONS.find((each) => each.id === id);
    if (collection === undefined) continue;
    const known: Range[] = [];
    for (const range of collection.promises) {
      let all = true;
      for (const reference of promiseVerses(range)) if (!planted.has(reference)) all = false;
      if (all) known.push(range);
    }
    const isTaught = taught.indexOf(id) >= 0;
    if (!isTaught && known.length === 0) continue;
    cards.push({
      id,
      title: collection.title,
      known,
      toLearn: isTaught ? collection.promises.length - known.length : 0,
    });
  }
  return cards;
};
