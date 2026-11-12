/* oxlint-disable effect/noNullish, effect/noTernary -- the model writes the hspromise spec's rules out as plain branches, apart from the app's code, so the two cannot share a mistake. */

/**
 * The hspromise spec's rules written plainly, apart from the session and
 * the screens; the need cards (N3) live on only here, for the session's
 * visit properties. Its collection data is the committed list
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
 * - T1 the pieces: the app's own, then each held passage's verses (group:
 *   the passage's reference), then each taught collection's verses in the
 *   order the ids are given, promise by promise (group: its title), each
 *   reference kept at its first place; with the passages unread, the app's
 *   own alone. Each verse is one piece, whole (hspiece W2).
 * - F1 the field's passages: the app's own row, each held passage (none
 *   while unread), then each taught collection as one row of its verses
 *   in order, each once.
 * - V1 a visit: the promise's verses in order, each its recall count at
 *   the tap as its baseline.
 * - V2 what Today shows: the held verse if any; else the visit's first
 *   verse whose recalls are not past its baseline; else the plan's first
 *   item not done; else the done state.
 * - H4 (hshomebase, hspiece W1) Start here: before a plan, nothing; else
 *   the plan's first item not done on the verse itself as planned; else a
 *   planted canon verse as a review from its recalls now; else a canon
 *   verse learned whole; else nothing.
 */

import type { Range } from '../passages';
import { COLLECTIONS } from '../promises';
import type { ModelPassage } from './field-model';
import {
  spanRef,
  verseRef,
  versesIn,
  type Corpus,
  type Held,
  type ModelTextPiece,
} from './passages-model';

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

/** T1: the pieces over the app's `own`, the passages `held` and the collections `taught`, each verse whole, its text from `corpus` and its words by `words`. */
export const piecesModel = (
  corpus: Corpus,
  own: readonly ModelTextPiece[],
  held: Held,
  taught: readonly string[],
  words: (text: string) => number,
): ModelTextPiece[] => {
  const all: ModelTextPiece[] = [...own];
  const push = (book: number, chapter: number, verse: number, group: string) => {
    const text = versesIn(corpus, book, chapter)[verse - 1] ?? '';
    all.push({ reference: verseRef(book, chapter, verse), text, words: words(text), group });
  };
  if (held.tag === 'Read') {
    for (const span of held.passages)
      for (let verse = span.first; verse <= span.last; verse++)
        push(span.book, span.chapter, verse, spanRef(span));
    for (const id of taught) {
      const collection = COLLECTIONS.find((each) => each.id === id);
      if (collection === undefined) continue;
      for (const range of collection.promises)
        for (let verse = range.first; verse <= range.last; verse++)
          push(range.book, range.chapter, verse, collection.title);
    }
  }
  const out: ModelTextPiece[] = [];
  for (const piece of all)
    if (out.every((each) => each.reference !== piece.reference)) out.push(piece);
  return out;
};

/** A verse of a visit or a plan as the model holds it: its reference and the recalls it must pass to be done. */
export interface ModelVisitVerse {
  readonly reference: string;
  readonly recalls: number;
}

/** V1: the visit a tap on `range` makes, over each reference's recall count at the tap. */
export const visitModel = (
  range: Range,
  recallsAt: (reference: string) => number,
): ModelVisitVerse[] =>
  promiseVerses(range).map((reference) => ({ reference, recalls: recallsAt(reference) }));

/** V2: the reference Today shows, or `Done`, over the verse held (null when none), the visit, the plan's items and each reference's recall count now. */
export const shownModel = (
  held: string | null,
  visit: readonly ModelVisitVerse[],
  plan: readonly ModelVisitVerse[],
  recallsNow: (reference: string) => number,
): string => {
  if (held !== null) return held;
  for (const verse of visit)
    if (recallsNow(verse.reference) <= verse.recalls) return verse.reference;
  for (const item of plan) if (recallsNow(item.reference) <= item.recalls) return item.reference;
  return 'Done';
};

/** A plan item as Start here reads it: its reference, whether it is the new piece, and its baseline. */
export interface ModelStartItem {
  readonly reference: string;
  readonly fresh: boolean;
  readonly recalls: number;
}

/** What Start here starts as the model holds it: a plan item as planned, a review of a planted verse from its recalls now, or a verse not planted learned fresh. */
export type ModelStart<I extends ModelStartItem> =
  | { readonly from: 'plan'; readonly item: I }
  | { readonly from: 'plant'; readonly item: ModelStartItem }
  | { readonly from: 'learn'; readonly item: ModelStartItem };

/**
 * H4 (hshomebase) and hspiece W1: what a tap on `verse` starts, over the
 * plan's items (null before a plan), each reference's recall count now (0
 * when not planted) and the canon's verses: none before a plan; the plan's
 * first item whose recalls are not past its baseline and whose reference
 * is `verse` itself, as planned; else, for a canon verse with recalls of
 * its own, a review from its recalls now; else, for a canon verse with
 * none, the verse itself, fresh, with no recalls, whatever pieces of it
 * hold recalls; else none.
 */
export const startModel = <I extends ModelStartItem>(
  plan: readonly I[] | null,
  verse: string,
  recallsNow: (reference: string) => number,
  canon: ReadonlySet<string>,
): ModelStart<I> | null => {
  if (plan === null) return null;
  for (const item of plan)
    if (recallsNow(item.reference) <= item.recalls && item.reference === verse)
      return { from: 'plan', item };
  if (!canon.has(verse)) return null;
  if (recallsNow(verse) > 0)
    return { from: 'plant', item: { reference: verse, fresh: false, recalls: recallsNow(verse) } };
  return { from: 'learn', item: { reference: verse, fresh: true, recalls: 0 } };
};

/** F1: the passages the field shows over the app's `own` row, the passages `held` and the collections `taught`. */
export const fieldPassagesModel = (
  own: readonly ModelPassage[],
  held: Held,
  taught: readonly string[],
): ModelPassage[] => {
  const out: ModelPassage[] = [...own];
  if (held.tag === 'Read')
    for (const span of held.passages) {
      const verses: string[] = [];
      for (let verse = span.first; verse <= span.last; verse++)
        verses.push(verseRef(span.book, span.chapter, verse));
      out.push({ title: spanRef(span), verses });
    }
  for (const id of taught) {
    const collection = COLLECTIONS.find((each) => each.id === id);
    if (collection === undefined) continue;
    const verses: string[] = [];
    for (const range of collection.promises)
      for (const reference of promiseVerses(range))
        if (!verses.includes(reference)) verses.push(reference);
    out.push({ title: collection.title, verses });
  }
  return out;
};
