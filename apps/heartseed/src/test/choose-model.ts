/* oxlint-disable effect/noNullish, effect/noTernary, effect/noRuntimeTypeof -- the model writes the spec's rules out as plain branches over undefined, apart from the app's Option code, so the two cannot share a mistake; an ask holds a list's title or a passage's span, told apart by type. */

/**
 * The independent model of choosing passages, written plainly from the
 * spec's rules (hspassage C1, C3-C8) for the tests to judge the app by.
 * Ranges, references and pieces come from `./passages-model.ts`, a planted
 * list's title and verses from `./handbook-model.ts`, and the
 * field's rows from `./phrase-model.ts`'s fold; nothing here reads `src/chooser.ts`, `src/field.ts`, `src/passages.ts` or a
 * screen.
 */

import type { Recall } from '../sayit';
import { HANDBOOK_MODEL } from './handbook-model';
import {
  NAMES,
  spanRef,
  verseRef,
  verseCountIn,
  type Corpus,
  type Held,
  type Span,
} from './passages-model';
import { fieldFoldRule } from './phrase-model';

/** A range of one chapter as the model holds it, or `undefined` for none. */
export interface Chosen {
  readonly first: number;
  readonly last: number;
}

/** C1's cap: a range spans at most this many verses. */
export const MOST = 20;

/**
 * C1: the range after a tap on `verse` of a chapter of `count` verses.
 * A tap on no verse of the chapter leaves the range; with none, or with
 * more than one verse chosen, the tap chooses that verse alone; a tap on
 * the one verse chosen clears it; a tap after it ends the range there, and
 * one before it starts the range there, each at most 20 verses from the
 * verse chosen first.
 */
export const tapRule = (
  chosen: Chosen | undefined,
  verse: number,
  count: number,
): Chosen | undefined => {
  const whole = Number.isFinite(verse) && Math.floor(verse) === verse;
  if (!whole || verse < 1 || verse > count) return chosen;
  if (chosen === undefined) return { first: verse, last: verse };
  if (chosen.first < chosen.last) return { first: verse, last: verse };
  const at = chosen.first;
  if (verse === at) return undefined;
  if (verse > at) {
    let last = verse;
    if (last - at + 1 > MOST) last = at + MOST - 1;
    return { first: at, last };
  }
  let first = verse;
  if (at - first + 1 > MOST) first = at - MOST + 1;
  return { first, last: at };
};

/** C1's promise: `chosen` is none, or a range of 1-20 whole verses inside a chapter of `count`. */
export const fitsChapter = (chosen: Chosen | undefined, count: number): boolean => {
  if (chosen === undefined) return true;
  const { first, last } = chosen;
  if (!Number.isInteger(first) || !Number.isInteger(last)) return false;
  return first >= 1 && first <= last && last <= count && last - first + 1 <= MOST;
};

/** C3, C8, with hshandbook R14: the limit line, word for word. */
export const LIMIT = '3 passages or lists, the most for now. Remove one to add another.';

/** C7: the cap's text. */
export const CAP = 'Up to 20 verses';

/** C8: the plant's alert over `reference`. */
export const notPlanted = (reference: string) => `${reference} was not planted. Try again.`;

/** C7: a count of verses as the footer writes it. */
export const versesText = (n: number) => (n === 1 ? '1 verse' : `${n} verses`);

/** C6: the chooser's steps. */
export type Step =
  | { readonly at: 'books' }
  | { readonly at: 'chapters'; readonly book: number }
  | { readonly at: 'verses'; readonly book: number; readonly chapter: number };

/** The chooser as the model holds it: the step, the range, and the plant's line (the limit or the alert). */
export interface Choosing {
  readonly step: Step;
  readonly chosen: Chosen | undefined;
  readonly line: string | undefined;
}

/** C6: the chooser as it opens: the books, no range, no line. */
export const OPENED: Choosing = { step: { at: 'books' }, chosen: undefined, line: undefined };

/** The book's name as the canon writes it. */
const nameOf = (book: number) => NAMES.get(book) ?? `<book ${book}>`;

/** C6: the 66 books in canon order: 1-39 the Old Testament's, 40-66 the New's. */
export const booksOf = (corpus: Corpus) => ({
  old: corpus.books.filter((book) => book <= 39).map(nameOf),
  new: corpus.books.filter((book) => book >= 40).map(nameOf),
});

