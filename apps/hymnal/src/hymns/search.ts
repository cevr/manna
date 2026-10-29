/**
 * Search by number, or by any line a reader half remembers.
 *
 * A number finds that hymn first, then every hymn whose number starts with
 * it ("1" gives 1, then 10–19, 100–199), in any of the forms a reader types
 * one: `100`, `#100`, `# 100`, `no 100`, `no. 100`, `No.100`, `hymn 100`,
 * `Hymn #100`, `number 100`.
 *
 * A Scripture reference (`John 3:16`, `Ps 23`, `Psalm 23:1`: any book name
 * or abbreviation of core's canon) finds the hymns the Scriptural index
 * lists on that verse first, then the rest of that chapter's by verse
 * distance. A topic's name finds the hymns the Topical index lists under
 * it, after the hymns whose title holds its words.
 *
 * Words find the hymns whose title, first line, refrain or any line of any
 * stanza holds them. A query word matches its own word; the word it starts,
 * while it is the last one typed; a word one edit away (a letter dropped,
 * doubled, swapped or mistyped), when it has 4 letters or more; and the old
 * word a modern one stands for, or the other way (`you` and `thee`, `your`
 * and `thy`, `has` and `hath`: `KIN`). A hymn needs most of the words, not
 * all: every word of a query of one or two, else 60% of them, so a word
 * forgotten or misremembered still finds the line. Case, accents and
 * punctuation are ignored ("o'er" finds "O’er"). An empty query lists every
 * hymn.
 *
 * Ranking: the hymns whose title holds every word come first, in the
 * hymnal's order (the word itself, its prefix or its kin, never a typo), as
 * the home list orders them; then by how many words a
 * hymn holds, how many of them it holds with no typo (a hymn that holds a
 * word comes before one a typo of it finds), how rare they are (weighted by where they are: the title, the
 * first line, the refrain, then the rest), the longest run of them in one
 * line (in order, up to two words left out between them, or two side by
 * side swapped), and a title or first line that starts with them. Each hymn
 * found by a line other than its title carries that line (`Found.line`).
 *
 * The index (`indexOf`) is built once from the hymns, in memory; the app
 * builds it as search mode opens (`hymnIndex`), never at start. Its search
 * keeps each word's matches and scores for the next keystroke, which
 * changes only the last word. It runs on the JavaScript thread a keystroke
 * at a time, so it works on flat typed arrays, not objects per word.
 */

import { parseBibleQuery } from '@manna/core/bible';
import { fold } from '@manna/hymnal/fold';
import { Option } from 'effect';

import { hymns } from './hymns';
import { type Lookups, lookups } from './indexes';
import type { HymnText } from './text';

const words = (text: string) => fold(text).split(' ').filter(Boolean);

/** Old words and the modern words a reader types for them: each finds the others. */
export const KIN: ReadonlyArray<ReadonlyArray<string>> = [
  ['you', 'thee', 'thou', 'ye'],
  ['your', 'thy', 'thine'],
  ['are', 'art'],
  ['has', 'hath'],
  ['have', 'hast'],
  ['does', 'doth'],
  ['do', 'dost'],
  ['shall', 'shalt'],
  ['will', 'wilt'],
  ['can', 'canst'],
  ['did', 'didst'],
];

/** A hymn a search found, and the line it was found by when that is not its title. */
export interface Found {
  readonly hymn: HymnText;
  readonly line: Option.Option<string>;
}

/** How much a word counts where it stands: the title, the first line, the refrain's first line, any other line. */
const FIELD_WEIGHT = [4, 3, 2, 1] as const;

/** How well a query word matches a word: itself or its kin, a word it starts, a word one edit away. */
const EXACT = 1;
const PREFIX = 0.8;
const TYPO = 0.6;

/** How many of the strongest candidates have their runs in one line measured. */
const HEAD = 60;

/** The bounds on the memos of the last searches' words: their matches, and their scores (two arrays a hymn long each). */
const MATCHES_KEPT = 2000;
const SCORES_KEPT = 500;

