/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): find walks plain arrays, a value past an array's end read as a default. */

/**
 * Find in the reader: a query answers the place it names, then the verses
 * that hold its words, from the word index (`index.ts` over the pack
 * `tools/find.ts` writes), offline and as the reader types.
 *
 * - **A place first.** A query `parseBibleQuery` reads as a book, a
 *   chapter, a chapter range, a verse or a range of verses answers that
 *   place (`places`, at most one).
 * - **Then words** (`words.ts`): every word of the query is in the verse,
 *   the last as a prefix while it is being typed. The verses where the
 *   words stand together in order come first, then the rest, each group in
 *   canon order: `limit` hits at most, and `more` the count left out.
 * - **A hit** is its reference and the verse's words cut around the first
 *   match (`cutOf`): the phrase where it stands together, else the first
 *   word of the query found.
 * - Nothing found says `NOTHING_LINE`; an empty query answers nothing.
 *   With no index yet (`placesOnly`), a place still answers, and words say
 *   `DOWNLOADING_LINE`.
 *
 * The work is bounded by the index, never by a scan of the text. Each word
 * of the query is a term: a word's list, decoded whole; a tabled word (a
 * stop word or one nearly as common), whose verses are a bitmap and whose
 * places are in the verse table; a prefix of several words, their lists
 * merged; a prefix of many tokens (a class, `BIG_CLASS`), a bitmap. The
 * verses that hold every term are walked from the smallest set. The phrase
 * check places the listed and tabled terms first, then checks a class's
 * place in the verse's text for at most `SPARSE` verses, and past them by
 * its words' lists, read only as far as the walk has come. Only those
 * texts and the hits' are read.
 */

import { BIBLE_BOOKS, parseBibleQuery } from '@manna/core/bible';
import { versesOf } from '@manna/heartseed/kjv';
import { passageReference, verseReference } from '@manna/heartseed/passages';

import type { FindIndex, WordList } from './index';
import { bitsOf, versesInAll } from './pack';
import { boundsInto, queryOf, tokensOf, wordIs } from './words';

/** A place the query names: Go to opens it at `verse` (0 for the chapter's top). */
export interface FindPlace {
  readonly label: string;
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
}

/** A verse that holds the query's words, cut around its first match. */
export interface FindHit {
  readonly reference: string;
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly before: string;
  readonly match: string;
  readonly after: string;
}

/** What find shows for a query. */
export interface FindShown {
  readonly query: string;
  readonly places: Array<FindPlace>;
  readonly hits: Array<FindHit>;
  readonly more: number;
  readonly line: string;
}

/** What find says when no place and no verse answers a query that has words. */
export const NOTHING_LINE = 'No verse has those words.';

/** What find says to words before the word index is on the phone: it finds a reference meanwhile. */
export const DOWNLOADING_LINE =
  'Word search is still downloading. A reference like John 3:16 works now.';

/** The words a hit shows before its match, at most. */
export const CUT_BEFORE = 40;

/** A hit's words in all, at most, unless its match alone is longer. */
export const CUT_ALL = 120;

/** All-words verses at most this many: a prefix of many tokens is checked in their text, not its lists. */
export const SPARSE = 300;

/** The query words' terms kept between queries, so typing on asks the index for none it answered. */
const TERMS_KEPT = 64;

/** A query's word as the index answers it. */
type Term =
  | { readonly kind: 'none'; readonly word: string; readonly prefix: boolean }
  | {
      readonly kind: 'list';
      readonly word: string;
      readonly prefix: boolean;
      readonly tokens: ArrayLike<number>;
      readonly verses: ArrayLike<number>;
      readonly tabledIds: ReadonlyArray<number>;
    }
  | {
      readonly kind: 'tabled';
      readonly word: string;
      readonly prefix: boolean;
      readonly id: number;
      readonly bitmap: string;
    }
  | {
      readonly kind: 'prefix';
      readonly word: string;
      readonly prefix: boolean;
      readonly tokens: ArrayLike<number>;
      readonly verses: ArrayLike<number>;
      readonly tabledIds: ReadonlyArray<number>;
    }
  | {
      readonly kind: 'class';
      readonly word: string;
      readonly prefix: boolean;
      readonly bitmap: string;
      readonly members: ReadonlyArray<WordList>;
      readonly tabledIds: ReadonlyArray<number>;
    };

