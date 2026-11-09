/* oxlint-disable effect/noTernary, effect/noNullish, effect/noRuntimeTypeof, effect/noTryCatch, effect/noGlobals, effect/noKnownValueWidening -- the model writes the spec's rules out as plain branches over undefined and parsed JSON, apart from the app's Schema and Option code, so the two cannot share a mistake. */

/**
 * The independent model of Haskell's Bible Handbook and of the lists a
 * reader holds, written plainly from hshandbook's rules (R1-R5) for the
 * tests to judge the app by. The Handbook comes from `data/handbook.json`
 * itself; nothing here reads `src/handbook.ts`, `src/lists.ts`,
 * `src/shelves.ts` or `src/passages.ts`. The passages' own rules are
 * `passages-model.ts`'s, over the lists held.
 */

import data from '../../data/handbook.json';
import { addRule, readRule, removeRule, type Corpus, type Held, type Span } from './passages-model';

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
