/**
 * The hymnal's back-matter indexes as the app reads them: a hymn's topics,
 * Scripture references, tune and the hymns of its metre, and the hymns on a
 * verse, and a passage's text and its search query. The indexes are bundled
 * with the app (`virtual:hymnal-indexes`, made by `vite/indexes.ts`) as
 * numbers and names only.
 *
 * `lookupsOf` answers over any `HymnIndexes`; the module's own functions
 * answer over the bundled ones, whose tables are built on the first call.
 */

import { getBibleBook } from '@manna/core/bible';
import type { Passage } from '@manna/hymnal/indexes';
import { fold } from '@manna/hymnal/fold';
import { Array as Arr, Option } from 'effect';
import bundled from 'virtual:hymnal-indexes';

export type { Passage } from '@manna/hymnal/indexes';

/** The indexes the app carries (`vite/indexes.ts`). */
export interface HymnIndexes {
  /** The Topical index's topics in printed order, a subtopic naming its heading. */
  readonly topics: ReadonlyArray<{
    readonly name: string;
    readonly parent?: string;
    readonly hymns: ReadonlyArray<number>;
  }>;
  /** The Scriptural index: each reference and the hymn that alludes to it, in printed order. */
  readonly references: ReadonlyArray<{ readonly hymn: number; readonly passage: Passage }>;
  /** The Metrical index: each metre heading and its tunes' hymns. */
  readonly metres: ReadonlyArray<{
    readonly metre: string;
    readonly tunes: ReadonlyArray<{ readonly name: string; readonly hymns: ReadonlyArray<number> }>;
  }>;
  /** The Index of Tunes, each tune by its own name (no alias). */
  readonly tunes: ReadonlyArray<{ readonly name: string; readonly hymns: ReadonlyArray<number> }>;
}

/** A topic a hymn is listed under. */
export interface Topic {
  readonly name: string;
  readonly parent: Option.Option<string>;
}

export interface Lookups {
  /** The other hymns listed under any metre heading `hymn` is listed under, ascending. */
  readonly sameMetre: (hymn: number) => ReadonlyArray<number>;
  /** The topics `hymn` is listed under, in printed order. */
  readonly topicsOf: (hymn: number) => ReadonlyArray<Topic>;
  /** The passages `hymn` alludes to, in printed order. */
  readonly referencesOf: (hymn: number) => ReadonlyArray<Passage>;
  /** The name of the tune `hymn` is sung to. */
  readonly tuneOf: (hymn: number) => Option.Option<string>;
  /**
   * The hymns on a verse, then the rest of its chapter's hymns by their
   * nearest verse's distance from it; a tie goes to the lower number. A
   * reference to the whole chapter is on every verse of it.
   */
  readonly onVerse: (book: number, chapter: number, verse: number) => ReadonlyArray<number>;
  /** The hymns of every topic whose name folds to `name`'s fold, in printed order, each once. */
  readonly topicHymns: (name: string) => ReadonlyArray<number>;
}

const FIRST = 1;
const LAST = 695;
const isHymn = (n: number) => Number.isInteger(n) && n >= FIRST && n <= LAST;

/** The verses of `chapter` a passage covers, as ranges; none when it is not in the chapter. */
const rangesIn = (
  passage: Passage,
  chapter: number,
): ReadonlyArray<{ readonly from: number; readonly to: number }> => {
  if (passage._tag === 'Chapter') {
    if (passage.chapter !== chapter) return [];
    if (passage.verses.length === 0) return WHOLE;
    return passage.verses;
  }
  const { from, to } = passage;
  if (chapter < from.chapter || chapter > to.chapter) return [];
  // A span's first chapter starts at its verse, any later one at verse 1;
  // its last ends at its verse, any earlier one at the chapter's end.
  let start = 1;
  if (chapter === from.chapter) start = from.verse;
  let end = Infinity;
  if (chapter === to.chapter) end = to.verse;
  return [{ from: start, to: end }];
};

const WHOLE = [{ from: 1, to: Infinity }];

/** The chapters a passage touches. */
const chaptersOf = (passage: Passage): ReadonlyArray<number> => {
  if (passage._tag === 'Chapter') return [passage.chapter];
  const { from, to } = passage;
  return Array.from({ length: to.chapter - from.chapter + 1 }, (_, i) => from.chapter + i);
};

/** How many verses the nearest range lies from `verse`: 0 inside one. */
const distance = (
  ranges: ReadonlyArray<{ readonly from: number; readonly to: number }>,
  verse: number,
) => Math.min(...ranges.map((r) => Math.max(0, r.from - verse, verse - r.to)));

const push = <K, V>(map: Map<K, Array<V>>, key: K, value: V) => {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
};

const none: ReadonlyArray<never> = [];

type Reference = HymnIndexes['references'][number];

/** Per hymn, the other hymns of its metre headings, ascending. */
const metreTable = (metres: HymnIndexes['metres']): ReadonlyMap<number, ReadonlyArray<number>> => {
  const groups = new Map<number, Set<number>>();
  for (const metre of metres) {
    const listed = metre.tunes.flatMap((tune) => tune.hymns).filter(isHymn);
    for (const hymn of listed) {
      const group = groups.get(hymn) ?? new Set<number>();
      for (const other of listed) group.add(other);
      group.delete(hymn);
      groups.set(hymn, group);
    }
  }
  return new Map([...groups].map(([hymn, group]) => [hymn, [...group].toSorted((a, b) => a - b)]));
};

