/* oxlint-disable effect/noNullish, effect/noTernary -- the sheet's model is written plainly: an open shelf is a title or null, and a count's words are picked in a plain branch. */

/**
 * The Add verses sheet's model (hsshelves S2-S4), written plainly from the
 * spec and importing only the models: the shelves and each offer's state
 * from `home-model.ts`, the passages' rules from `passages-model.ts`.
 *
 * It holds whether the sheet is open, the open shelf (by title), the line
 * after a plant's answer, the passages held, and the stand-in's counts of
 * `Done`, `Any passage` and a landed plant. `sheetWant` is the sheet a
 * reader must get over a field whose rows hold the references `rows`.
 */

import { offerModel, shelvesModel, type ModelShelf } from './home-model';
import {
  addRule,
  spanRef,
  type AddOutcome,
  type Corpus,
  type Held,
  type Span,
} from './passages-model';

/** The limit line, as the spec writes it. */
export const LIMIT_WORDS = '3 passages, the most for now. Remove one to add another.';

/** The line after a plant's answer: none, the limit line after `Full`, or the alert naming the list. */
export type ModelLine =
  | { readonly tag: 'None' }
  | { readonly tag: 'Limit' }
  | { readonly tag: 'Alert'; readonly title: string };

/** The sheet as the model holds it. */
export interface SheetModel {
  readonly open: boolean;
  readonly shelf: string | null;
  readonly line: ModelLine;
  readonly held: Held;
  readonly counts: { readonly done: number; readonly any: number; readonly added: number };
}

/** The open sheet as a reader gets it: its headings, each shelf head's name and `aria-expanded`, each offer as `[title, count, Plant <title> | In your field | '']`, and the line. */
export type SheetSeen =
  | 'closed'
  | {
      readonly headings: readonly string[];
      readonly shelves: readonly (readonly [string, string | null])[];
      readonly offers: readonly (readonly [string, string, string])[];
      readonly line: string;
    };

const NONE: ModelLine = { tag: 'None' };

/** The shelves, once. */
const SHELVES_MODEL: readonly ModelShelf[] = shelvesModel();

/** The sheet as it opens over `held`: no shelf open, no line. */
export const opened = (held: Held, counts = { done: 0, any: 0, added: 0 }): SheetModel => ({
  open: true,
  shelf: null,
  line: NONE,
  held,
  counts,
});

/** Whether the passages are read and hold 3 or more. */
const full = (held: Held) => held.tag === 'Read' && held.passages.length >= 3;

/** A tap in the sheet that is not `Plant`'s: the line cleared. */
const cleared = (model: SheetModel): SheetModel => ({ ...model, line: NONE });

/** A tap on the shelf head `title`: it opens, closing any other, or closes when it is open. */
export const tapShelf = (model: SheetModel, title: string): SheetModel => ({
  ...cleared(model),
  shelf: model.shelf === title ? null : title,
});

/** `Done` or Escape: the sheet closes. */
export const done = (model: SheetModel): SheetModel => ({
  ...model,
  open: false,
  shelf: null,
  line: NONE,
  counts: { ...model.counts, done: model.counts.done + 1 },
});

/** `Any passage`: the sheet hands the reader to the chooser. */
export const any = (model: SheetModel): SheetModel => ({
  ...model,
  open: false,
  shelf: null,
  line: NONE,
  counts: { ...model.counts, any: model.counts.any + 1 },
});

/** A plant's answer and the sheet after it. */
export interface Planted {
  readonly model: SheetModel;
  readonly outcome: AddOutcome;
}

/** `Plant` of `span`, its write refused or not: `Added` closes the sheet over the new list; `Full` shows the limit line; any other answer the alert. */
export const plant = (corpus: Corpus, model: SheetModel, span: Span, refused: boolean): Planted => {
  const { outcome, held } = addRule(corpus, model.held, span, refused);
  if (outcome === 'Added')
    return {
      outcome,
      model: {
        ...model,
        held,
        open: false,
        shelf: null,
        line: NONE,
        counts: { ...model.counts, added: model.counts.added + 1 },
      },
    };
  if (outcome === 'Full') return { outcome, model: { ...model, line: { tag: 'Limit' } } };
  return { outcome, model: { ...model, line: { tag: 'Alert', title: spanRef(span) } } };
};

/** A list's count in words. */
const countWords = (verses: number) => (verses === 1 ? '1 verse' : `${verses} verses`);

/** The open shelf's offers over a field whose rows hold `rows`. */
const offersOf = (model: SheetModel, rows: readonly (readonly string[])[]) => {
  const shelf = SHELVES_MODEL.find((each) => each.title === model.shelf);
  if (shelf === undefined || shelf.lists === 'chooser') return [];
  return shelf.lists.map((list): readonly [string, string, string] => {
    const state = list.range === undefined ? 'unread' : offerModel(list.range, model.held, rows);
    const shown =
      state === 'plant' ? `Plant ${list.title}` : state === 'in field' ? 'In your field' : '';
    return [list.title, countWords(list.verses.length), shown];
  });
};

/** The line the foot shows: the limit while 3 or more are held, else the line after the last answer. */
const lineOf = (model: SheetModel) => {
  if (full(model.held) || model.line.tag === 'Limit') return LIMIT_WORDS;
  if (model.line.tag === 'Alert') return `${model.line.title} was not planted. Try again.`;
  return '';
};

/** The sheet a reader must get from `model` over a field whose rows hold the references `rows`. */
export const sheetWant = (model: SheetModel, rows: readonly (readonly string[])[]): SheetSeen => {
  if (!model.open) return 'closed';
  return {
    headings: ['Add verses'],
    shelves: SHELVES_MODEL.map((shelf): readonly [string, string | null] => [
      shelf.title,
      shelf.lists === 'chooser' ? null : String(shelf.title === model.shelf),
    ]),
    offers: offersOf(model, rows),
    line: lineOf(model),
  };
};
