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
import { queryOf, tokensOf } from './words';

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
      readonly verses: ArrayLike<number>;
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

/** A class's list at its next token: the `at`th of its values. */
interface Head {
  token: number;
  at: number;
  readonly list: WordList;
}

/** Restores the min-heap of `heads` by token from `parent` down, after its head moved on. */
const siftDown = (heads: Array<Head>, parent: number) => {
  const size = heads.length;
  let at = parent;
  for (;;) {
    const left = at * 2 + 1;
    const right = left + 1;
    let least = at;
    if (left < size && (heads[left]?.token ?? 0) < (heads[least]?.token ?? 0)) least = left;
    if (right < size && (heads[right]?.token ?? 0) < (heads[least]?.token ?? 0)) least = right;
    if (least === at) return;
    const kept = heads[at];
    const moved = heads[least];
    if (kept === undefined || moved === undefined) return;
    heads[at] = moved;
    heads[least] = kept;
    at = least;
  }
};

/** What find shows with no word index (none downloaded yet, or one of another format): the place a query names, and for a query with words, that word search is downloading. */
export const placesOnly = (query: string): FindShown => {
  const { words } = queryOf(query);
  if (words.length === 0) return { query, places: [], hits: [], more: 0, line: '' };
  return { query, places: placesOf(query), hits: [], more: 0, line: DOWNLOADING_LINE };
};

/** A min-heap of a class's lists by their first token from `from`, decoding each list only that far. */
const headsFrom = (members: ReadonlyArray<WordList>, from: number) => {
  const heads: Array<Head> = [];
  for (const list of members) {
    const at = firstFrom(list.upTo(from), from);
    const token = nextOf(list, at);
    if (token >= 0) heads.push({ token, at, list });
  }
  for (let at = (heads.length >>> 1) - 1; at >= 0; at -= 1) siftDown(heads, at);
  return heads;
};

/** Marks in `marked` each place of the class's tokens before `end` (from `start`), moving its heads past them. */
const markHeads = (heads: Array<Head>, start: number, end: number, marked: Array<boolean>) => {
  for (;;) {
    const head = heads[0];
    if (head === undefined || head.token >= end) return;
    if (head.token >= start) marked[head.token - start] = true;
    head.at += 1;
    head.token = nextOf(head.list, head.at);
    if (head.token < 0) {
      const last = heads.pop();
      if (last !== undefined && heads.length > 0) heads[0] = last;
    }
    siftDown(heads, 0);
  }
};

