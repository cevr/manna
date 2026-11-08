import { Option } from 'effect';

import { HEARD, hearingsOf, LONGEST_HEARING } from './hearings';
import { isNumberWord, numberValue } from './numbers';
import { LONGEST_SPELLING, SPELLING_MATCHES } from './words';

/** The longest span in words that a spelling or a hearing can match. */
const LONGEST_SPAN = Math.max(LONGEST_SPELLING, LONGEST_HEARING);

/** A run of words, `start` inclusive and `end` exclusive. */
type Span = Readonly<{ start: number; end: number }>;

/** A span with the tags it matches by: one shared tag makes an edge. */
type Tagged = Readonly<{ span: Span; tags: readonly string[] }>;

/** One matched span pair: source words held by spoken words. */
type Group = Readonly<{ source: Span; spoken: Span }>;

export type Alignment = Readonly<{ groups: readonly Group[]; hits: number; used: number }>;

/** A single word's own key tag; a longer span has none. */
const lexicalTags = (words: readonly string[]): readonly string[] => {
  if (words.length !== 1) return [];
  return words.map((word) => `=${word}`);
};

/** The spelling tags of a span: the keys it matches (`wants`), or its own key. */
const spellingTags = (words: readonly string[], wants: boolean): readonly string[] => {
  if (words.length > LONGEST_SPELLING) return [];
  const key = words.join(' ');
  const matches = SPELLING_MATCHES.get(key) ?? [];
  if (wants || matches.length === 0) return matches.map((match) => `~${match}`);
  return [`~${key}`];
};

/**
 * The hearing tags of a span, one way only: a source word (`wants`) wants
 * each of its hearings, and a spoken span offers its own key when it is a
 * hearing. A spoken word never wants, so a spoken archaic word never
 * matches its hearing in the verse, and a hearing meets only its own word.
 */
const hearingTags = (words: readonly string[], wants: boolean): readonly string[] => {
  const key = words.join(' ');
  if (wants) {
    if (words.length !== 1) return [];
    return hearingsOf(key).map((hearing) => `^${hearing}`);
  }
  if (HEARD.has(key)) return [`^${key}`];
  return [];
};

/** A span's tags: its key when it is one word, its spellings, its hearings, and its numeric value. */
const tagsOf = (words: readonly string[], wants: boolean): readonly string[] => [
  ...lexicalTags(words),
  ...spellingTags(words, wants),
  ...hearingTags(words, wants),
  ...Option.toArray(Option.map(numberValue(words), (value) => `#${value}`)),
];

/**
 * Every span of `keys` that can match, with its tags: a single word by its
 * key, a spelling by the keys it matches (`wants`) or its own (offers), an
 * archaic word by its hearings (`wants`) or a hearing by its own key
 * (offers), and a numeric phrase by its value.
 */
const spans = (keys: readonly string[], wants: boolean): readonly Tagged[] => {
  const found: Tagged[] = [];
  for (let start = 0; start < keys.length; start += 1) {
    let numeric = true;
    for (let end = start + 1; end <= keys.length; end += 1) {
      const words = keys.slice(start, end);
      numeric = numeric && isNumberWord(words.at(-1) ?? '');
      const tags = tagsOf(words, wants);
      if (tags.length > 0) found.push({ span: { start, end }, tags });
      if (!numeric && end - start >= LONGEST_SPAN) break;
    }
  }
  return found;
};

/** A verse's spans, kept so each recognition pass reuses them. */
export type SourceSpans = readonly Tagged[];

export const sourceSpans = (keys: readonly string[]): SourceSpans => spans(keys, true);

/** A transcript's spans, indexed by tag. */
type SpokenSpans = ReadonlyMap<string, readonly Span[]>;

export const spokenSpans = (keys: readonly string[]): SpokenSpans => {
  const index = new Map<string, Span[]>();
  for (const { span, tags } of spans(keys, false)) {
    for (const tag of tags) index.set(tag, [...(index.get(tag) ?? []), span]);
  }
  return index;
};