/** The chooser's screen as the reader gets it: the heading, the one back, the list, the footer and the line. */
export interface ChooserSeen {
  readonly heading: string;
  readonly back: string;
  readonly labels: ReadonlyArray<string>;
  readonly items: ReadonlyArray<string>;
  readonly verses: ReadonlyArray<readonly [string, boolean]>;
  readonly footer:
    | {
        readonly reference: string | undefined;
        readonly count: string | undefined;
        readonly cap: boolean;
        readonly plant: boolean;
      }
    | undefined;
  readonly line: string | undefined;
}

/** C6-C8: the screen the model wants for `state`, over the model's corpus. */
export const chooserWant = (corpus: Corpus, state: Choosing): ChooserSeen => {
  const { step } = state;
  if (step.at === 'books') {
    const books = booksOf(corpus);
    return {
      heading: 'Add a passage',
      back: 'Add verses',
      labels: ['Old Testament', 'New Testament'],
      items: [...books.old, ...books.new],
      verses: [],
      footer: undefined,
      line: undefined,
    };
  }
  const name = nameOf(step.book);
  if (step.at === 'chapters') {
    const chapters = corpus.counts.get(step.book) ?? 0;
    return {
      heading: name,
      back: 'Books',
      labels: [],
      items: Array.from({ length: chapters }, (_, index) => `${name} ${index + 1}`),
      verses: [],
      footer: undefined,
      line: undefined,
    };
  }
  const count = verseCountIn(corpus, step.book, step.chapter);
  const chosen = state.chosen;
  const inside = (verse: number) =>
    chosen !== undefined && chosen.first <= verse && verse <= chosen.last;
  const span =
    chosen === undefined
      ? undefined
      : { book: step.book, chapter: step.chapter, first: chosen.first, last: chosen.last };
  return {
    heading: `${name} ${step.chapter}`,
    back: 'Chapters',
    labels: [],
    items: [],
    verses: Array.from({ length: count }, (_, index) => [
      verseRef(step.book, step.chapter, index + 1),
      inside(index + 1),
    ]),
    footer: {
      reference: span === undefined ? undefined : spanRef(span),
      count: span === undefined ? undefined : versesText(span.last - span.first + 1),
      cap: true,
      plant: span !== undefined,
    },
    line: state.line,
  };
};

/** C5, with hshandbook R13: the ask over `name` (a passage's reference or a list's title), word for word. */
export const askText = (name: string) => `Remove ${name}? Its plants stay in your field.`;

/** C5, with hshandbook R13: the remove's alert over `name`. */
export const notRemoved = (name: string) => `${name} was not removed. Try again.`;

/** C5, with hslist L4: the remove as the model holds it: the place among the field's rows of the list whose own page shows (`undefined` for home), the passage (a span) or the planted list (its title) asked about there, and the remove's alert, each `undefined` for none. */
export interface Asking {
  readonly open?: number;
  readonly ask: Span | string | undefined;
  readonly alert: string | undefined;
}

/** The name an ask goes by: a list's title as it is, a passage's reference. */
const askedName = (asked: Span | string) => (typeof asked === 'string' ? asked : spanRef(asked));

/** The bar with no ask and no alert, as the field opens. */
export const QUIET: Asking = { ask: undefined, alert: undefined };

/** The field as the reader gets it: each row's title, its plants' labels (readiness cut off) and the controls inside it but its plants; how many `Add a list` show and how many Today cards; the limit line, the ask and the alerts, `undefined` for none. */
export interface FieldSeen {
  readonly rows: ReadonlyArray<{
    readonly title: string;
    readonly plants: ReadonlyArray<string>;
    readonly controls: ReadonlyArray<string>;
  }>;
  readonly add: number;
  readonly card: number;
  readonly limit: string | undefined;
  readonly ask: string | undefined;
  readonly alert: string | undefined;
}

/** hslist L3, L4: a list's own page as the reader gets it: its heading, each row's reference, its `Remove <name>` while it shows, the ask and the alert, `undefined` for none. */
export interface ListSeen {
  readonly list: string;
  readonly rows: ReadonlyArray<string>;
  readonly remove: string | undefined;
  readonly ask: string | undefined;
  readonly alert: string | undefined;
}

/** The place among the field's rows of held passage `at` (the promise's row first). */
export const passageRow = (at: number) => 1 + at;

/** The place among the field's rows of the held list `id`, after the promise's and every held passage's; `undefined` when the field shows no such list. */
export const listRow = (held: Held, id: string) => {
  if (held.tag !== 'Read') return undefined;
  const known = (held.lists ?? []).filter((each) => HANDBOOK_MODEL.has(each));
  const at = known.indexOf(id);
  return at < 0 ? undefined : 1 + held.passages.length + at;
};

