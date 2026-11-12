/* oxlint-disable effect/noTernary, effect/noNullish, effect/noRuntimeTypeof, effect/noTryCatch, effect/noGlobals -- the model writes the spec's rules out as plain branches over undefined and parsed JSON, apart from the app's Schema and Option code, so the two cannot share a mistake. */

/**
 * The independent model of Haskell's Bible Handbook and of the lists a
 * reader holds, written plainly from hshandbook's rules (R1-R5, R7's
 * pieces, R8's lists and R11's titles) for the tests to judge the app by.
 * The Handbook comes from `data/handbook.json` itself; nothing here reads
 * `src/handbook.ts`, `src/lists.ts`, `src/shelves.ts` or `src/passages.ts`.
 * The passages' own rules are `passages-model.ts`'s, over the lists held;
 * the collections are the committed list's (`src/promises.ts`), as
 * `promise-model.ts` reads them.
 */

import data from '../../data/handbook.json';
import { COLLECTIONS } from '../promises';
import {
  addRule,
  readRule,
  removeRule,
  spanRef,
  verseRef,
  versesIn,
  type Corpus,
  type Held,
  type ModelTextPiece,
  type Span,
} from './passages-model';

/** The store key of the lists planted (R1). */
export const LISTS = 'heartseed/lists';
/** R3: the most passages and lists held together when either is added. */
export const MOST = 3;
/** R1: each key's read is tried this many times in all. */
export const TRIES = 3;

/** Every list id of the data, section by section, in the book's order: the ids this build knows. */
export const KNOWN_IDS: readonly string[] = data.sections.flatMap((section) =>
  section.lists.map((list) => list.id),
);

const known = new Set(KNOWN_IDS);

/** A Handbook list as the model holds it: its section's title, its id, its title by R11 and its distinct verses in Haskell's order (R8). */
export interface ModelHandbookList {
  readonly section: string;
  readonly id: string;
  readonly title: string;
  readonly verses: readonly string[];
  /** Each distinct verse's place `[book, chapter, verse]`, beside `verses`. */
  readonly places: readonly (readonly [number, number, number])[];
}

/** R8, R11: every list of the data, in the book's order; a title the book uses before gets ` (n)` on its n-th use. */
export const HANDBOOK_ORDER: readonly ModelHandbookList[] = (() => {
  const out: ModelHandbookList[] = [];
  const uses: Record<string, number> = {};
  for (const section of data.sections)
    for (const list of section.lists) {
      const n = (uses[list.title] ?? 0) + 1;
      uses[list.title] = n;
      const verses: string[] = [];
      const places: (readonly [number, number, number])[] = [];
      for (const [book = 0, chapter = 0, first = 0, last = 0] of list.ranges)
        for (let verse = first; verse <= last; verse++) {
          const reference = verseRef(book, chapter, verse);
          if (verses.includes(reference)) continue;
          verses.push(reference);
          places.push([book, chapter, verse]);
        }
      out.push({
        section: section.title,
        id: list.id,
        title: n === 1 ? list.title : `${list.title} (${n})`,
        verses,
        places,
      });
    }
  return out;
})();

/** R10: the note under every Handbook shelf's title, as the spec writes it. */
export const HANDBOOK_NOTE = 'S. N. Haskell, Bible Handbook (1919)';

/** R10: each section of the data in the book's order: its id, its title and its lists' ids in order. */
export const HANDBOOK_SECTIONS: readonly {
  readonly id: string;
  readonly title: string;
  readonly ids: readonly string[];
}[] = data.sections.map((section) => ({
  id: section.id,
  title: section.title,
  ids: section.lists.map((list) => list.id),
}));

/** Every model list by its id. */
export const HANDBOOK_MODEL: ReadonlyMap<string, ModelHandbookList> = new Map(
  HANDBOOK_ORDER.map((list) => [list.id, list]),
);

/** Whether this build knows the list `id`. */
export const knows = (id: string) => known.has(id);

/** What the model holds: `stored` is the lists' stored array as stored (unknown and repeated ids kept); `Unread` claims nothing. */
export type Model =
  | { readonly tag: 'Unread' }
  | {
      readonly tag: 'Read';
      readonly passages: readonly Span[];
      readonly stored: readonly string[];
    };

/** R2: the lists held, as the view shows them: each stored id this build knows, once, in stored order. */
export const heldLists = (stored: readonly string[]) => {
  const out: string[] = [];
  for (const id of stored) if (known.has(id) && !out.includes(id)) out.push(id);
  return out;
};

/** R3: how many the reader holds: the passages and the lists held. */
export const countOf = (model: Model) =>
  model.tag === 'Read' ? model.passages.length + heldLists(model.stored).length : 0;

/** R1: the lists' stored array from its text after `failed` failed reads: none for no key; unread unless a JSON array of strings. */
export const listsRule = (
  raw: string | undefined,
  failed: number,
): readonly string[] | 'unread' => {
  if (failed >= TRIES) return 'unread';
  if (raw === undefined) return [];
  let value: unknown = undefined;
  try {
    value = JSON.parse(raw);
  } catch {
    return 'unread';
  }
  if (!Array.isArray(value)) return 'unread';
  if (!value.every((entry) => typeof entry === 'string')) return 'unread';
  return value as string[];
};

/** R1: the view a launch reads from both keys: `Unread` when either is. */
export const readModel = (
  corpus: Corpus,
  rawP: string | undefined,
  failedP: number,
  rawL: string | undefined,
  failedL: number,
): Model => {
  const passages = readRule(corpus, rawP, failedP);
  const stored = listsRule(rawL, failedL);
  if (passages.tag === 'Unread' || stored === 'unread') return { tag: 'Unread' };
  return { tag: 'Read', passages: passages.passages, stored };
};