/** Every distinct edge from a source span at or after `from` to a spoken span sharing a tag. */
const edgesOf = (source: SourceSpans, from: number, spoken: SpokenSpans): readonly Group[] => {
  const edges = new Map<string, Group>();
  for (const { span, tags } of source) {
    if (span.start < from) continue;
    for (const tag of tags) {
      for (const said of spoken.get(tag) ?? []) {
        const id = `${span.start}:${span.end}:${said.start}:${said.end}`;
        edges.set(id, { source: span, spoken: said });
      }
    }
  }
  return [...edges.values()];
};

/**
 * The best score from each (source index, spoken index) cell to the end:
 * source words matched times `width`, plus spoken words consumed, so the
 * first count always outranks the second.
 */
type Table = Readonly<{ best: Float64Array; width: number }>;

const scoreAt = (table: Table, source: number, spoken: number) =>
  table.best[source * table.width + spoken] ?? 0;

const weight = (edge: Group, width: number) =>
  (edge.source.end - edge.source.start) * width + edge.spoken.end - edge.spoken.start;

const tableOf = (
  edges: readonly Group[],
  sourceLength: number,
  from: number,
  length: number,
): Table => {
  const width = length + 1;
  const table: Table = { best: new Float64Array((sourceLength + 1) * width), width };
  const starting = new Map<number, Group[]>();
  for (const edge of edges) {
    const cell = edge.source.start * width + edge.spoken.start;
    starting.set(cell, [...(starting.get(cell) ?? []), edge]);
  }
  for (let i = sourceLength - 1; i >= from; i -= 1) {
    for (let k = length - 1; k >= 0; k -= 1) {
      let score = Math.max(scoreAt(table, i + 1, k), scoreAt(table, i, k + 1));
      for (const edge of starting.get(i * width + k) ?? []) {
        score = Math.max(
          score,
          weight(edge, width) + scoreAt(table, edge.source.end, edge.spoken.end),
        );
      }
      table.best[i * width + k] = score;
    }
  }
  return table;
};

/**
 * The groups of the best score, read forward: at each step the earliest
 * edge, by source index, first and last spoken index, that keeps the best
 * score reachable, so ties fall to the lexicographically earliest triples.
 */
const groupsOf = (edges: readonly Group[], table: Table, from: number): readonly Group[] => {
  const ordered = edges.toSorted(
    (a, b) =>
      a.source.start - b.source.start ||
      a.spoken.start - b.spoken.start ||
      a.spoken.end - b.spoken.end ||
      b.source.end - a.source.end,
  );
  const groups: Group[] = [];
  let i = from;
  let k = 0;
  for (const edge of ordered) {
    const target = scoreAt(table, i, k);
    if (target === 0) break;
    if (edge.source.start < i || edge.spoken.start < k) continue;
    const rest = scoreAt(table, edge.source.end, edge.spoken.end);
    if (weight(edge, table.width) + rest !== target) continue;
    groups.push(edge);
    i = edge.source.end;
    k = edge.spoken.end;
  }
  return groups;
};

/**
 * The best monotone alignment of the source's words from `from` on with
 * `length` spoken words: most source words matched, then most spoken words
 * consumed, then the earliest sequence of (source index, first spoken
 * index, last spoken index) triples in source order. Each word on either
 * side is consumed at most once.
 */
export const align = (
  source: SourceSpans,
  sourceLength: number,
  from: number,
  spoken: SpokenSpans,
  length: number,
): Alignment => {
  const edges = edgesOf(source, from, spoken);
  const table = tableOf(edges, sourceLength, from, length);
  const score = scoreAt(table, from, 0);
  return {
    groups: groupsOf(edges, table, from),
    hits: Math.floor(score / table.width),
    used: score % table.width,
  };
};