/** Per hymn its topics, and per folded topic name its hymns, each once. */
const topicTables = (topics: HymnIndexes['topics']) => {
  const ofHymn = new Map<number, Array<Topic>>();
  const byName = new Map<string, Set<number>>();
  for (const topic of topics) {
    const entry: Topic = { name: topic.name, parent: Option.fromUndefinedOr(topic.parent) };
    for (const hymn of topic.hymns) push(ofHymn, hymn, entry);
    const key = fold(topic.name);
    byName.set(key, new Set([...(byName.get(key) ?? []), ...topic.hymns]));
  }
  return { ofHymn, byName: new Map([...byName].map(([name, set]) => [name, [...set]])) };
};

/** Per hymn its passages, and per `book:chapter` the references that touch it. */
const referenceTables = (references: HymnIndexes['references']) => {
  const ofHymn = new Map<number, Array<Passage>>();
  const byChapter = new Map<string, Array<Reference>>();
  for (const reference of references) {
    push(ofHymn, reference.hymn, reference.passage);
    for (const chapter of chaptersOf(reference.passage))
      push(byChapter, `${reference.passage.book}:${chapter}`, reference);
  }
  return { ofHymn, byChapter };
};

/** The hymns of a chapter's references, nearest `verse` first, a tie to the lower number. */
const byDistance = (references: ReadonlyArray<Reference>, chapter: number, verse: number) => {
  const nearest = new Map<number, number>();
  for (const { hymn, passage } of references) {
    const d = distance(rangesIn(passage, chapter), verse);
    nearest.set(hymn, Math.min(d, nearest.get(hymn) ?? Infinity));
  }
  return [...nearest].toSorted(([a, da], [b, db]) => da - db || a - b).map(([hymn]) => hymn);
};

/** Per hymn the first tune that lists it. */
const tuneTable = (tunes: HymnIndexes['tunes']) => {
  const table = new Map<number, string>();
  for (const tune of tunes)
    for (const hymn of tune.hymns) if (!table.has(hymn)) table.set(hymn, tune.name);
  return table;
};

export const lookupsOf = (indexes: HymnIndexes): Lookups => {
  const same = metreTable(indexes.metres);
  const topics = topicTables(indexes.topics);
  const references = referenceTables(indexes.references);
  const tunes = tuneTable(indexes.tunes);
  return {
    sameMetre: (hymn) => same.get(hymn) ?? none,
    topicsOf: (hymn) => topics.ofHymn.get(hymn) ?? none,
    referencesOf: (hymn) => references.ofHymn.get(hymn) ?? none,
    tuneOf: (hymn) => Option.fromUndefinedOr(tunes.get(hymn)),
    onVerse: (book, chapter, verse) =>
      byDistance(references.byChapter.get(`${book}:${chapter}`) ?? none, chapter, verse),
    topicHymns: (name) => topics.byName.get(fold(name)) ?? none,
  };
};

let built = Option.none<Lookups>();

/** The lookups over the bundled indexes, built on the first call. */
export const lookups = (): Lookups =>
  Option.getOrElse(built, () => {
    const made = lookupsOf(bundled);
    built = Option.some(made);
    return made;
  });

/** A book's name by its canonical number, or its number when the canon has none. */
const bookName = (book: number) =>
  Option.match(getBibleBook(book), { onNone: () => `Book ${book}`, onSome: (b) => b.name });

/** A verse piece as printed: one verse, or the first and last with a dash between. */
const piece = ({ from, to }: { readonly from: number; readonly to: number }, dash: string) => {
  if (from === to) return `${from}`;
  return `${from}${dash}${to}`;
};

/**
 * A passage as the reader sees it: the book's name, the chapter and its
 * verse pieces (`Psalms 98:4, 6`; the whole chapter is `Psalms 23`), or a
 * span from a place to a place (`Genesis 1:1–2:3`).
 */
export const passageText = (passage: Passage): string => {
  const book = bookName(passage.book);
  if (passage._tag === 'Span')
    return `${book} ${passage.from.chapter}:${passage.from.verse}–${passage.to.chapter}:${passage.to.verse}`;
  if (passage.verses.length === 0) return `${book} ${passage.chapter}`;
  return `${book} ${passage.chapter}:${passage.verses.map((v) => piece(v, '–')).join(', ')}`;
};

/**
 * The search query that finds a passage's hymns, as the search parses one
 * (`search.ts`): the chapter, its first verse piece, or a span's first verse.
 * The search reads one verse, one range or one chapter, never a list of
 * pieces or a span across chapters, so the query names where the passage
 * begins.
 */
export const passageQuery = (passage: Passage): string => {
  const book = bookName(passage.book);
  if (passage._tag === 'Span') return `${book} ${passage.from.chapter}:${passage.from.verse}`;
  return Option.match(Arr.head(passage.verses), {
    onNone: () => `${book} ${passage.chapter}`,
    onSome: (first) => `${book} ${passage.chapter}:${piece(first, '-')}`,
  });
};

export const sameMetre: Lookups['sameMetre'] = (hymn) => lookups().sameMetre(hymn);
export const topicsOf: Lookups['topicsOf'] = (hymn) => lookups().topicsOf(hymn);
export const referencesOf: Lookups['referencesOf'] = (hymn) => lookups().referencesOf(hymn);
export const tuneOf: Lookups['tuneOf'] = (hymn) => lookups().tuneOf(hymn);
export const onVerse: Lookups['onVerse'] = (book, chapter, verse) =>
  lookups().onVerse(book, chapter, verse);
export const topicHymns: Lookups['topicHymns'] = (name) => lookups().topicHymns(name);
