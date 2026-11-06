/* oxlint-disable effect/noTernary, effect/noNullish, effect/noRuntimeTypeof, effect/noTryCatch, effect/noGlobals, effect/noKnownValueWidening -- the model writes the spec's rules out as plain branches over undefined and parsed JSON, apart from the app's Schema and Option code, so the two cannot share a mistake. */

/**
 * The independent model of the corpus and the reader's passages, written
 * plainly from the spec's rules (hskjv K1, P1-P6) for the tests to judge
 * the app by. The corpus comes from the KJV's own rows (`readVerses`, the
 * source file as decoded), with the display rule written again here, one
 * character at a time; nothing here reads `src/kjv.ts`, `vite/kjv.ts` or
 * `src/passages.ts`.
 */

import { BIBLE_BOOKS } from '@manna/core/bible';

import type { KjvVerse } from '../../vite/passage';

/** One verse of the source corpus, as `readVerses` decodes it. */
export type Row = KjvVerse;

const HIDDEN = new Set(['[', ']', '‹', '›']);

/** K1's display rule: a leading `¶` and the spaces or tabs after it go, then every bracket and red-letter mark goes. */
export const shown = (source: string): string => {
  const chars = [...source];
  let start = chars[0] === '¶' ? 1 : 0;
  if (start === 1) while (chars[start] === ' ' || chars[start] === '\t') start += 1;
  return chars
    .slice(start)
    .filter((char) => !HIDDEN.has(char))
    .join('');
};

/** The corpus as the model reads it: each chapter's shown verses by verse number, and each book's chapter count. */
export interface Corpus {
  /** Keyed `book:chapter`; the verse `n` at index `n - 1`. */
  readonly chapters: ReadonlyMap<string, ReadonlyArray<string>>;
  /** Each book's chapter count, by book number. */
  readonly counts: ReadonlyMap<number, number>;
  /** The books in canon order. */
  readonly books: ReadonlyArray<number>;
}

/** The model's corpus over `rows`, each verse placed by its own numbers. */
export const corpusOf = (rows: ReadonlyArray<Row>): Corpus => {
  const chapters = new Map<string, Array<string>>();
  const counts = new Map<number, number>();
  for (const row of rows) {
    const key = `${row.book}:${row.chapter}`;
    const list = chapters.get(key) ?? [];
    list[row.verse - 1] = shown(row.text);
    chapters.set(key, list);
    counts.set(row.book, Math.max(counts.get(row.book) ?? 0, row.chapter));
  }
  return { chapters, counts, books: [...counts.keys()].toSorted((a, b) => a - b) };
};

/** The shown verses of a chapter, none for one the corpus does not hold. */
export const versesIn = (corpus: Corpus, book: number, chapter: number): ReadonlyArray<string> =>
  corpus.chapters.get(`${book}:${chapter}`) ?? [];

/** The store key of the passages (P3). */
export const KEY = 'heartseed/passages';
/** P4's caps: an add needs fewer than 3 held, and a range of at most 20 verses. */
export const CAP_PASSAGES = 3;
export const CAP_VERSES = 20;
/** P3: the read is tried this many times in all. */
export const ATTEMPTS = 3;

/** A range as the model holds it. */
export interface Span {
  readonly book: number;
  readonly chapter: number;
  readonly first: number;
  readonly last: number;
}

/** The passages as the model holds them. */
export type Held =
  | { readonly tag: 'Read'; readonly passages: ReadonlyArray<Span> }
  | { readonly tag: 'Unread' };

const whole = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);

/** P1: four whole numbers in one chapter of the canon, 1 ≤ first ≤ last ≤ the chapter's verse count. */
export const fits = (corpus: Corpus, span: Span): boolean =>
  whole(span.book) &&
  whole(span.chapter) &&
  whole(span.first) &&
  whole(span.last) &&
  span.first >= 1 &&
  span.first <= span.last &&
  span.last <= versesIn(corpus, span.book, span.chapter).length;