/** The most query words a search reads: one bit each. */
const MOST = 30;

interface Scores {
  /** Per hymn, the word's best score in it: its best with no typo, when it holds one. */
  readonly score: Float32Array;
  /** Per hymn, the line that best score is in. */
  readonly line: Int32Array;
  /** Per hymn, 1 when it holds the word with no typo (itself, its kin or a word it starts). */
  readonly sure: Uint8Array;
}

export interface SearchIndex {
  readonly hymns: ReadonlyArray<HymnText>;
  readonly numbers: ReadonlyArray<string>;
  /** Each hymn's number to its place among the hymns. */
  readonly places: ReadonlyMap<number, number>;
  /** The back-matter indexes: the hymns of a topic, and of a verse. */
  readonly lookups: Lookups;
  readonly vocab: ReadonlyMap<string, number>;
  readonly vocabList: ReadonlyArray<string>;
  readonly sorted: ReadonlyArray<string>;
  /** Each word and every word one letter shorter than it, to the words they come from (SymSpell). */
  readonly deletes: ReadonlyMap<string, ReadonlyArray<number>>;
  /** Each word of `KIN`, held or not, to the others of its group the hymns hold. */
  readonly kin: ReadonlyMap<string, ReadonlyArray<number>>;
  /** Per hymn, its first line's place; one more at the end. */
  readonly hymnLine: Int32Array;
  /** Per line, its first word's place in `lineWords`; one more at the end. */
  readonly lineStart: Int32Array;
  readonly lineWords: Int32Array;
  /** Each line as the hymnal prints it. */
  readonly lineText: ReadonlyArray<string>;
  /** Per word, its postings' place; one more at the end. A posting is a hymn, the word's best weight there and its line. */
  readonly postStart: Int32Array;
  readonly postHymn: Int32Array;
  readonly postWeight: Float32Array;
  readonly postLine: Int32Array;
  readonly idf: Float32Array;
  /** A search's marks on each word, one bit per query word, cleared as it returns (`find`). */
  readonly any: Int32Array;
  readonly strong: Int32Array;
  readonly expanded: Map<string, ReadonlyMap<number, number>>;
  readonly scored: Map<string, Scores>;
}

/** Each hymn's lines: the title, the first line, the refrain's first line, then every other line once, in sung order. */
const linesOf = (hymn: HymnText): ReadonlyArray<string> => {
  const rest = [...new Set(hymn.sections.flatMap((section) => section.lines))];
  const refrain = hymn.sections.find((section) => section.kind === 'refrain')?.lines[0] ?? '';
  return [hymn.title, hymn.firstLine, refrain, ...rest];
};

/**
 * `fold` of each line, one pass over a hymn's lines joined by line breaks:
 * the same words a line at a time, at a fraction of the cost. A line break
 * inside a line is a space, as `fold` makes it.
 */
const foldLines = (lines: ReadonlyArray<string>): ReadonlyArray<string> =>
  lines
    .map((line) => line.replace(/\n/g, ' '))
    .join('\n')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/[^\p{L}\p{N}\n]+/gu, ' ')
    .split('\n');

/** Every word once, numbered, and every line as the numbers of its words. */
const vocabularyOf = (all: ReadonlyArray<HymnText>) => {
  const vocab = new Map<string, number>();
  const vocabList: Array<string> = [];
  const add = (word: string) => {
    vocab.set(word, vocabList.length);
    return vocabList.push(word) - 1;
  };
  const idOf = (word: string) => vocab.get(word) ?? add(word);
  const hymnLine: Array<number> = [];
  const lineStart: Array<number> = [];
  const lineWords: Array<number> = [];
  const lineText: Array<string> = [];
  const lineField: Array<number> = [];
  for (const hymn of all) {
    hymnLine.push(lineStart.length);
    const lines = linesOf(hymn);
    const folded = foldLines(lines);
    lines.forEach((text, place) => {
      lineStart.push(lineWords.length);
      lineText.push(text);
      lineField.push(Math.min(place, 3));
      for (const word of (folded[place] ?? '').split(' '))
        if (word !== '') lineWords.push(idOf(word));
    });
  }
  hymnLine.push(lineStart.length);
  lineStart.push(lineWords.length);
  return { vocab, vocabList, hymnLine, lineStart, lineWords, lineText, lineField };
};

