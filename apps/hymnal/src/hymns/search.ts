import { parseBibleQuery } from '@manna/core/bible';
import { fold } from '@manna/hymnal/fold';
import { Option } from 'effect';

import { hymns } from './hymns';
import { type Lookups, lookups } from './indexes';
import type { HymnText } from './text';

const words = (text: string) => fold(text).split(' ').filter(Boolean);

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

export interface Found {
  readonly hymn: HymnText;
  readonly line: Option.Option<string>;
}

const FIELD_WEIGHT = [4, 3, 2, 1] as const;

const EXACT = 1;
const PREFIX = 0.8;
const TYPO = 0.6;

const HEAD = 60;

const MATCHES_KEPT = 2000;
const SCORES_KEPT = 500;

const MOST = 30;

interface Scores {
  readonly score: Float32Array;
  readonly line: Int32Array;
  readonly sure: Uint8Array;
}

export interface SearchIndex {
  readonly hymns: ReadonlyArray<HymnText>;
  readonly numbers: ReadonlyArray<string>;
  readonly places: ReadonlyMap<number, number>;
  readonly lookups: Lookups;
  readonly vocab: ReadonlyMap<string, number>;
  readonly vocabList: ReadonlyArray<string>;
  readonly sorted: ReadonlyArray<string>;
  readonly deletes: ReadonlyMap<string, ReadonlyArray<number>>;
  readonly kin: ReadonlyMap<string, ReadonlyArray<number>>;
  readonly hymnLine: Int32Array;
  readonly lineStart: Int32Array;
  readonly lineWords: Int32Array;
  readonly lineText: ReadonlyArray<string>;
  readonly postStart: Int32Array;
  readonly postHymn: Int32Array;
  readonly postWeight: Float32Array;
  readonly postLine: Int32Array;
  readonly idf: Float32Array;
  readonly any: Int32Array;
  readonly strong: Int32Array;
  readonly expanded: Map<string, ReadonlyMap<number, number>>;
  readonly scored: Map<string, Scores>;
}

const linesOf = (hymn: HymnText): ReadonlyArray<string> => {
  const rest = [...new Set(hymn.sections.flatMap((section) => section.lines))];
  const refrain = hymn.sections.find((section) => section.kind === 'refrain')?.lines[0] ?? '';
  return [hymn.title, hymn.firstLine, refrain, ...rest];
};

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

const postingsOf = ({
  vocabList,
  hymnLine,
  lineStart,
  lineWords,
  lineField,
}: ReturnType<typeof vocabularyOf>) => {
  const N = hymnLine.length - 1;
  const V = vocabList.length;
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

const typosOf = (index: SearchIndex, term: string): ReadonlyArray<number> => {
  const seen = new Set<number>();
  const probe = (key: string) => {
    for (const id of index.deletes.get(key) ?? []) seen.add(id);
  };
  probe(term);
  for (let i = 0; i < term.length; i++) probe(term.slice(0, i) + term.slice(i + 1));
  return [...seen].filter((id) => oneEdit(term, index.vocabList[id] ?? ''));
};

const memoized = <V>(memo: Map<string, V>, most: number, key: string, make: () => V): V =>
  Option.getOrElse(Option.fromUndefinedOr(memo.get(key)), () => {
    const value = make();
    if (memo.size >= most) memo.clear();
    memo.set(key, value);
    return value;
  });

const keyOf = (term: string, last: boolean) => `${Number(last)}${term}`;

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

const sameWords = (index: SearchIndex, a: number, b: number) => {
  const from = index.lineStart[a] ?? 0;
  const other = index.lineStart[b] ?? 0;
  const length = (index.lineStart[a + 1] ?? 0) - from;
  if (length !== (index.lineStart[b + 1] ?? 0) - other) return false;
  for (let k = 0; k < length; k++)
    if (index.lineWords[from + k] !== index.lineWords[other + k]) return false;
  return true;
};

const shownLine = (index: SearchIndex, h: number, l: number): Option.Option<string> =>
  Option.liftPredicate(index.lineText[l] ?? '', () => !sameWords(index, l, index.hymnLine[h] ?? 0));

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

const titleHolds = (index: SearchIndex, h: number, count: number) => {
  const title = index.hymnLine[h] ?? 0;
  let held = 0;
  for (let k = index.lineStart[title] ?? 0; k < (index.lineStart[title + 1] ?? 0); k++)
    held |= index.strong[index.lineWords[k] ?? 0] ?? 0;
  const every = (1 << count) - 1;
  return (held & every) === every;
};

const STEPS = [1, 2, 3, -1] as const;

const nextAt = (index: SearchIndex, at: number, from: number, to: number, t: number) => {
  for (const step of STEPS) {
    const place = at + step;
    if (from <= place && place < to && ((index.any[index.lineWords[place] ?? 0] ?? 0) >> t) & 1)
      return place;
  }
  return -1;
};

const runFrom = (index: SearchIndex, s: number, from: number, to: number, T: number) => {
  const bits = index.any[index.lineWords[s] ?? 0] ?? 0;
  const first = 31 - Math.clz32(bits & -bits);
  const typo = (place: number, t: number) =>
    Number((((index.strong[index.lineWords[place] ?? 0] ?? 0) >> t) & 1) === 0);
  let t = first;
  let at = s;
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

interface Ranked {
  readonly h: number;
  readonly line: number;
  readonly plain: boolean;
}

const byWords = (index: SearchIndex, terms: ReadonlyArray<string>): ReadonlyArray<Ranked> => {
  const T = terms.length;
  const N = index.hymns.length;
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
  const before = (a: number, b: number) =>
    (titled[b] ?? 0) - (titled[a] ?? 0) ||
    (titled[a] ?? 0) * (a - b) ||
    (cover[b] ?? 0) - (cover[a] ?? 0) ||
    (sure[b] ?? 0) - (sure[a] ?? 0);
  candidates.sort((a, b) => before(a, b) || (total[b] ?? 0) - (total[a] ?? 0) || a - b);
  const most = cover[candidates[0] ?? 0] ?? 0;
  const heads = candidates.filter((h, i) => i < HEAD && (cover[h] ?? 0) >= most - 1).length;
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

const placed = (index: SearchIndex, numbers: ReadonlyArray<number>): ReadonlyArray<Ranked> =>
  numbers.flatMap((number) =>
    Option.match(Option.fromUndefinedOr(index.places.get(number)), {
      onNone: () => [],
      onSome: (h) => [{ h, line: 0, plain: true }],
    }),
  );

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

const firstOf = (lists: ReadonlyArray<ReadonlyArray<Ranked>>): ReadonlyArray<Ranked> => {
  const seen = new Set<number>();
  return lists.flat().filter(({ h }) => !seen.has(h) && Boolean(seen.add(h)));
};

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

export const find = (index: SearchIndex, query: string): ReadonlyArray<Found> =>
  rankedOf(index, query).flatMap(({ h, line, plain }) =>
    index.hymns.slice(h, h + 1).map((hymn) => ({
      hymn,
      line: Option.filter(shownLine(index, h, line), () => !plain),
    })),
  );

export const search = (index: SearchIndex, query: string): ReadonlyArray<HymnText> =>
  rankedOf(index, query).flatMap(({ h }) => index.hymns.slice(h, h + 1));

export const hymnIndex: () => SearchIndex = (() => {
  let built = Option.none<SearchIndex>();
  return () =>
    Option.getOrElse(built, () => {
      const index = indexOf(hymns);
      built = Option.some(index);
      return index;
    });
})();
