/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): the index decodes into plain arrays, a value past a list's end read as a default. */

/**
 * The word index as find reads it: nothing of the pack is decoded when the
 * index is made. A letter's words are decoded when a word of that letter
 * is first asked for, a word's list as far as it is first read, and the
 * verse table and the chapters when first needed; each is kept for the
 * launch (the words, the table and the chapters by the pack itself, so a
 * second index over it, as the tests make, shares them). `counts` says what was decoded: `entries`, the list entries
 * (tokens) decoded; `table`, the verse table's and chapters' rows decoded;
 * `texts`, the verses whose text find read (find counts them).
 */

import { BIBLE_BOOKS } from '@manna/core/bible';

import {
  FIND_FORMAT,
  frontDecoded,
  hasBit,
  readVarint,
  type FindLetter,
  type FindPack,
} from './pack';

/** What the index has decoded, and the texts find read, since it was made. */
export interface FindCounts {
  entries: number;
  table: number;
  texts: number;
}

/** A word's list: its tokens in order, decoded as far as `upTo` has been asked. */
export interface WordList {
  readonly values: Array<number>;
  /** Decodes until the last value is at least `limit`, or the list ends; the values decoded. */
  readonly upTo: (limit: number) => Array<number>;
  /** Decodes the whole list. */
  readonly all: () => Array<number>;
}

/** A letter's words, sorted, and where each word's list lies in the letter's lists. */
interface Letter {
  readonly words: ReadonlyArray<string>;
  readonly starts: ReadonlyArray<number>;
  readonly lists: string;
  readonly decoded: Map<number, WordList>;
}

/** The verse table: where each verse's tokens start, and where its row of tabled words starts in `table` (each verse's ends where the next one's starts). */
interface Table {
  readonly tokenStarts: Int32Array;
  readonly tabledAt: Int32Array;
}

/** A verse's place in the canon. */
export interface VersePlace {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
}

/** The index over a pack. */
export interface FindIndex {
  readonly size: number;
  readonly counts: FindCounts;
  /** The tabled words (the stop words, and the words nearly as common), by id. */
  readonly tabled: ReadonlyArray<string>;
  /** Whether the tabled word of `id` is in `verse`. */
  readonly tabledIn: (id: number, verse: number) => boolean;
  /** The bitmap of the verses the tabled word of `id` is in. */
  readonly marksOf: (id: number) => string;
  /** The bitmap of a prefix whose list is never decoded whole, if the prefix is one. */
  readonly classOf: (prefix: string) => string | undefined;
  /** Whether `verse` is in a class's bitmap. */
  readonly inClass: (bitmap: string, verse: number) => boolean;
  /** The words of the index that start with `prefix`, in order. */
  readonly wordsFrom: (prefix: string) => Array<string>;
  /** Whether the index holds `word`. */
  readonly holds: (word: string) => boolean;
  /** The list of `word`, which the index holds and does not table. */
  readonly listOf: (word: string) => WordList;
  /** The first token of `verse`, and of the verse after the last for `size`. */
  readonly tokenStart: (verse: number) => number;
  /** The verse the token is in. */
  readonly verseOf: (token: number) => number;
  /** Writes the tabled words of `verse` into `places` (each its place among the verse's tokens) and `ids`, in order, as far as they hold; their count. */
  readonly tabledInto: (verse: number, places: Int32Array, ids: Int32Array) => number;
  /** The book, chapter and verse number of `verse`. */
  readonly placeOf: (verse: number) => VersePlace;
}

/** Where each book's chapters start among the canon's chapters, by book number. */
const BOOK_STARTS: ReadonlyArray<readonly [number, number]> = BIBLE_BOOKS.map((book, at) => [
  BIBLE_BOOKS.slice(0, at).reduce((sum, before) => sum + before.chapters, 0),
  book.number,
]);

const CHAPTER_STARTS: ReadonlyArray<number> = BOOK_STARTS.map(([start]) => start);

/** Each pack's verse table and chapters once decoded, which every index over it shares: they never change. */
const TABLES = new WeakMap<FindPack, Table>();
const CHAPTERS = new WeakMap<FindPack, Int32Array>();

/** A letter's words and where each word's list starts. */
interface LetterWords {
  readonly words: ReadonlyArray<string>;
  readonly starts: ReadonlyArray<number>;
}

/** Each packed letter's words once decoded, shared as the table is. */
const WORDS = new WeakMap<FindLetter, LetterWords>();

const wordsOfLetter = (packed: FindLetter): LetterWords => {
  const lens = { at: 0 };
  const words = frontDecoded(packed.words);
  const starts: Array<number> = [0];
  for (let at = 0; at < words.length; at += 1)
    starts.push((starts[at] ?? 0) + readVarint(packed.lens, lens));
  return { words, starts };
};

/** The last index of `values` (sorted) that is at most `value`; -1 for none. */
const lastAtMost = (values: ArrayLike<number>, value: number) => {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((values[middle] ?? 0) <= value) low = middle + 1;
    else high = middle;
  }
  return low - 1;
};

/** The first index of `words` (sorted) whose word is at least `word`. */
const firstFrom = (words: ReadonlyArray<string>, word: string) => {
  let low = 0;
  let high = words.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((words[middle] ?? '') < word) low = middle + 1;
    else high = middle;
  }
  return low;
};