/**
 * Each word's postings: per hymn that has it, in hymn order, its best weight
 * there and the first line with that weight. A hymn's lines run from the
 * heaviest field to the lightest, so a word's first place in a hymn is its best.
 */
const postingsOf = ({
  vocabList,
  hymnLine,
  lineStart,
  lineWords,
  lineField,
}: ReturnType<typeof vocabularyOf>) => {
  const N = hymnLine.length - 1;
  const V = vocabList.length;
  // Each word's first place in each hymn, as its word, hymn and line, and each word's count of them.
  const seenIn = new Int32Array(V).fill(-1);
  const count = new Int32Array(V);
  const firstWord: Array<number> = [];
  const firstHymn: Array<number> = [];
  const firstLine: Array<number> = [];
  for (let h = 0; h < N; h++)
    for (let l = hymnLine[h] ?? 0; l < (hymnLine[h + 1] ?? 0); l++)
      for (let k = lineStart[l] ?? 0; k < (lineStart[l + 1] ?? 0); k++) {
        const id = lineWords[k] ?? 0;
        if (seenIn[id] === h) continue;
        seenIn[id] = h;
        count[id] = (count[id] ?? 0) + 1;
        firstWord.push(id);
        firstHymn.push(h);
        firstLine.push(l);
      }
  const postStart = new Int32Array(V + 1);
  const idf = new Float32Array(V);
  for (let id = 0; id < V; id++) {
    const size = count[id] ?? 0;
    postStart[id + 1] = (postStart[id] ?? 0) + size;
    idf[id] = Math.log(1 + (N - size + 0.5) / (size + 0.5));
  }
  const total = postStart[V] ?? 0;
  const postHymn = new Int32Array(total);
  const postWeight = new Float32Array(total);
  const postLine = new Int32Array(total);
  const next = postStart.slice(0, V);
  firstWord.forEach((id, i) => {
    const at = next[id] ?? 0;
    next[id] = at + 1;
    const line = firstLine[i] ?? 0;
    postHymn[at] = firstHymn[i] ?? 0;
    postWeight[at] = FIELD_WEIGHT[lineField[line] ?? 3] ?? 1;
    postLine[at] = line;
  });
  return { postStart, postHymn, postWeight, postLine, idf };
};

/** Each word of 3 letters or more, and each of it with one letter dropped, to the words it comes from. */
const deletesOf = (vocabList: ReadonlyArray<string>) => {
  const deletes = new Map<string, Array<number>>();
  const add = (key: string, id: number) => {
    const ids = deletes.get(key) ?? [];
    if (ids.length === 0) deletes.set(key, ids);
    if (ids.at(-1) !== id) ids.push(id);
  };
  vocabList.forEach((word, id) => {
    if (word.length < 3) return;
    add(word, id);
    for (let i = 0; i < word.length; i++) add(word.slice(0, i) + word.slice(i + 1), id);
  });
  return deletes;
};

/**
 * Each word of `KIN`, to the others of its group the hymns hold: a word no
 * hymn holds (`thou` in a hymnal of `you`) still finds the ones they do.
 */
const kinOf = (vocab: ReadonlyMap<string, number>) => {
  const kin = new Map<string, ReadonlyArray<number>>();
  for (const group of KIN)
    for (const word of group)
      kin.set(
        word,
        group
          .filter((other) => other !== word)
          .flatMap((other) => Option.toArray(Option.fromUndefinedOr(vocab.get(other)))),
      );
  return kin;
};