/** The next token of `list` after its `at`th, decoding one more entry when needed; -1 at its end. */
const nextOf = (list: WordList, at: number) => {
  if (at < list.values.length) return list.values[at] ?? -1;
  const last = list.values.at(-1);
  if (last === undefined) return -1;
  list.upTo(last + 1);
  return at < list.values.length ? (list.values[at] ?? -1) : -1;
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
    const verses: Array<number> = [];
    for (let verse = 0; verse < index.size; verse += 1)
      if (index.tabledIn(id, verse)) verses.push(verse);
    const made = Int32Array.from(verses);
    tabledVerses.set(id, made);
    return made;
  };

  const termMade = (word: string, prefix: boolean): Term => {
    if (!prefix) {
      const id = index.tabled.indexOf(word);
      if (id >= 0) return { kind: 'tabled', word, prefix, id, verses: versesOfTabled(id) };
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
      return { kind: 'class', word, prefix, bitmap, members: words.map(index.listOf), tabledIds };
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
    const lists = words.map((member) => index.listOf(member).all());
    const tokens = new Int32Array(lists.reduce((sum, list) => sum + list.length, 0));
    let filled = 0;
    for (const list of lists) {
      tokens.set(list, filled);
      filled += list.length;
    }
    tokens.sort();
    const marked = new Uint8Array(index.size);
    for (const each of [versesOfTokens(tokens), ...tabledIds.map(versesOfTabled)])
      for (let at = 0; at < each.length; at += 1) marked[each[at] ?? 0] = 1;
    const verses: Array<number> = [];
    for (let verse = 0; verse < marked.length; verse += 1)
      if (marked[verse] === 1) verses.push(verse);
    return { kind: 'prefix', word, prefix, tokens, verses: Int32Array.from(verses), tabledIds };
  };

  /** The verses that hold every term, in canon order. */
  const allWordsOf = (terms: ReadonlyArray<Term>) => {
    const listed = terms.filter(
      (term): term is Exclude<Term, { kind: 'none' | 'class' }> =>
        term.kind !== 'none' && term.kind !== 'class',
    );
    const driver = listed.reduce<(typeof listed)[number] | undefined>(
      (least, term) =>
        least === undefined || term.verses.length < least.verses.length ? term : least,
      undefined,
    );
    const others = terms.filter((term) => term !== driver);
    const pointers = others.map(() => 0);
    const holds = (verse: number) =>
      others.every((term, at) => {
        if (term.kind === 'none') return false;
        if (term.kind === 'tabled') return index.tabledIn(term.id, verse);
        if (term.kind === 'class') return index.inClass(term.bitmap, verse);
        let pointer = pointers[at] ?? 0;
        while (pointer < term.verses.length && (term.verses[pointer] ?? 0) < verse) pointer += 1;
        pointers[at] = pointer;
        return term.verses[pointer] === verse;
      });
    const found: Array<number> = [];
    if (driver === undefined) {
      for (let verse = 0; verse < index.size; verse += 1) if (holds(verse)) found.push(verse);
    } else
      for (let at = 0; at < driver.verses.length; at += 1) {
        const verse = driver.verses[at] ?? 0;
        if (holds(verse)) found.push(verse);
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
    const heads = terms.map((): Array<Head> | undefined => undefined);
    const classed = terms.some(spread);
    const tabledUsed = terms.some((term) => tabledIdsOf(term).length > 0);
    let texts = 0;
    const phrases = new Set<number>();
    for (const verse of found) {
      const start = index.tokenStart(verse);
      const length = index.tokenStart(verse + 1) - start;
      const tabled = tabledUsed ? index.tabledOf(verse) : [];
      const listed = (term: Term) => {
        const marked: Array<boolean> = Array.from({ length }, () => false);
        const tabledIds = tabledIdsOf(term);
        for (const [place, id] of tabled) if (tabledIds.includes(id)) marked[place] = true;
        if (term.kind === 'list' || term.kind === 'prefix')
          for (
            let each = firstFrom(term.tokens, start);
            each < term.tokens.length && (term.tokens[each] ?? 0) < start + length;
            each += 1
          )
            marked[(term.tokens[each] ?? 0) - start] = true;
        return marked;
      };
      let firsts = Array.from(
        { length: Math.max(0, length - terms.length + 1) },
        (_, first) => first,
      );
      terms.forEach((term, at) => {
        if (spread(term) || firsts.length === 0) return;
        const marked = listed(term);
        firsts = firsts.filter((first) => marked[first + at] === true);
      });
      if (firsts.length > 0 && classed && texts < SPARSE) {
        texts += 1;
        const words = tokensOf(textOf(verse, read)).map((token) => token.word);
        firsts = firsts.filter((first) =>
          terms.every((term, at) => !spread(term) || matches(term, words[first + at] ?? '')),
        );
      } else if (firsts.length > 0 && classed)
        terms.forEach((term, at) => {
          if (term.kind !== 'class' || firsts.length === 0) return;
          const marked = listed(term);
          const made = heads[at] ?? headsFrom(term.members, start);
          heads[at] = made;
          markHeads(made, start, start + length, marked);
          firsts = firsts.filter((first) => marked[first + at] === true);
        });
      if (firsts.length > 0) phrases.add(verse);
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
      const within = tokens.slice(first, first + terms.length);
      const together =
        within.length === terms.length &&
        terms.every((term, at) => matches(term, within[at]?.word ?? ''));
      const one = terms.some((term) => matches(term, tokens[first]?.word ?? ''));
      if (phrase ? together : one) {
        const last = phrase ? within.at(-1) : tokens[first];
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
