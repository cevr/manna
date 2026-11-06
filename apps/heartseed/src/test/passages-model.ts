/* oxlint-disable effect/noTernary -- the model is written as plain branches over plain maps, apart from the app's Option-built code it judges. */

/**
 * The independent model of the corpus and the reader's passages, written
 * plainly from the spec's rules (hskjv K1, P1-P6) for the tests to judge
 * the app by. The corpus comes from the KJV's own rows (`readVerses`, the
 * source file as decoded), with the display rule written again here, one
 * character at a time; nothing here reads `src/kjv.ts`, `vite/kjv.ts` or
 * `src/passages.ts`.
 */

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