/** The index of `all`, searching the back-matter indexes `indexes` (the bundled ones by default). */
export const indexOf = (
  all: ReadonlyArray<HymnText>,
  indexes: Lookups = lookups(),
): SearchIndex => {
  const vocabulary = vocabularyOf(all);
  const { vocab, vocabList } = vocabulary;
  return {
    hymns: all,
    numbers: all.map((hymn) => String(hymn.number)),
    places: new Map(all.map((hymn, h) => [hymn.number, h])),
    lookups: indexes,
    vocab,
    vocabList,
    sorted: vocabList.toSorted(),
    deletes: deletesOf(vocabList),
    kin: kinOf(vocab),
    hymnLine: Int32Array.from(vocabulary.hymnLine),
    lineStart: Int32Array.from(vocabulary.lineStart),
    lineWords: Int32Array.from(vocabulary.lineWords),
    lineText: vocabulary.lineText,
    ...postingsOf(vocabulary),
    any: new Int32Array(vocabList.length),
    strong: new Int32Array(vocabList.length),
    expanded: new Map(),
    scored: new Map(),
  };
};

/** At most one edit (a letter dropped, added, changed, or two side by side swapped) turns `a` into `b`. */
export const oneEdit = (a: string, b: string): boolean => {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  const same = (x: string, xi: number, y: string, yi: number) =>
    x.length - xi === y.length - yi && x.slice(xi) === y.slice(yi);
  if (la > lb) return same(a, i + 1, b, i);
  if (la < lb) return same(a, i, b, i + 1);
  return (
    same(a, i + 1, b, i + 1) ||
    (a.charCodeAt(i) === b.charCodeAt(i + 1) &&
      a.charCodeAt(i + 1) === b.charCodeAt(i) &&
      same(a, i + 2, b, i + 2))
  );
};

/** The words one edit from `term` (`oneEdit`), through the deletes. */
const typosOf = (index: SearchIndex, term: string): ReadonlyArray<number> => {
  const seen = new Set<number>();
  const probe = (key: string) => {
    for (const id of index.deletes.get(key) ?? []) seen.add(id);
  };
  probe(term);
  for (let i = 0; i < term.length; i++) probe(term.slice(0, i) + term.slice(i + 1));
  return [...seen].filter((id) => oneEdit(term, index.vocabList[id] ?? ''));
};

/** `make`'s value for `key`, made once and kept in `memo`, which forgets all once it holds `most`. */
const memoized = <V>(memo: Map<string, V>, most: number, key: string, make: () => V): V =>
  Option.getOrElse(Option.fromUndefinedOr(memo.get(key)), () => {
    const value = make();
    if (memo.size >= most) memo.clear();
    memo.set(key, value);
    return value;
  });

/** A query word's memo key: the last word typed matches the words it starts too. */
const keyOf = (term: string, last: boolean) => `${Number(last)}${term}`;

/** The words the hymns hold that start with `term`. */
const startingWith = (index: SearchIndex, term: string): ReadonlyArray<number> => {
  let low = 0;
  let high = index.sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((index.sorted[middle] ?? '') < term) low = middle + 1;
    else high = middle;
  }
  const out: Array<number> = [];
  for (let i = low; (index.sorted[i] ?? '').startsWith(term) && i < index.sorted.length; i++)
    out.push(index.vocab.get(index.sorted[i] ?? '') ?? 0);
  return out;
};

/** The words a query word matches, each with how well: itself and its kin, the words it starts while it is the last one, the words one edit away. */
const expand = (index: SearchIndex, term: string, last: boolean): ReadonlyMap<number, number> =>
  memoized(index.expanded, MATCHES_KEPT, keyOf(term, last), () => {
    const out = new Map<number, number>();
    const put = (ids: ReadonlyArray<number>, quality: number) => {
      for (const id of ids) if (!out.has(id)) out.set(id, quality);
    };
    const exact = Option.toArray(Option.fromUndefinedOr(index.vocab.get(term)));
    put(exact, EXACT);
    put(index.kin.get(term) ?? [], EXACT);
    if (last) put(startingWith(index, term), PREFIX);
    if (term.length >= 4) put(typosOf(index, term), TYPO);
    return out;
  });