/** The tabled words a term matches, by id. */
const tabledIdsOf = (term: Term): ReadonlyArray<number> => {
  if (term.kind === 'tabled') return [term.id];
  if (term.kind === 'none') return [];
  return term.tabledIds;
};

/** Whether a term stands for many words' lists, read in the phrase check only as far as needed: a prefix's. */
const spread = (term: Term) => term.kind === 'class';

/** Whether a word of a verse is the term's. */
const matches = (term: Term, word: string) =>
  term.prefix ? word.startsWith(term.word) : word === term.word;

/** The first index of `values` (sorted) at least `value`. */
const firstFrom = (values: ArrayLike<number>, value: number) => {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((values[middle] ?? 0) < value) low = middle + 1;
    else high = middle;
  }
  return low;
};

/** The cut of `text` around its match from `start` to `end`: at most `CUT_BEFORE` before, the match whole, `CUT_ALL` in all, at word edges. */
export const cutOf = (text: string, start: number, end: number) => {
  let from = start;
  if (start > CUT_BEFORE) {
    from = start - CUT_BEFORE;
    if (text.charAt(from - 1) !== ' ') {
      const space = text.indexOf(' ', from);
      from = space < 0 || space >= start ? start : space + 1;
    }
  }
  const room = CUT_ALL - (start - from) - (end - start);
  let to = end;
  if (text.length - end <= room) to = text.length;
  else if (room > 0) {
    const space = text.lastIndexOf(' ', end + room);
    to = space <= end ? end : space;
  }
  return {
    before: text.slice(from, start),
    match: text.slice(start, end),
    after: text.slice(end, to),
  };
};

/** The place `query` names, if it names one the canon has. */
const placesOf = (query: string): Array<FindPlace> => {
  const parsed = parseBibleQuery(query);
  const name = (book: number) => BIBLE_BOOKS.find((each) => each.number === book)?.name ?? '';
  switch (parsed._tag) {
    case 'fullBook':
      return [{ label: name(parsed.ref.book), book: parsed.ref.book, chapter: 1, verse: 0 }];
    case 'chapter':
      return [
        {
          label: `${name(parsed.ref.book)} ${parsed.ref.chapter}`,
          book: parsed.ref.book,
          chapter: parsed.ref.chapter,
          verse: 0,
        },
      ];
    case 'chapterRange':
      return [
        {
          label: `${name(parsed.start.book)} ${parsed.start.chapter}-${parsed.end.chapter}`,
          book: parsed.start.book,
          chapter: parsed.start.chapter,
          verse: 0,
        },
      ];
    case 'single': {
      const { book, chapter, verse } = parsed.ref;
      if (verse > versesOf(book, chapter).length) return [];
      return [{ label: verseReference(book, chapter, verse), book, chapter, verse }];
    }
    case 'verseRange': {
      const { book, chapter, verse } = parsed.ref.start;
      const last = Math.min(parsed.ref.end.verse, versesOf(book, chapter).length);
      if (verse > last) return [];
      return [
        { label: passageReference({ book, chapter, first: verse, last }), book, chapter, verse },
      ];
    }
    case 'search':
      return [];
  }
};

/** What find shows with no word index (none downloaded yet, or one of another format): the place a query names, and for a query with words, that word search is downloading. */
export const placesOnly = (query: string): FindShown => {
  const { words } = queryOf(query);
  if (words.length === 0) return { query, places: [], hits: [], more: 0, line: '' };
  return { query, places: placesOf(query), hits: [], more: 0, line: DOWNLOADING_LINE };
};