/** The index over `pack`, decoding nothing yet. */
export const findIndexOf = (pack: FindPack): FindIndex => {
  const counts: FindCounts = { entries: 0, table: 0, texts: 0 };
  const known = pack.format === FIND_FORMAT;
  const letters = new Map<string, Letter>();
  let table: Table | undefined;
  let chapterFirsts: Int32Array | undefined;

  const letterOf = (first: string): Letter | undefined => {
    const kept = letters.get(first);
    if (kept !== undefined) return kept;
    const packed = known ? pack.letters[first] : undefined;
    if (packed === undefined) return undefined;
    const shared = WORDS.get(packed) ?? wordsOfLetter(packed);
    WORDS.set(packed, shared);
    const letter: Letter = { ...shared, lists: packed.lists, decoded: new Map() };
    letters.set(first, letter);
    return letter;
  };

  const listAt = (letter: Letter, at: number): WordList => {
    const kept = letter.decoded.get(at);
    if (kept !== undefined) return kept;
    const end = letter.starts[at + 1] ?? 0;
    const cursor = { at: letter.starts[at] ?? 0 };
    const values: Array<number> = [];
    let last = -1;
    const upTo = (limit: number) => {
      while (cursor.at < end && (last < 0 || last < limit)) {
        last += readVarint(letter.lists, cursor) + 1;
        values.push(last);
        counts.entries += 1;
      }
      return values;
    };
    const list: WordList = { values, upTo, all: () => upTo(Number.POSITIVE_INFINITY) };
    letter.decoded.set(at, list);
    return list;
  };

  const tableOf = (): Table => {
    table ??= TABLES.get(pack);
    if (table !== undefined) return table;
    const size = pack.verses;
    const tokenStarts = new Int32Array(size + 1);
    const tabledAt = new Int32Array(size + 1);
    const cursor = { at: 0 };
    for (let verse = 0; verse < size; verse += 1) {
      tokenStarts[verse + 1] = (tokenStarts[verse] ?? 0) + readVarint(pack.sizes, cursor);
      tabledAt[verse + 1] = (tabledAt[verse] ?? 0) + readVarint(pack.sizes, cursor);
    }
    counts.table += size;
    table = { tokenStarts, tabledAt };
    TABLES.set(pack, table);
    return table;
  };

  const chaptersOf = (): Int32Array => {
    chapterFirsts ??= CHAPTERS.get(pack);
    if (chapterFirsts !== undefined) return chapterFirsts;
    const cursor = { at: 0 };
    const firsts: Array<number> = [];
    let verse = 0;
    while (cursor.at < pack.chapters.length) {
      firsts.push(verse);
      verse += readVarint(pack.chapters, cursor);
    }
    counts.table += firsts.length;
    chapterFirsts = Int32Array.from(firsts);
    CHAPTERS.set(pack, chapterFirsts);
    return chapterFirsts;
  };

  const found = (word: string): readonly [Letter, number] | undefined => {
    const letter = letterOf(word.charAt(0));
    if (letter === undefined) return undefined;
    const at = firstFrom(letter.words, word);
    return letter.words[at] === word ? [letter, at] : undefined;
  };

  return {
    size: known ? pack.verses : 0,
    counts,
    tabled: known ? pack.tabled : [],
    tabledIn: (id, verse) => hasBit(pack.marks[id] ?? '', verse),
    marksOf: (id) => (known ? (pack.marks[id] ?? '') : ''),
    classOf: (prefix) => (known ? pack.classes[prefix] : undefined),
    inClass: hasBit,
    wordsFrom: (prefix) => {
      const letter = letterOf(prefix.charAt(0));
      if (letter === undefined || prefix === '') return [];
      const words: Array<string> = [];
      for (let at = firstFrom(letter.words, prefix); at < letter.words.length; at += 1) {
        const word = letter.words[at] ?? '';
        if (!word.startsWith(prefix)) break;
        words.push(word);
      }
      return words;
    },
    holds: (word) => found(word) !== undefined,
    listOf: (word) => {
      const place = found(word);
      if (place === undefined) return { values: [], upTo: () => [], all: () => [] };
      return listAt(place[0], place[1]);
    },
    tokenStart: (verse) => tableOf().tokenStarts[verse] ?? 0,
    verseOf: (token) => lastAtMost(tableOf().tokenStarts, token),
    tabledInto: (verse, places, ids) => {
      const { tabledAt } = tableOf();
      const tabled = pack.tabled.length;
      const cursor = { at: tabledAt[verse] ?? 0 };
      const end = tabledAt[verse + 1] ?? 0;
      const room = Math.min(places.length, ids.length);
      let count = 0;
      let before = -1;
      while (cursor.at < end && count < room) {
        const value = readVarint(pack.table, cursor);
        before += Math.floor(value / tabled) + 1;
        places[count] = before;
        ids[count] = value % tabled;
        count += 1;
      }
      return count;
    },
    placeOf: (verse) => {
      const firsts = chaptersOf();
      const chapterIndex = lastAtMost(firsts, verse);
      const [start, book] = BOOK_STARTS[lastAtMost(CHAPTER_STARTS, chapterIndex)] ?? [0, 0];
      return {
        book,
        chapter: chapterIndex - start + 1,
        verse: verse - (firsts[chapterIndex] ?? 0) + 1,
      };
    },
  };
};