/**
 * Each hymn's best score for a query word, and the line it is in. A match
 * with no typo outscores any typo in the same hymn: the hymn holds the word,
 * so a word one edit from it there says nothing more.
 */
const scoresOf = (index: SearchIndex, term: string, last: boolean): Scores =>
  memoized(index.scored, SCORES_KEPT, keyOf(term, last), () => {
    const N = index.hymns.length;
    const score = new Float32Array(N);
    const line = new Int32Array(N);
    const sure = new Uint8Array(N);
    expand(index, term, last).forEach((quality, id) => {
      const weight = (index.idf[id] ?? 0) * quality;
      const strong = Number(quality >= PREFIX);
      for (let p = index.postStart[id] ?? 0; p < (index.postStart[id + 1] ?? 0); p++) {
        const h = index.postHymn[p] ?? 0;
        const value = weight * (index.postWeight[p] ?? 0);
        const was = sure[h] ?? 0;
        if (strong > was || (strong === was && value > (score[h] ?? 0))) {
          score[h] = value;
          line[h] = index.postLine[p] ?? 0;
          sure[h] = strong;
        }
      }
    });
    return { score, line, sure };
  });

/**
 * A number in any form a reader types one, its digits: after any of the
 * words `hymn`, `number`, `no`, `n°` (`hymn no. 100`), with punctuation and
 * spaces around it ignored (`#100`, `(100)`, `100.`).
 */
const NUMBER = /^[\s\p{P}]*(?:(?:hymn|number|no|n[º°])[\s\p{P}]*)*(\d+)[\s\p{P}]*$/iu;

const byNumber = (index: SearchIndex, digits: string): ReadonlyArray<Ranked> => {
  const exact: Array<Ranked> = [];
  const prefix: Array<Ranked> = [];
  index.numbers.forEach((number, h) => {
    if (number === digits) exact.push({ h, line: 0, plain: true });
    else if (number.startsWith(digits)) prefix.push({ h, line: 0, plain: true });
  });
  return [...exact, ...prefix];
};

/** Whether lines `a` and `b` hold the same words. */
const sameWords = (index: SearchIndex, a: number, b: number) => {
  const from = index.lineStart[a] ?? 0;
  const other = index.lineStart[b] ?? 0;
  const length = (index.lineStart[a + 1] ?? 0) - from;
  if (length !== (index.lineStart[b + 1] ?? 0) - other) return false;
  for (let k = 0; k < length; k++)
    if (index.lineWords[from + k] !== index.lineWords[other + k]) return false;
  return true;
};

/** The line `l` of hymn `h` as a found line: none when it holds just the title's words (the title itself among them). */
const shownLine = (index: SearchIndex, h: number, l: number): Option.Option<string> =>
  Option.liftPredicate(index.lineText[l] ?? '', () => !sameWords(index, l, index.hymnLine[h] ?? 0));

/**
 * Mark each word a query word matches with that query word's bit, in
 * `any`, and in `strong` when it matches as itself, its kin or its start;
 * the words marked, to clear once the search is done.
 */
const mark = (index: SearchIndex, terms: ReadonlyArray<string>): ReadonlyArray<number> => {
  const marked: Array<number> = [];
  terms.forEach((term, t) => {
    expand(index, term, t === terms.length - 1).forEach((quality, id) => {
      if ((index.any[id] ?? 0) === 0) marked.push(id);
      index.any[id] = (index.any[id] ?? 0) | (1 << t);
      if (quality >= PREFIX) index.strong[id] = (index.strong[id] ?? 0) | (1 << t);
    });
  });
  return marked;
};

const unmark = (index: SearchIndex, marked: ReadonlyArray<number>) => {
  for (const id of marked) {
    index.any[id] = 0;
    index.strong[id] = 0;
  }
};