/** Every token of `lists`, each decoded whole, sorted. */
const mergedOf = (lists: ReadonlyArray<WordList>): Int32Array => {
  const all = lists.map((list) => list.all());
  const tokens = new Int32Array(all.reduce((sum, list) => sum + list.length, 0));
  let filled = 0;
  for (const list of all) {
    tokens.set(list, filled);
    filled += list.length;
  }
  return tokens.sort();
};

/** The verses in `one` or `other` (each sorted, each verse once), sorted, each once. */
const unionOf = (one: Int32Array, other: Int32Array): Int32Array => {
  const union = new Int32Array(one.length + other.length);
  let left = 0;
  let right = 0;
  let size = 0;
  while (left < one.length || right < other.length) {
    const a = left < one.length ? (one[left] ?? 0) : Number.POSITIVE_INFINITY;
    const b = right < other.length ? (other[right] ?? 0) : Number.POSITIVE_INFINITY;
    const least = Math.min(a, b);
    if (a === least) left += 1;
    if (b === least) right += 1;
    union[size] = least;
    size += 1;
  }
  return union.subarray(0, size);
};

/** The phrase check's buffers, reused verse after verse: a term's marks, the verse's tabled places and ids, the firsts still standing, and the text's word bounds. */
interface Scratch {
  readonly room: number;
  readonly marked: Uint8Array;
  readonly places: Int32Array;
  readonly ids: Int32Array;
  readonly firsts: Int32Array;
  readonly starts: Int32Array;
  readonly ends: Int32Array;
}

const scratchOf = (room: number): Scratch => ({
  room,
  marked: new Uint8Array(room),
  places: new Int32Array(room),
  ids: new Int32Array(room),
  firsts: new Int32Array(room),
  starts: new Int32Array(room),
  ends: new Int32Array(room),
});

/** The verse being checked: its first token, its count of tokens, and how many tabled words `Scratch` holds for it. */
interface VerseAt {
  readonly start: number;
  readonly length: number;
  readonly tabled: number;
}

/** Marks in `scratch.marked` the verse's tokens that are the term's: its tabled words (`tabledBy`, by id) and its list's. */
const markTerm = (scratch: Scratch, verse: VerseAt, term: Term, tabledBy?: Uint8Array) => {
  const { marked, places, ids } = scratch;
  marked.fill(0, 0, verse.length);
  if (tabledBy !== undefined)
    for (let each = 0; each < verse.tabled; each += 1)
      if (tabledBy[ids[each] ?? 0] === 1) marked[places[each] ?? 0] = 1;
  if (term.kind === 'list' || term.kind === 'prefix') markTokens(scratch, verse, term.tokens);
};

/** Marks in `scratch.marked` the verse's tokens among `tokens` (sorted). */
const markTokens = (scratch: Scratch, verse: VerseAt, tokens: ArrayLike<number>) => {
  const end = verse.start + verse.length;
  for (let each = firstFrom(tokens, verse.start); each < tokens.length; each += 1) {
    const token = tokens[each] ?? end;
    if (token >= end) return;
    scratch.marked[token - verse.start] = 1;
  }
};

/**
 * The firsts below `count` where every fixed term (`fixed`, the terms' places, each a tabled word) stands, read
 * from the verse's tabled words alone, sorted by place: the first fixed term's entries anchor them, and each other
 * fixed term is the entry at its place after it. Written into `scratch.firsts`; how many.
 */
const firstsByTable = (
  scratch: Scratch,
  verse: VerseAt,
  count: number,
  fixed: ReadonlyArray<number>,
  tabledBy: ReadonlyArray<Uint8Array>,
) => {
  const { places, ids, firsts } = scratch;
  const [anchor = 0] = fixed;
  const anchored = tabledBy[anchor];
  let found = 0;
  if (anchored === undefined) return found;
  for (let each = 0; each < verse.tabled; each += 1) {
    const first = (places[each] ?? 0) - anchor;
    if (first < 0 || first >= count || anchored[ids[each] ?? 0] !== 1) continue;
    let next = each;
    const stands = fixed.every((at) => {
      const place = first + at;
      while (next < verse.tabled && (places[next] ?? 0) < place) next += 1;
      return next < verse.tabled && places[next] === place && tabledBy[at]?.[ids[next] ?? 0] === 1;
    });
    if (!stands) continue;
    firsts[found] = first;
    found += 1;
  }
  return found;
};

