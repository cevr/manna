/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): a build-time rule over plain rows, run by tools/study.ts and the tests. */

/**
 * The three study packs' parts, from the rows `bible.db` holds and the app's
 * own text: the cross-references (each verse's first `XREFS_KEPT`, in
 * OpenBible.info's order), the tags lined up with the shown words
 * (`alignVerse`), and the lexicon with how the KJV renders each number,
 * counted over those tags, so the counts are true of this text. Each pack
 * builds alone, and the tags by any run of chapters, so a test reads only
 * what it checks.
 */

import { alignVerse, type AlignKind, type TaggedWord } from './align';
import { lexiconParts, numberPlace, RENDERS_KEPT, type LexiconLine, type Render } from './lexicon';
import { letterOf, tagsChapterText, tagsOfVerse, tagsVerses, tagsVerseText } from './tags';
import { renderOf } from './words';
import { xrefsChapterText, type XrefPlace } from './xrefs';

/** A Strong's entry as the lexicon holds it; an absent field is empty. */
export interface LexiconEntry {
  readonly number: string;
  readonly lemma: string;
  readonly xlit: string;
  readonly pron: string;
  readonly def: string;
}

/** What the packs are built from. */
export interface StudySource {
  /** The canon's chapters in order, as `[book, chapter]`. */
  readonly canon: ReadonlyArray<readonly [number, number]>;
  /** The app's text: per chapter, its verses' shown text joined by `\n`. */
  readonly chapters: ReadonlyArray<string>;
  /** A verse's references in the source's order, by `book.chapter.verse`. */
  readonly xrefs: (key: string) => ReadonlyArray<XrefPlace>;
  /** A verse's tagged words in order, by `book.chapter.verse`; none when it has none. */
  readonly words: (key: string) => ReadonlyArray<TaggedWord> | undefined;
  /** Every lexicon entry. */
  readonly lexicon: ReadonlyArray<LexiconEntry>;
}

/** How the tags lined up: how many verses each way, the bare verses' references, and how many tagged words with numbers kept them. */
export interface AlignCounts {
  readonly equal: number;
  readonly aligned: number;
  readonly bare: number;
  readonly bareVerses: ReadonlyArray<string>;
  readonly numbered: number;
  readonly kept: number;
}

/** The packs' parts and how the tags lined up. */
export interface StudyBuilt {
  readonly xrefs: ReadonlyArray<string>;
  readonly tags: ReadonlyArray<string>;
  readonly lexicon: ReadonlyArray<string>;
  readonly counts: AlignCounts;
}

/** The verses of chapter `index` of the source's text. */
const versesAt = (source: Pick<StudySource, 'chapters'>, index: number) =>
  (source.chapters[index] ?? '').split('\n');

/** The cross-references pack's parts. */
export const buildXrefs = (source: Pick<StudySource, 'canon' | 'chapters' | 'xrefs'>) =>
  source.canon.map(([book, chapter], index) =>
    xrefsChapterText(
      versesAt(source, index).map((_, at) => source.xrefs(`${book}.${chapter}.${at + 1}`)),
    ),
  );

/** The tags pack's parts for the chapters `from` to `to` (indexes, `to` excluded; all by default), and how they lined up. */
export const buildTags = (
  source: Pick<StudySource, 'canon' | 'chapters' | 'words'>,
  from = 0,
  to = source.canon.length,
) => {
  const kinds: Record<AlignKind, number> = { equal: 0, aligned: 0, bare: 0 };
  const bareVerses: Array<string> = [];
  let numbered = 0;
  let kept = 0;
  const parts = source.canon.slice(from, to).map(([book, chapter], offset) =>
    tagsChapterText(
      versesAt(source, from + offset).map((text, at) => {
        const tagged = source.words(`${book}.${chapter}.${at + 1}`);
        if (tagged === undefined) return '';
        const aligned = alignVerse(text.split(' '), tagged);
        kinds[aligned.kind]++;
        if (aligned.kind === 'bare') bareVerses.push(`${book}.${chapter}.${at + 1}`);
        numbered += tagged.filter((word) => word.numbers.length > 0).length;
        const reached = new Set(aligned.from);
        kept += tagged.filter(
          (word, place) => word.numbers.length > 0 && reached.has(place),
        ).length;
        return tagsVerseText(aligned.tags);
      }),
    ),
  );
  const counts: AlignCounts = { ...kinds, bareVerses, numbered, kept };
  return { parts, counts };
};

/** How often each number (`H25`) is carried, and by which shown words. */
export interface Tally {
  readonly totals: Map<string, number>;
  readonly words: Map<string, Map<string, number>>;
}

/** Each number's carriers over the tags pack's `parts`, the shown words read from the source's text. */
export const tallyOf = (
  source: Pick<StudySource, 'canon' | 'chapters'>,
  parts: ReadonlyArray<string>,
): Tally => {
  const totals = new Map<string, number>();
  const words = new Map<string, Map<string, number>>();
  source.canon.forEach(([book], index) => {
    const letter = letterOf(book);
    const verses = versesAt(source, index);
    tagsVerses(parts[index] ?? '').forEach((verse, at) => {
      const shown = (verses[at] ?? '').split(' ');
      (tagsOfVerse(verse) ?? []).forEach((tag, place) => {
        for (const n of tag.numbers) {
          const number = `${letter}${n}`;
          totals.set(number, (totals.get(number) ?? 0) + 1);
          const word = renderOf(shown[place] ?? '');
          if (word === '') continue;
          const counts = words.get(number) ?? new Map<string, number>();
          words.set(number, counts);
          counts.set(word, (counts.get(word) ?? 0) + 1);
        }
      });
    });
  });
  return { totals, words };
};

/** A number's top renderings: most carried first, then by the word. */
export const topRenders = (counts: ReadonlyMap<string, number> | undefined): Array<Render> =>
  [...(counts ?? new Map<string, number>())]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0))
    .slice(0, RENDERS_KEPT);

/** The lexicon pack's parts, each entry with its renderings from `tally`. */
export const buildLexicon = (entries: ReadonlyArray<LexiconEntry>, tally: Tally) => {
  const hebrew: Array<LexiconLine | undefined> = [];
  const greek: Array<LexiconLine | undefined> = [];
  const lines = { H: hebrew, G: greek };
  for (const entry of entries) {
    const place = numberPlace(entry.number);
    if (place === undefined) continue;
    lines[place.letter][place.n - 1] = {
      lemma: entry.lemma,
      xlit: entry.xlit,
      pron: entry.pron,
      def: entry.def,
      total: tally.totals.get(entry.number) ?? 0,
      renders: topRenders(tally.words.get(entry.number)),
    };
  }
  const filled = (sparse: Array<LexiconLine | undefined>) =>
    Array.from({ length: sparse.length }, (_, index) => sparse[index]);
  return lexiconParts(filled(lines.H), filled(lines.G));
};

/** The parts of the three packs from `source`. */
export const buildStudy = (source: StudySource): StudyBuilt => {
  const tags = buildTags(source);
  return {
    xrefs: buildXrefs(source),
    tags: tags.parts,
    lexicon: buildLexicon(source.lexicon, tallyOf(source, tags.parts)),
    counts: tags.counts,
  };
};