/** Per hymn, how many of the query words it holds, how many of them with no typo, and their scores' sum. */
const coverOf = (N: number, scores: ReadonlyArray<Scores>) => {
  const cover = new Int32Array(N);
  const sure = new Int32Array(N);
  const total = new Float32Array(N);
  for (const scored of scores)
    for (let h = 0; h < N; h++) {
      const s = scored.score[h] ?? 0;
      if (s > 0) {
        cover[h] = (cover[h] ?? 0) + 1;
        sure[h] = (sure[h] ?? 0) + (scored.sure[h] ?? 0);
        total[h] = (total[h] ?? 0) + s;
      }
    }
  return { cover, sure, total };
};

/** Whether hymn `h`'s title holds each of the first `count` query words, as itself, its kin or its start. */
const titleHolds = (index: SearchIndex, h: number, count: number) => {
  const title = index.hymnLine[h] ?? 0;
  let held = 0;
  for (let k = index.lineStart[title] ?? 0; k < (index.lineStart[title + 1] ?? 0); k++)
    held |= index.strong[index.lineWords[k] ?? 0] ?? 0;
  const every = (1 << count) - 1;
  return (held & every) === every;
};

/** Where a run's next query word may stand from the last one's place: up to three places on, or one back (two words swapped). */
const STEPS = [1, 2, 3, -1] as const;

/** The place of query word `t` a step from `at` in the line from `from` to `to`, or -1. */
const nextAt = (index: SearchIndex, at: number, from: number, to: number, t: number) => {
  for (const step of STEPS) {
    const place = at + step;
    if (from <= place && place < to && ((index.any[index.lineWords[place] ?? 0] ?? 0) >> t) & 1)
      return place;
  }
  return -1;
};

/** The longest run of query words in one line from its word `s`, led by the first query word that word matches (`STEPS`). */
const runFrom = (index: SearchIndex, s: number, from: number, to: number, T: number) => {
  const bits = index.any[index.lineWords[s] ?? 0] ?? 0;
  const first = 31 - Math.clz32(bits & -bits);
  const typo = (place: number, t: number) =>
    Number((((index.strong[index.lineWords[place] ?? 0] ?? 0) >> t) & 1) === 0);
  let t = first;
  let at = s;
  // How loose the run is: each word left out or swapped, then each word matched by a typo alone.
  let gaps = 0;
  let typos = typo(s, first);
  while (t + 1 < T) {
    const next = nextAt(index, at, from, to, t + 1);
    if (next < 0) break;
    gaps += Number(next !== at + 1);
    at = next;
    t++;
    typos += typo(at, t);
  }
  return { first, length: t - first + 1, loose: gaps * T + typos };
};

/**
 * How well hymn `h`'s title (3), first line (2) or refrain (1) starts with
 * the whole query, the best of them; 0 when none does.
 */
const startOf = (index: SearchIndex, h: number, T: number) => {
  const top = index.hymnLine[h] ?? 0;
  for (let place = 0; place < 3; place++) {
    const from = index.lineStart[top + place] ?? 0;
    const to = index.lineStart[top + place + 1] ?? 0;
    const leads = ((index.any[index.lineWords[from] ?? 0] ?? 0) & 1) === 1 && from < to;
    if (leads && runFrom(index, from, from, to, T).length === T) return 3 - place;
  }
  return 0;
};

/**
 * Hymn `h`'s longest run of query words in one line, the tightest of the
 * longest (the fewest words left out or swapped, then the fewest typos),
 * and that line.
 */