/** P1: a range a reader may add: it fits, and spans at most 20 verses. */
export const addable = (corpus: Corpus, span: Span): boolean =>
  fits(corpus, span) && span.last - span.first + 1 <= CAP_VERSES;

/** The canon's book names, by number. */
export const NAMES: ReadonlyMap<number, string> = new Map(
  BIBLE_BOOKS.map((book) => [book.number, book.name]),
);

/** P2: `<Book> <c>:<v>`, the book named as the canon names it. */
export const verseRef = (book: number, chapter: number, verse: number) =>
  `${NAMES.get(book)} ${chapter}:${verse}`;

/** P2: `<Book> <c>:<a>-<b>`, or the one verse's reference. */
export const spanRef = (span: Span) => {
  const start = verseRef(span.book, span.chapter, span.first);
  if (span.first === span.last) return start;
  return `${start}-${span.last}`;
};

/** P3: the view a launch reads from the stored text (`undefined` for no key) after `failedReads` failed `get`s. */
export const readRule = (corpus: Corpus, raw: string | undefined, failedReads: number): Held => {
  if (failedReads >= ATTEMPTS) return { tag: 'Unread' };
  if (raw === undefined) return { tag: 'Read', passages: [] };
  let value: unknown = undefined;
  try {
    value = JSON.parse(raw);
  } catch {
    return { tag: 'Unread' };
  }
  if (!Array.isArray(value)) return { tag: 'Unread' };
  const passages: Span[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
      return { tag: 'Unread' };
    const span = { book: entry.book, chapter: entry.chapter, first: entry.first, last: entry.last };
    if (!fits(corpus, span)) return { tag: 'Unread' };
    passages.push(span);
  }
  return { tag: 'Read', passages };
};

/** The stored text the model expects for `passages`: the four fields of each, in order. */
export const storedText = (passages: ReadonlyArray<Span>) =>
  JSON.stringify(
    passages.map((span) => ({
      book: span.book,
      chapter: span.chapter,
      first: span.first,
      last: span.last,
    })),
  );

export type AddOutcome = 'Added' | 'Full' | 'Invalid' | 'Unread' | 'Failed';
export type RemoveOutcome = 'Removed' | 'Absent' | 'Unread' | 'Failed';

/** P4: an add's answer and the view after it, `refused` when its write fails. */
export const addRule = (
  corpus: Corpus,
  held: Held,
  span: Span,
  refused: boolean,
): { outcome: AddOutcome; held: Held } => {
  if (held.tag === 'Unread') return { outcome: 'Unread', held };
  if (!addable(corpus, span)) return { outcome: 'Invalid', held };
  if (held.passages.length >= CAP_PASSAGES) return { outcome: 'Full', held };
  if (refused) return { outcome: 'Failed', held };
  const copy = { book: span.book, chapter: span.chapter, first: span.first, last: span.last };
  return { outcome: 'Added', held: { tag: 'Read', passages: [...held.passages, copy] } };
};

const equal = (a: Span, b: Span) =>
  a.book === b.book && a.chapter === b.chapter && a.first === b.first && a.last === b.last;

/** P5: a remove's answer and the view after it: the first equal passage goes, `refused` when its write fails. */
export const removeRule = (
  held: Held,
  span: Span,
  refused: boolean,
): { outcome: RemoveOutcome; held: Held } => {
  if (held.tag === 'Unread') return { outcome: 'Unread', held };
  let at = -1;
  for (let index = 0; index < held.passages.length && at < 0; index++)
    if (equal(held.passages[index] as Span, span)) at = index;
  if (at < 0) return { outcome: 'Absent', held };
  if (refused) return { outcome: 'Failed', held };
  return {
    outcome: 'Removed',
    held: {
      tag: 'Read',
      passages: [...held.passages.slice(0, at), ...held.passages.slice(at + 1)],
    },
  };
};