/** Keeps the first `count` firsts whose word `at` places on is marked; how many are kept. */
const keepMarked = (scratch: Scratch, count: number, at: number) => {
  const { firsts, marked } = scratch;
  let kept = 0;
  for (let each = 0; each < count; each += 1) {
    const first = firsts[each] ?? 0;
    if (marked[first + at] !== 1) continue;
    firsts[kept] = first;
    kept += 1;
  }
  return kept;
};

/** Keeps the first `count` firsts where each spread term's word in `text` is the term's, read in place; how many are kept. */
const keepByText = (scratch: Scratch, terms: ReadonlyArray<Term>, count: number, text: string) => {
  const { firsts, starts, ends } = scratch;
  const words = boundsInto(text, starts, ends, (firsts[count - 1] ?? 0) + terms.length);
  const standsAt = (first: number) =>
    terms.every((term, at) => {
      const place = first + at;
      if (!spread(term)) return true;
      if (place >= words) return false;
      return wordIs(text, starts[place] ?? 0, ends[place] ?? 0, term.word, term.prefix);
    });
  let kept = 0;
  for (let each = 0; each < count; each += 1) {
    const first = firsts[each] ?? 0;
    if (!standsAt(first)) continue;
    firsts[kept] = first;
    kept += 1;
  }
  return kept;
};

