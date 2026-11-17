/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): a test helper over plain arrays. */

/**
 * Find's reference model: a plain scan of every verse's words for the
 * query rule (`src/find/find.ts`), with no index, and the queries the
 * model-based test draws from the corpus itself. No verse's text is written
 * here: the queries are cut from the verses at run time, by seed.
 */

import { BIBLE_BOOKS } from '@manna/core/bible';
import { versesOf } from '@manna/heartseed/kjv';

import { queryOf, wordsOf } from '../find/words';
import type { Random } from './random';

/** A verse of the corpus as the model reads it. */
export interface ModelVerse {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly text: string;
  readonly words: ReadonlyArray<string>;
  readonly distinct: ReadonlyArray<string>;
}

/** Every verse of the corpus, in canon order. */
export const modelVerses = (): Array<ModelVerse> =>
  BIBLE_BOOKS.flatMap((book) =>
    Array.from({ length: book.chapters }, (_, at) => at + 1).flatMap((chapter) =>
      versesOf(book.number, chapter).map((text, at) => {
        const words = wordsOf(text);
        return {
          book: book.number,
          chapter,
          verse: at + 1,
          text,
          words,
          distinct: [...new Set(words)].sort(),
        };
      }),
    ),
  );

/**
 * The corpus as the model reads it, made by one scan of every verse's
 * words with no part of the pack: each verse as a line of its words
 * between spaces, and each word's verses in canon order.
 */
export interface ModelText {
  readonly lines: ReadonlyArray<string>;
  readonly versesOf: ReadonlyMap<string, ReadonlyArray<number>>;
  readonly vocabulary: ReadonlyArray<string>;
}

/** The lines and each word's verses of `verses`. */
export const modelText = (verses: ReadonlyArray<ModelVerse>): ModelText => {
  const versesOf = new Map<string, Array<number>>();
  verses.forEach((verse, index) => {
    for (const word of verse.distinct) {
      const list = versesOf.get(word);
      if (list === undefined) versesOf.set(word, [index]);
      else list.push(index);
    }
  });
  return {
    lines: verses.map((verse) => ` ${verse.words.join(' ')} `),
    versesOf,
    vocabulary: [...versesOf.keys()].sort(),
  };
};

/** The model's answer: the hits' verses (indexes into the corpus), in order, and how many verses hold every word. */
export interface ModelAnswer {
  readonly verses: ReadonlyArray<number>;
  readonly count: number;
}

/** The verses the query rule finds for `query`: those that hold each word (the last, while typed, as the start of any word), the phrase found in their line first. */
export const modelFind = (corpus: ModelText, query: string, limit: number): ModelAnswer => {
  const { words, typing } = queryOf(query);
  if (words.length === 0) return { verses: [], count: 0 };
  const holding = words.map((word, at) => {
    if (!typing || at < words.length - 1) return new Set(corpus.versesOf.get(word) ?? []);
    return new Set(
      corpus.vocabulary
        .filter((each) => each.startsWith(word))
        .flatMap((each) => corpus.versesOf.get(each) ?? []),
    );
  });
  const least = holding.reduce((a, b) => (b.size < a.size ? b : a));
  const all = [...least]
    .filter((verse) => holding.every((set) => set.has(verse)))
    .sort((a, b) => a - b);
  const phrase = ` ${words.join(' ')}${typing ? '' : ' '}`;
  const together = all.filter((verse) => corpus.lines[verse]?.includes(phrase) === true);
  const apart = all.filter((verse) => corpus.lines[verse]?.includes(phrase) !== true);
  return { verses: [...together, ...apart].slice(0, limit), count: all.length };
};

/** The stop words: the words in more than a quarter of all verses. */
export const modelStops = (verses: ReadonlyArray<ModelVerse>): Array<string> => {
  const counts = new Map<string, number>();
  for (const verse of verses)
    for (const word of verse.distinct) counts.set(word, (counts.get(word) ?? 0) + 1);
  return [...counts]
    .filter(([, count]) => count * 4 > verses.length)
    .map(([word]) => word)
    .sort();
};

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const MARKS = [', ', '; ', ': ', '. ', '! ', '? ', ' ', '  ', ' - '];

/** A query and how it was drawn. */
export interface Drawn {
  readonly kind: string;
  readonly query: string;
}

/** `count` queries drawn from the corpus by `random`: neighbouring words, their prefixes, words of two verses, stop words alone, a word the Bible lacks, and mixed case and marks. */
export const drawQueries = (
  random: Random,
  verses: ReadonlyArray<ModelVerse>,
  count: number,
): Array<Drawn> => {
  const stops = modelStops(verses);
  const vocabulary = new Set(verses.flatMap((verse) => verse.distinct));
  const someVerse = () => {
    for (;;) {
      const verse = random.pick(verses);
      if (verse.words.length > 0) return verse;
    }
  };
  const neighbours = () => {
    const verse = someVerse();
    const length = 1 + random.below(Math.min(4, verse.words.length));
    const first = random.below(verse.words.length - length + 1);
    return verse.words.slice(first, first + length);
  };
  const ending = () => (random.chance(0.3) ? ' ' : '');
  const draws: ReadonlyArray<() => Drawn> = [
    () => ({ kind: 'neighbours', query: neighbours().join(' ') + ending() }),
    () => {
      const words = neighbours();
      const lastWord = words.at(-1) ?? '';
      const cut = random.chance(0.4) ? 1 + random.below(2) : 1 + random.below(lastWord.length);
      return {
        kind: 'prefix',
        query: [...words.slice(0, -1), lastWord.slice(0, Math.min(cut, lastWord.length))].join(' '),
      };
    },
    () => ({
      kind: 'two verses',
      query: `${random.pick(someVerse().words)} ${random.pick(someVerse().words)}${ending()}`,
    }),
    () => {
      const verse = someVerse();
      const runs = verse.words
        .map((word, at) => (stops.includes(word) ? at : -1))
        .filter((at) => at >= 0);
      if (runs.length === 0) return { kind: 'stops', query: random.pick(stops) + ending() };
      const first = random.pick(runs);
      let end = first + 1;
      while (end < verse.words.length && end - first < 3 && stops.includes(verse.words[end] ?? ''))
        end += 1;
      return { kind: 'stops', query: verse.words.slice(first, end).join(' ') + ending() };
    },
    () => {
      for (;;) {
        const word = Array.from({ length: 5 + random.below(4) }, () =>
          random.pick([...LETTERS]),
        ).join('');
        if (![...vocabulary].some((known) => known.startsWith(word)))
          return {
            kind: 'absent',
            query: random.chance(0.5) ? word : `${neighbours().join(' ')} ${word}`,
          };
      }
    },
    () => {
      const words = neighbours().map((word) =>
        [...word].map((letter) => (random.chance(0.3) ? letter.toUpperCase() : letter)).join(''),
      );
      const joined = words
        .map((word, at) => (at === 0 ? word : random.pick(MARKS) + word))
        .join('');
      return {
        kind: 'mixed',
        query:
          (random.chance(0.3) ? random.pick(['"', '(', ' ']) : '') +
          joined +
          random.pick(['', '', '.', ',', '?']),
      };
    },
  ];
  return Array.from({ length: count }, (_, at) => (draws[at % draws.length] ?? draws[0])!());
};