/** One change judged: its answer, the model after it, the key its write went to (landed or refused; none when it wrote nothing), and whether it landed. */
export interface Step {
  readonly answer: string;
  readonly model: Model;
  readonly wrote?: 'P' | 'L';
  readonly landed: boolean;
}

const stay = (answer: string, model: Model): Step => ({ answer, model, landed: false });

/** The passages' model's view of `model`, the lists held beside the passages. */
const heldOf = (model: Model): Held =>
  model.tag === 'Unread'
    ? { tag: 'Unread' }
    : { tag: 'Read', passages: model.passages, lists: heldLists(model.stored) };

/** A passages' rule's answer taken back into the joint model: the lists' stored array stays as stored. */
const passageStep = (model: Model, outcome: string, held: Held): Step => {
  if (model.tag === 'Unread' || held.tag === 'Unread') return stay(outcome, model);
  if (outcome === 'Failed') return { answer: outcome, model, wrote: 'P', landed: false };
  if (outcome !== 'Added' && outcome !== 'Removed') return stay(outcome, model);
  return {
    answer: outcome,
    model: { tag: 'Read', passages: held.passages, stored: model.stored },
    wrote: 'P',
    landed: true,
  };
};

/** R3: an add of a passage, by `passages-model.ts`'s rule over the passages and lists held. */
export const addStep = (corpus: Corpus, model: Model, span: Span, refused: boolean): Step => {
  const { outcome, held } = addRule(corpus, heldOf(model), span, refused);
  return passageStep(model, outcome, held);
};

/** A remove of the first passage equal to `span`, by `passages-model.ts`'s rule. */
export const removeStep = (model: Model, span: Span, refused: boolean): Step => {
  const { outcome, held } = removeRule(heldOf(model), span, refused);
  return passageStep(model, outcome, held);
};

/** R4: a plant of the list `id`, whole. */
export const plantRule = (model: Model, id: string, refused: boolean): Step => {
  if (model.tag === 'Unread') return stay('Unread', model);
  if (!known.has(id)) return stay('Invalid', model);
  if (heldLists(model.stored).includes(id)) return stay('Held', model);
  if (countOf(model) >= MOST) return stay('Full', model);
  if (refused) return { answer: 'Failed', model, wrote: 'L', landed: false };
  return {
    answer: 'Added',
    model: { ...model, stored: [...model.stored, id] },
    wrote: 'L',
    landed: true,
  };
};

/** R5: an uproot of the list `id`: every stored entry equal to it goes; every other entry stays in place. */
export const uprootRule = (model: Model, id: string, refused: boolean): Step => {
  if (model.tag === 'Unread') return stay('Unread', model);
  if (!heldLists(model.stored).includes(id)) return stay('Absent', model);
  if (refused) return { answer: 'Failed', model, wrote: 'L', landed: false };
  return {
    answer: 'Removed',
    model: { ...model, stored: model.stored.filter((each) => each !== id) },
    wrote: 'L',
    landed: true,
  };
};

/** A verse's place and the group its piece takes: `[book, chapter, verse, group]`. */
type Placed = readonly [number, number, number, string];

/** Each held passage's verses, grouped by its reference. */
const passagePlaces = (passages: readonly Span[]): Placed[] => {
  const out: Placed[] = [];
  for (const span of passages)
    for (let verse = span.first; verse <= span.last; verse++)
      out.push([span.book, span.chapter, verse, spanRef(span)]);
  return out;
};

/** Each held list's verses (R2: known ids, once, in stored order), grouped by its title. */
const listPlaces = (stored: readonly string[]): Placed[] => {
  const out: Placed[] = [];
  for (const id of heldLists(stored)) {
    const list = HANDBOOK_MODEL.get(id);
    if (list === undefined) continue;
    for (const [book, chapter, verse] of list.places) out.push([book, chapter, verse, list.title]);
  }
  return out;
};

/** Each taught collection's verses, grouped by its title. */
const taughtPlaces = (taught: readonly string[]): Placed[] => {
  const out: Placed[] = [];
  for (const id of taught) {
    const collection = COLLECTIONS.find((each) => each.id === id);
    if (collection === undefined) continue;
    for (const range of collection.promises)
      for (let verse = range.first; verse <= range.last; verse++)
        out.push([range.book, range.chapter, verse, collection.title]);
  }
  return out;
};

/**
 * R7: the pieces the session plans over: the app's `own`, then each held
 * passage's verses (grouped by its reference), then each held list's
 * verses in Haskell's order (grouped by its title), then each taught
 * collection's (grouped by its title), each reference kept at its first
 * place only; an unread view gives the own alone. Each verse's text comes
 * from `corpus` and its words by `words`; each verse is one piece, whole.
 */
export const piecesWithListsModel = (
  corpus: Corpus,
  own: readonly ModelTextPiece[],
  held: Held,
  taught: readonly string[],
  words: (text: string) => number,
): ModelTextPiece[] => {
  const all: ModelTextPiece[] = [...own];
  const push = ([book, chapter, verse, group]: Placed) => {
    const text = versesIn(corpus, book, chapter)[verse - 1] ?? '';
    all.push({ reference: verseRef(book, chapter, verse), text, words: words(text), group });
  };
  if (held.tag === 'Read')
    for (const placed of [
      ...passagePlaces(held.passages),
      ...listPlaces(held.lists ?? []),
      ...taughtPlaces(taught),
    ])
      push(placed);
  const out: ModelTextPiece[] = [];
  const named = new Set<string>();
  for (const piece of all) {
    if (named.has(piece.reference)) continue;
    named.add(piece.reference);
    out.push(piece);
  }
  return out;
};
