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
  /** Each chapter's verse count, its highest verse number, keyed as `chapters`. */
  readonly lengths: ReadonlyMap<string, number>;
  /** Each book's chapter count, by book number. */
  readonly counts: ReadonlyMap<number, number>;
  /** The books in canon order. */
  readonly books: ReadonlyArray<number>;
}

/** A chapter's shown verses from its rows, each verse placed by its own number. */
const versesOfRows = (rows: ReadonlyArray<Row>): ReadonlyArray<string> => {
  const list: Array<string> = [];
  for (const row of rows) list[row.verse - 1] = shown(row.text);
  return list;
};

/**
 * The model's corpus over `rows`, each verse placed by its own numbers. A
 * chapter's verses are shown the first time it is read and kept, so a test
 * that reads a few chapters does not show the whole canon.
 */
export const corpusOf = (rows: ReadonlyArray<Row>): Corpus => {
  const grouped = new Map<string, Array<Row>>();
  const counts = new Map<number, number>();
  const lengths = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.book}:${row.chapter}`;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
    lengths.set(key, Math.max(lengths.get(key) ?? 0, row.verse));
    counts.set(row.book, Math.max(counts.get(row.book) ?? 0, row.chapter));
  }
  const kept = new Map<string, ReadonlyArray<string>>();
  const get = (key: string) => {
    const held = kept.get(key);
    if (held !== undefined) return held;
    const chapter = grouped.get(key);
    if (chapter === undefined) return undefined;
    const verses = versesOfRows(chapter);
    kept.set(key, verses);
    return verses;
  };
  const all = () => new Map([...grouped.keys()].map((key) => [key, get(key) ?? []]));
  const chapters: ReadonlyMap<string, ReadonlyArray<string>> = {
    size: grouped.size,
    get,
    has: (key) => grouped.has(key),
    keys: () => grouped.keys(),
    values: () => all().values(),
    entries: () => all().entries(),
    forEach: (each) => all().forEach(each),
    [Symbol.iterator]: () => all().entries(),
  };
  return { chapters, lengths, counts, books: [...counts.keys()].toSorted((a, b) => a - b) };
};

/** The shown verses of a chapter, none for one the corpus does not hold. */
export const versesIn = (corpus: Corpus, book: number, chapter: number): ReadonlyArray<string> =>
  corpus.chapters.get(`${book}:${chapter}`) ?? [];

/** A chapter's verse count (`versesIn`'s length) without showing its verses, 0 for one the corpus does not hold. */
export const verseCountIn = (corpus: Corpus, book: number, chapter: number): number =>
  corpus.lengths.get(`${book}:${chapter}`) ?? 0;

/** The store key of the passages (P3). */
export const KEY = 'heartseed/passages';

/** hsminlist: the single verses' key. */
export const SINGLES = 'heartseed/singles';
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

/** The passages as the model holds them, with the lists held beside them (hshandbook R2; absent is none) and the single verses, each a one-verse span (hsminlist; absent is none). */
export type Held =
  | {
      readonly tag: 'Read';
      readonly passages: ReadonlyArray<Span>;
      readonly lists?: ReadonlyArray<string>;
      readonly singles?: ReadonlyArray<Span>;
    }
  | { readonly tag: 'Unread' };

/** hshandbook R3: the passages and the lists held, counted together. */
const countHeld = (held: Held & { readonly tag: 'Read' }) =>
  held.passages.length + (held.lists === undefined ? 0 : held.lists.length);

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
  span.last <= verseCountIn(corpus, span.book, span.chapter);

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

/** P3: the passages a launch reads from the stored text (`undefined` for no key) after `failedReads` failed `get`s, before hsminlist's upgrade (`migrateRule`). */
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

export type JoinOutcome = 'Added' | 'Held' | 'Full' | 'Invalid' | 'Unread' | 'Failed';

/** hsminlist: a join's answer and the view after it, `refused` when its write fails: each verse of `span` not single already goes after the single verses held; every one single already is `Held`, writing nothing; past 20 single verses is `Full`. */
export const joinRule = (
  corpus: Corpus,
  held: Held,
  span: Span,
  refused: boolean,
): { outcome: JoinOutcome; held: Held } => {
  if (held.tag === 'Unread') return { outcome: 'Unread', held };
  if (!addable(corpus, span)) return { outcome: 'Invalid', held };
  const singles = [...(held.singles ?? [])];
  const known = new Set(singles.map(spanRef));
  for (let verse = span.first; verse <= span.last; verse++) {
    const one = { book: span.book, chapter: span.chapter, first: verse, last: verse };
    if (!known.has(spanRef(one))) singles.push(one);
  }
  if (singles.length === (held.singles ?? []).length) return { outcome: 'Held', held };
  if (singles.length > 20) return { outcome: 'Full', held };
  if (refused) return { outcome: 'Failed', held };
  return { outcome: 'Added', held: { ...held, singles } };
};

/** hsminlist's upgrade at a launch: each stored passage of one verse moves, in stored order, after the single verses held, each verse once; `moved` is how many passages moved (none: nothing is written). */
export const migrateRule = (held: Held): { held: Held; moved: number } => {
  if (held.tag === 'Unread') return { held, moved: 0 };
  const singles: Span[] = [];
  const add = (span: Span) => {
    if (!singles.some((each) => storedText([each]) === storedText([span]))) singles.push(span);
  };
  for (const span of held.singles ?? []) add(span);
  const moved = held.passages.filter((span) => span.first === span.last);
  for (const span of moved) add(span);
  const passages = held.passages.filter((span) => span.first !== span.last);
  return { held: { ...held, passages, singles }, moved: moved.length };
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

export type AddOutcome = 'Added' | 'Full' | 'Invalid' | 'Short' | 'Unread' | 'Failed';
export type RemoveOutcome = 'Removed' | 'Absent' | 'Unread' | 'Failed';

/** hsminlist: a list the reader makes holds at least 3 verses. */
export const LEAST_VERSES = 3;

/** P4, with hshandbook R3 and hsminlist: an add's answer and the view after it, `refused` when its write fails; a span of fewer than 3 verses is `Short`; the cap counts the lists held too (never the single verses), and they stay as held. */
export const addRule = (
  corpus: Corpus,
  held: Held,
  span: Span,
  refused: boolean,
): { outcome: AddOutcome; held: Held } => {
  if (held.tag === 'Unread') return { outcome: 'Unread', held };
  if (!addable(corpus, span)) return { outcome: 'Invalid', held };
  if (span.last - span.first + 1 < LEAST_VERSES) return { outcome: 'Short', held };
  if (countHeld(held) >= CAP_PASSAGES) return { outcome: 'Full', held };
  if (refused) return { outcome: 'Failed', held };
  const copy = { book: span.book, chapter: span.chapter, first: span.first, last: span.last };
  return { outcome: 'Added', held: { ...held, passages: [...held.passages, copy] } };
};

/** A piece as the model holds it: a verse the session plans over. */
export interface ModelTextPiece {
  readonly reference: string;
  readonly text: string;
  readonly words: number;
  readonly group: string;
}

/** P6: the app's own pieces, then each held passage's verses in passage and verse order, each whole and each reference kept at its first place only; `words` counts a verse's words as the matcher does. */
export const piecesRule = (
  corpus: Corpus,
  own: ReadonlyArray<ModelTextPiece>,
  held: Held,
  words: (text: string) => number,
): ModelTextPiece[] => {
  const all: ModelTextPiece[] = [...own];
  if (held.tag === 'Read')
    for (const span of held.passages) {
      const verses = versesIn(corpus, span.book, span.chapter);
      for (let verse = span.first; verse <= span.last; verse++) {
        const text = verses[verse - 1] as string;
        all.push({
          reference: verseRef(span.book, span.chapter, verse),
          text,
          words: words(text),
          group: spanRef(span),
        });
      }
    }
  const out: ModelTextPiece[] = [];
  const named = new Set<string>();
  for (const piece of all) {
    if (named.has(piece.reference)) continue;
    named.add(piece.reference);
    out.push(piece);
  }
  return out;
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
      ...held,
      passages: [...held.passages.slice(0, at), ...held.passages.slice(at + 1)],
    },
  };
};