const runIn = (index: SearchIndex, h: number, T: number) => {
  const top = index.hymnLine[h] ?? 0;
  let run = 0;
  let loose = 0;
  let line = top;
  for (let l = top; l < (index.hymnLine[h + 1] ?? 0); l++) {
    const from = index.lineStart[l] ?? 0;
    const to = index.lineStart[l + 1] ?? 0;
    for (let s = from; s < to && (run < T || loose > 0); s++) {
      if ((index.any[index.lineWords[s] ?? 0] ?? 0) === 0) continue;
      const found = runFrom(index, s, from, to, T);
      if (found.length > run || (found.length === run && found.loose < loose)) {
        run = found.length;
        loose = found.loose;
        line = l;
      }
    }
  }
  return { run, line };
};

/** The line of hymn `h`'s strongest query word, for a hymn past the measured head. */
const strongestLine = (index: SearchIndex, scores: ReadonlyArray<Scores>, h: number) => {
  let best = 0;
  let line = index.hymnLine[h] ?? 0;
  for (const scored of scores)
    if ((scored.score[h] ?? 0) > best) {
      best = scored.score[h] ?? 0;
      line = scored.line[h] ?? 0;
    }
  return line;
};

/**
 * A hymn a query found: its place among the hymns, the line it was found
 * by, and whether its row shows no line (`plain`: found by number, or its
 * title holds the query).
 */
interface Ranked {
  readonly h: number;
  readonly line: number;
  readonly plain: boolean;
}

/** The hymns the words of a query find, in rank order. */
const byWords = (index: SearchIndex, terms: ReadonlyArray<string>): ReadonlyArray<Ranked> => {
  const T = terms.length;
  const N = index.hymns.length;
  // A one-letter last word of a longer query is still being typed: it
  // shapes the runs in one line, but does not choose the hymns.
  const chosenBy = T - Number(T > 1 && (terms[T - 1]?.length ?? 0) < 2);
  const marked = mark(index, terms);
  const scores = terms.slice(0, chosenBy).map((term, t) => scoresOf(index, term, t === T - 1));
  const { cover, sure, total } = coverOf(N, scores);
  const need = Math.min(chosenBy, Math.max(2, Math.ceil(chosenBy * 0.6)));
  const titled = new Uint8Array(N);
  const candidates: Array<number> = [];
  for (let h = 0; h < N; h++)
    if ((cover[h] ?? 0) >= need) {
      candidates.push(h);
      titled[h] = Number(titleHolds(index, h, chosenBy));
    }
  // The hymns whose title holds the query first, in the hymnal's order;
  // then the rest by how many words they hold, how many of them with no
  // typo (so a hymn that holds a word comes before one a typo of it finds),
  // and the measures after these.
  const before = (a: number, b: number) =>
    (titled[b] ?? 0) - (titled[a] ?? 0) ||
    (titled[a] ?? 0) * (a - b) ||
    (cover[b] ?? 0) - (cover[a] ?? 0) ||
    (sure[b] ?? 0) - (sure[a] ?? 0);
  candidates.sort((a, b) => before(a, b) || (total[b] ?? 0) - (total[a] ?? 0) || a - b);
  // Runs are measured for the strongest only: at most `HEAD`, each holding
  // at most one query word fewer than the most any hymn holds.
  const most = cover[candidates[0] ?? 0] ?? 0;
  // A prefix: the titled come first, each holding every word, then the rest by cover.
  const heads = candidates.filter((h, i) => i < HEAD && (cover[h] ?? 0) >= most - 1).length;
  // One word runs no longer than itself: its line is the one it scores best in.
  const runOf = (h: number) => {
    if (T === 1) return { run: 1, line: strongestLine(index, scores, h) };
    return runIn(index, h, T);
  };
  const head = candidates.slice(0, heads).map((h) => {
    const { run, line } = runOf(h);
    const start = startOf(index, h, T);
    const measured = (total[h] ?? 0) + (run / T) * 30 + start * 10;
    return { h, measured, line, plain: titled[h] === 1 };
  });
  unmark(index, marked);
  head.sort((a, b) => before(a.h, b.h) || b.measured - a.measured || a.h - b.h);
  const rest = candidates
    .slice(heads)
    .map((h) => ({ h, line: strongestLine(index, scores, h), plain: titled[h] === 1 }));
  return [...head, ...rest];
};