/** hslist L5: the `Open <title>` that opens the field's row `row`, and its place among the rows of equal title (from 0), over the same records, promise and held as `fieldWant`. */
export const openOf = (
  records: ReadonlyArray<Recall>,
  promise: string,
  held: Held,
  row: number,
) => {
  const { rows } = homeWant(records, promise, held);
  const title = rows[row]?.title ?? '';
  return {
    label: `Open ${title}`,
    nth: rows.slice(0, row).filter((each) => each.title === title).length,
  };
};

/** C4: a passage's verses' references, first to last. */
const versesOfSpan = (span: Span) =>
  Array.from({ length: span.last - span.first + 1 }, (_, index) =>
    verseRef(span.book, span.chapter, span.first + index),
  );

/**
 * C3-C5, with hshandbook R7, R13 and R14: the field the model wants over
 * the garden's `records`, the promise's reference, the passages and lists
 * `held` and the bar. The rows are the promise's, then each held passage's
 * in the order chosen, then each held list's (`held.lists`: known ids,
 * once, in stored order; its title and its verses in Haskell's order, from
 * `handbook-model.ts`), then every other plant (hsfield's rule), each
 * phrase folded into its verse (H7); every row holds one control, `Open
 * <title>` (hslist L5), and none a `Remove`. With the passages read,
 * `Lists` offers `Add a list` under 3 passages and lists held together,
 * else the limit line; unread, it holds neither. Home holds no ask and no
 * alert; the Today card always shows (hsstart T3): with the passages read
 * a plan is made at home's first show, so it has its lines, and over
 * unread passages it offers `Start`.
 *
 * While a list's own page shows (`bar.open`), it is that page instead
 * (hslist L3, L4): the row's title as its heading, its plants' references
 * in order, and, with the passages read, for a held passage or list, the
 * ask while there is one, else `Remove <title>`; then the alert.
 */
export const fieldWant = (
  records: ReadonlyArray<Recall>,
  promise: string,
  held: Held,
  bar: Asking,
): FieldSeen | ListSeen => {
  const { rows, count } = foldOf(records, promise, held);
  const opened = bar.open === undefined ? undefined : rows[bar.open];
  if (opened === undefined || bar.open === undefined) return homeWant(records, promise, held);
  const ours = held.tag === 'Read' && bar.open >= 1 && bar.open <= count;
  const asking = ours ? bar.ask : undefined;
  return {
    list: opened.title,
    rows: opened.plants.map((plant) => plant.reference),
    remove: ours && asking === undefined ? `Remove ${opened.title}` : undefined,
    ask: asking === undefined ? undefined : askText(askedName(asking)),
    alert: bar.alert,
  };
};

/** The field's rows (`fieldFoldRule` over the promise, the held passages and the known held lists) and how many passages and lists are held. */
const foldOf = (records: ReadonlyArray<Recall>, promise: string, held: Held) => {
  const passages = held.tag === 'Read' ? held.passages : [];
  const lists = (held.tag === 'Read' ? (held.lists ?? []) : []).flatMap((id) => {
    const list = HANDBOOK_MODEL.get(id);
    return list === undefined ? [] : [{ title: list.title, verses: [...list.verses] }];
  });
  const rule = fieldFoldRule(
    [...records],
    [
      { title: promise, verses: [promise] },
      ...passages.map((span) => ({ title: spanRef(span), verses: versesOfSpan(span) })),
      ...lists,
    ],
  );
  return { rows: rule.rows, count: passages.length + lists.length };
};

/** Home as `fieldWant` holds it, with no list's own page shown. */
export const homeWant = (
  records: ReadonlyArray<Recall>,
  promise: string,
  held: Held,
): FieldSeen => {
  const { rows, count } = foldOf(records, promise, held);
  const read = held.tag === 'Read';
  return {
    rows: rows.map((row) => ({
      title: row.title,
      plants: row.plants.map((plant) => `${plant.reference}, ${plant.stage}`),
      controls: [`Open ${row.title}`],
    })),
    add: read && count < 3 ? 1 : 0,
    card: 1,
    limit: read && count >= 3 ? LIMIT : undefined,
    ask: undefined,
    alert: undefined,
  };
};

/** C6: the chooser after a back; a back from the books leaves it (`undefined`). */
export const backRule = (state: Choosing): Choosing | undefined => {
  const { step } = state;
  if (step.at === 'books') return undefined;
  if (step.at === 'chapters') return OPENED;
  return { step: { at: 'chapters', book: step.book }, chosen: undefined, line: undefined };
};
