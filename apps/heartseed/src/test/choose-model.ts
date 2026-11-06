/* oxlint-disable effect/noNullish, effect/noTernary -- the model writes the spec's rules out as plain branches over undefined, apart from the app's Option code, so the two cannot share a mistake. */

/**
 * The independent model of choosing passages, written plainly from the
 * spec's rules (hspassage C1, C3-C8) for the tests to judge the app by.
 * Ranges, references and pieces come from `./passages-model.ts`; nothing
 * here reads `src/chooser.ts`, `src/field.ts`, `src/passages.ts` or a
 * screen.
 */

import { NAMES, spanRef, verseRef, versesIn, type Corpus } from './passages-model';

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

/** C3, C8: the limit line, word for word. */
export const LIMIT = '3 passages, the most for now. Remove one to add another.';

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
      back: 'Your field',
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
  const count = versesIn(corpus, step.book, step.chapter).length;
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

/** C6: the chooser after a back; a back from the books leaves it (`undefined`). */
export const backRule = (state: Choosing): Choosing | undefined => {
  const { step } = state;
  if (step.at === 'books') return undefined;
  if (step.at === 'chapters') return OPENED;
  return { step: { at: 'chapters', book: step.book }, chosen: undefined, line: undefined };
};