/** The hymns of these numbers, in their order, each a plain row. */
const placed = (index: SearchIndex, numbers: ReadonlyArray<number>): ReadonlyArray<Ranked> =>
  numbers.flatMap((number) =>
    Option.match(Option.fromUndefinedOr(index.places.get(number)), {
      onNone: () => [],
      onSome: (h) => [{ h, line: 0, plain: true }],
    }),
  );

/**
 * The hymns on the verse a query names (`John 3:16`, `Ps 23`, `Psalm 23:1`,
 * read by core's canon), then the rest of its chapter by verse distance. A
 * chapter is read from its first verse, a range of verses from its first, a
 * range of chapters chapter by chapter. A book alone names no verse.
 */
const byReference = (index: SearchIndex, query: string): ReadonlyArray<number> => {
  const parsed = parseBibleQuery(query);
  const { onVerse } = index.lookups;
  switch (parsed._tag) {
    case 'single':
      return onVerse(parsed.ref.book, parsed.ref.chapter, parsed.ref.verse);
    case 'verseRange':
      return onVerse(parsed.ref.start.book, parsed.ref.start.chapter, parsed.ref.start.verse);
    case 'chapter':
      return onVerse(parsed.ref.book, parsed.ref.chapter, 1);
    case 'chapterRange': {
      const { book } = parsed.start;
      const length = parsed.end.chapter - parsed.start.chapter + 1;
      return Array.from({ length }, (_, i) => onVerse(book, parsed.start.chapter + i, 1)).flat();
    }
    default:
      return [];
  }
};

/** The rows of every list in order, each hymn at its first place. */
const firstOf = (lists: ReadonlyArray<ReadonlyArray<Ranked>>): ReadonlyArray<Ranked> => {
  const seen = new Set<number>();
  return lists.flat().filter(({ h }) => !seen.has(h) && Boolean(seen.add(h)));
};

/**
 * The ranked hymns of a query, found by number, or every hymn for an empty
 * one. Else the hymns of the verse it names come first; then the hymns
 * whose title holds its words; then the hymns of the topic it names; then
 * the rest its words find.
 */
const rankedOf = (index: SearchIndex, query: string): ReadonlyArray<Ranked> =>
  Option.match(Option.fromNullishOr(NUMBER.exec(query)), {
    onSome: (number) => byNumber(index, String(Number(number[1]))),
    onNone: () => {
      const terms = words(query).slice(0, MOST);
      if (terms.length === 0) return index.hymns.map((_, h) => ({ h, line: 0, plain: true }));
      const found = byWords(index, terms);
      const titled = found.findIndex(({ plain }) => !plain);
      const split = Option.getOrElse(
        Option.liftPredicate(titled, (at) => at >= 0),
        () => found.length,
      );
      return firstOf([
        placed(index, byReference(index, query)),
        found.slice(0, split),
        placed(index, index.lookups.topicHymns(query)),
        found.slice(split),
      ]);
    },
  });

/** The hymns a query finds, in rank order, each with the line it was found by. */
export const find = (index: SearchIndex, query: string): ReadonlyArray<Found> =>
  rankedOf(index, query).flatMap(({ h, line, plain }) =>
    index.hymns.slice(h, h + 1).map((hymn) => ({
      hymn,
      line: Option.filter(shownLine(index, h, line), () => !plain),
    })),
  );

/** The hymns a query finds, in rank order (`find`), without their lines. */
export const search = (index: SearchIndex, query: string): ReadonlyArray<HymnText> =>
  rankedOf(index, query).flatMap(({ h }) => index.hymns.slice(h, h + 1));

/** The app's index of every hymn, built the first time it is asked for and kept. */
export const hymnIndex: () => SearchIndex = (() => {
  let built = Option.none<SearchIndex>();
  return () =>
    Option.getOrElse(built, () => {
      const index = indexOf(hymns);
      built = Option.some(index);
      return index;
    });
})();