/** Find over `index`: `findRead` reads the corpus's verses to cut its hits. */
export const findWith = (index: FindIndex) => {
  /** The verses of sorted tokens, each once, in order. */
  const versesOfTokens = (tokens: ArrayLike<number>) => {
    const verses: Array<number> = [];
    let end = -1;
    for (let at = 0; at < tokens.length; at += 1) {
      const token = tokens[at] ?? 0;
      if (token < end) continue;
      const verse = index.verseOf(token);
      verses.push(verse);
      end = index.tokenStart(verse + 1);
    }
    return Int32Array.from(verses);
  };

  const termsKept = new Map<string, Term>();

  /** The term of a query's word; the last `TERMS_KEPT` asked are kept. */
  const termOf = (word: string, prefix: boolean): Term => {
    const key = `${word}${prefix ? '*' : '='}`;
    const term = termsKept.get(key) ?? termMade(word, prefix);
    termsKept.delete(key);
    termsKept.set(key, term);
    if (termsKept.size > TERMS_KEPT) termsKept.delete(termsKept.keys().next().value ?? '');
    return term;
  };

  const wordVerses = new Map<string, Int32Array>();
  const tabledVerses = new Map<number, Int32Array>();

  /** The verses of an untabled word, from its whole list; kept for the launch. */
  const versesOfWord = (word: string) => {
    const kept = wordVerses.get(word);
    if (kept !== undefined) return kept;
    const made = versesOfTokens(index.listOf(word).all());
    wordVerses.set(word, made);
    return made;
  };

  /** The verses of the tabled word of `id`, from its bitmap; kept for the launch. */
  const versesOfTabled = (id: number) => {
    const kept = tabledVerses.get(id);
    if (kept !== undefined) return kept;
    const made = bitsOf(index.marksOf(id), index.size);
    tabledVerses.set(id, made);
    return made;
  };

  const classTokens = new Map<string, Int32Array>();

  /** A class's untabled words' tokens, merged once its phrase check has read `SPARSE` texts; kept for the launch. */
  const tokensOfClass = (term: Extract<Term, { kind: 'class' }>) => {
    const kept = classTokens.get(term.word);
    if (kept !== undefined) return kept;
    const made = mergedOf(term.members);
    classTokens.set(term.word, made);
    return made;
  };

  const termMade = (word: string, prefix: boolean): Term => {
    if (!prefix) {
      const id = index.tabled.indexOf(word);
      if (id >= 0) return { kind: 'tabled', word, prefix, id, bitmap: index.marksOf(id) };
      if (!index.holds(word)) return { kind: 'none', word, prefix };
      return {
        kind: 'list',
        word,
        prefix,
        tokens: index.listOf(word).all(),
        verses: versesOfWord(word),
        tabledIds: [],
      };
    }
    const members = index.wordsFrom(word);
    if (members.length === 0) return { kind: 'none', word, prefix };
    const tabledIds = members.flatMap((member) => {
      const id = index.tabled.indexOf(member);
      return id >= 0 ? [id] : [];
    });
    const words = members.filter((member) => !index.tabled.includes(member));
    const bitmap = index.classOf(word);
    if (bitmap !== undefined)
      return {
        kind: 'class',
        word,
        prefix,
        bitmap,
        members: words.map(index.listOf),
        tabledIds,
      };
    const [only] = words;
    if (words.length === 1 && tabledIds.length === 0 && only !== undefined)
      return {
        kind: 'list',
        word,
        prefix,
        tokens: index.listOf(only).all(),
        verses: versesOfWord(only),
        tabledIds,
      };
    const tokens = mergedOf(words.map(index.listOf));
    const verses = [versesOfTokens(tokens), ...tabledIds.map(versesOfTabled)].reduce(unionOf);
    return { kind: 'prefix', word, prefix, tokens, verses, tabledIds };
  };

  /** The verses that hold every term, in canon order: walked from the smallest listed term's verses, or, with none, the terms' bitmaps read together. */
  const allWordsOf = (terms: ReadonlyArray<Term>): Array<number> => {
    if (terms.some((term) => term.kind === 'none')) return [];
    const listed = terms.filter(
      (term): term is Extract<Term, { kind: 'list' | 'prefix' }> =>
        term.kind === 'list' || term.kind === 'prefix',
    );
    const bitmaps = terms.flatMap((term) =>
      term.kind === 'tabled' || term.kind === 'class' ? [term.bitmap] : [],
    );
    const driver = listed.reduce<(typeof listed)[number] | undefined>(
      (least, term) =>
        least === undefined || term.verses.length < least.verses.length ? term : least,
      undefined,
    );
    if (driver === undefined) return versesInAll(bitmaps, index.size);
    const others = listed.filter((term) => term !== driver);
    const pointers = others.map(() => 0);
    const found: Array<number> = [];
    for (let at = 0; at < driver.verses.length; at += 1) {
      const verse = driver.verses[at] ?? 0;
      const held = others.every((term, each) => {
        let pointer = pointers[each] ?? 0;
        while (pointer < term.verses.length && (term.verses[pointer] ?? 0) < verse) pointer += 1;
        pointers[each] = pointer;
        return term.verses[pointer] === verse;
      });
      if (held && bitmaps.every((bitmap) => index.inClass(bitmap, verse))) found.push(verse);
    }
    return found;
  };

  /** The words of `verse`, its text read and counted once per query. */
  const textOf = (verse: number, read: Set<number>) => {
    const place = index.placeOf(verse);
    if (!read.has(verse)) {
      read.add(verse);
      index.counts.texts += 1;
    }
    return versesOf(place.book, place.chapter)[place.verse - 1] ?? '';
  };

  /** The verses of `found` where the terms stand together in order, in order, until `limit` are found. */
  const phrasesOf = (
    terms: ReadonlyArray<Term>,
    found: ReadonlyArray<number>,
    limit: number,
    read: Set<number>,
  ) => {
    const classed = terms.some(spread);
    const tabledUsed = terms.some((term) => tabledIdsOf(term).length > 0);
    const tabledBy = terms.map((term) => {
      const of = new Uint8Array(index.tabled.length);
      for (const id of tabledIdsOf(term)) of[id] = 1;
      return of;
    });
    const fixed = terms.flatMap((term, at) => (spread(term) ? [] : [at]));
    const tabledOnly = fixed.length > 0 && fixed.every((at) => terms[at]?.kind === 'tabled');
    let scratch = scratchOf(0);
    let texts = 0;
    /** Whether the terms stand together in `verse`: the listed and tabled terms placed first, then a class's word by the text or the class's lists. */
    const together = (verse: number) => {
      const start = index.tokenStart(verse);
      const length = index.tokenStart(verse + 1) - start;
      if (length > scratch.room) scratch = scratchOf(length * 2);
      const at: VerseAt = {
        start,
        length,
        tabled: tabledUsed ? index.tabledInto(verse, scratch.places, scratch.ids) : 0,
      };
      let count = Math.max(0, length - terms.length + 1);
      if (tabledOnly) count = firstsByTable(scratch, at, count, fixed, tabledBy);
      else {
        for (let first = 0; first < count; first += 1) scratch.firsts[first] = first;
        for (let place = 0; place < terms.length && count > 0; place += 1) {
          const term = terms[place];
          if (term === undefined || spread(term)) continue;
          markTerm(scratch, at, term, tabledBy[place]);
          count = keepMarked(scratch, count, place);
        }
      }
      if (count === 0 || !classed) return count > 0;
      if (texts < SPARSE) {
        texts += 1;
        return keepByText(scratch, terms, count, textOf(verse, read)) > 0;
      }
      for (let place = 0; place < terms.length && count > 0; place += 1) {
        const term = terms[place];
        if (term === undefined || term.kind !== 'class') continue;
        markTerm(scratch, at, term, tabledBy[place]);
        markTokens(scratch, at, tokensOfClass(term));
        count = keepMarked(scratch, count, place);
      }
      return count > 0;
    };
    const phrases = new Set<number>();
    for (const verse of found) {
      if (together(verse)) phrases.add(verse);
      if (phrases.size >= limit) break;
    }
    return phrases;
  };

  /** A hit for `verse`: its reference, and its text cut around the first match. */
  const hitOf = (
    terms: ReadonlyArray<Term>,
    verse: number,
    phrase: boolean,
    read: Set<number>,
  ): FindHit => {
    const place = index.placeOf(verse);
    const text = textOf(verse, read);
    const tokens = tokensOf(text);
    let span: readonly [number, number] = [0, 0];
    for (let first = 0; first < tokens.length; first += 1) {
      const found = phrase
        ? first + terms.length <= tokens.length &&
          terms.every((term, at) => matches(term, tokens[first + at]?.word ?? ''))
        : terms.some((term) => matches(term, tokens[first]?.word ?? ''));
      if (found) {
        const last = phrase ? tokens[first + terms.length - 1] : tokens[first];
        span = [tokens[first]?.start ?? 0, last?.end ?? 0];
        break;
      }
    }
    return {
      reference: verseReference(place.book, place.chapter, place.verse),
      ...place,
      ...cutOf(text, span[0], span[1]),
    };
  };

  /** What find shows for `query`: at most `limit` hits. */
  const findRead = (query: string, limit: number): FindShown => {
    const { words, typing } = queryOf(query);
    if (words.length === 0 || index.size === 0) return placesOnly(query);
    const places = placesOf(query);
    const terms = words.map((word, at) => termOf(word, typing && at === words.length - 1));
    const found = terms.some((term) => term.kind === 'none') ? [] : allWordsOf(terms);
    const read = new Set<number>();
    const phrases =
      terms.length === 1 ? new Set(found.slice(0, limit)) : phrasesOf(terms, found, limit, read);
    const chosen = [...phrases].slice(0, limit);
    for (const verse of found) {
      if (chosen.length >= limit) break;
      if (!phrases.has(verse)) chosen.push(verse);
    }
    const hits = chosen.map((verse) => hitOf(terms, verse, phrases.has(verse), read));
    return {
      query,
      places,
      hits,
      more: found.length - hits.length,
      line: hits.length === 0 && places.length === 0 ? NOTHING_LINE : '',
    };
  };

  return findRead;
};
