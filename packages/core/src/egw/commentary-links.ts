/**
 * Which verses each paragraph comments on, read from the paragraphs
 * themselves: the one reading the stored link rows, the study and the
 * commentary pack share.
 *
 * Two readings, both from the paragraph's nodes:
 *
 * - a citation names every verse its printed text names, read with its
 *   `title` as context: "John 1:1-3, 14" titled "John 1:1" names verses 1, 2,
 *   3 and 14; "14" titled "John 1:14" names John 1:14; "2:9" moves to chapter
 *   2 of the title's book. The title alone names only the first verse;
 * - the Bible Commentary volumes are laid out as verse headings, a paragraph
 *   that opens with a bold citation ("1-3", "14"), and the paragraphs under a
 *   heading, up to the next heading or section title, comment on the verses
 *   it names. Section titles (`h1`-`h6`) of a volume are never notes.
 *
 * Every book is read for its citations; only a volume laid out by verse
 * headings (`readerFor`) is read for its headings too.
 */

import { Array as Arr, Option } from 'effect';

import { parseBibleQuery } from '../bible/parse.js';
import type { Paragraph } from './schemas.js';

type Node = Paragraph['nodes'][number];

/** A paragraph as the reading needs it, in publication order. */
type VolumeParagraph = Pick<Paragraph, 'nodes' | 'element_type'>;

/** A verse, or a whole chapter when `bibleVerse` is none. */
interface CitedVerse {
  readonly bibleBook: number;
  readonly bibleChapter: number;
  readonly bibleVerse: Option.Option<number>;
}

/** Each paragraph's verses, in the order given. */
export type VersesReader = (
  paragraphs: readonly VolumeParagraph[],
) => readonly (readonly CitedVerse[])[];

/** The Bible Commentary's volumes, the books laid out by verse headings. */
const VERSE_HEADING_BOOKS: readonly string[] = [
  '1BC',
  '2BC',
  '3BC',
  '4BC',
  '5BC',
  '6BC',
  '7BC',
  '7ABC',
];

interface Place {
  readonly book: number;
  readonly chapter: number;
}

interface Read {
  readonly place: Place;
  readonly verses: readonly CitedVerse[];
}

const MAX_RANGE = 200;

const verse = (place: Place, number: number): CitedVerse => ({
  bibleBook: place.book,
  bibleChapter: place.chapter,
  bibleVerse: Option.some(number),
});

const wholeChapter = (place: Place): CitedVerse => ({
  bibleBook: place.book,
  bibleChapter: place.chapter,
  bibleVerse: Option.none(),
});

const span = (place: Place, from: number, to: number): readonly CitedVerse[] => {
  if (to < from || to - from > MAX_RANGE) return [];
  return Arr.makeBy(to - from + 1, (at) => verse(place, from + at));
};

/** What a parsed reference names, and the place it leaves the reading at. */
const named = (parsed: ReturnType<typeof parseBibleQuery>): Option.Option<Read> => {
  switch (parsed._tag) {
    case 'single': {
      const place = { book: parsed.ref.book, chapter: parsed.ref.chapter };
      return Option.some({ place, verses: [verse(place, parsed.ref.verse)] });
    }
    case 'verseRange': {
      const place = { book: parsed.ref.start.book, chapter: parsed.ref.start.chapter };
      return Option.some({
        place,
        verses: span(place, parsed.ref.start.verse, parsed.ref.end.verse),
      });
    }
    case 'chapter': {
      const place = { book: parsed.ref.book, chapter: parsed.ref.chapter };
      return Option.some({ place, verses: [wholeChapter(place)] });
    }
    case 'chapterRange':
    case 'fullBook':
    case 'search':
      return Option.none();
  }
};

const CHAPTER_VERSES = /^(?:ch(?:apter|\.)?\s*)?(\d+):(\d+)(?:\s*[-–]\s*(\d+))?$/i;
const VERSES = /^(\d+)(?:\s*[-–]\s*(\d+))?$/;
const WHOLE_CHAPTER = /^ch(?:apter|\.)?\s*(\d+)$/i;

/** The groups of `pattern` in `text`, when it matches whole. */
const groups = (pattern: RegExp, text: string): Option.Option<readonly Option.Option<number>[]> =>
  Option.map(Option.fromNullishOr(pattern.exec(text)), (match) =>
    match
      .slice(1)
      .map((group) =>
        Option.map(Option.fromUndefinedOr(group), (digits) => Number.parseInt(digits, 10)),
      ),
  );

const at = (found: readonly Option.Option<number>[], index: number, fallback: number): number =>
  Option.getOrElse(Option.flatten(Option.fromUndefinedOr(found[index])), () => fallback);

/** One printed segment of a citation ("1:1-3", "14", "Chapter 2", "Heb. 2:14")
 *  read at `place`: the verses it names and the place it leaves. */
const segmentAt = (place: Place, segment: string): Option.Option<Read> =>
  Option.firstSomeOf([
    Option.map(groups(CHAPTER_VERSES, segment), (found) => {
      const moved = { book: place.book, chapter: at(found, 0, place.chapter) };
      const from = at(found, 1, 1);
      return { place: moved, verses: span(moved, from, at(found, 2, from)) };
    }),
    Option.map(groups(VERSES, segment), (found) => {
      const from = at(found, 0, 1);
      return { place, verses: span(place, from, at(found, 1, from)) };
    }),
    Option.map(groups(WHOLE_CHAPTER, segment), (found) => {
      const moved = { book: place.book, chapter: at(found, 0, place.chapter) };
      return { place: moved, verses: [wholeChapter(moved)] };
    }),
    named(parseBibleQuery(segment)),
  ]);

/** The verses one citation names: its printed `text` read in the context of
 *  its `title`. A first segment the reading cannot place names the title's
 *  own verses, so a citation never names less than its title. */
const citedVerses = (title: string, text: string): readonly CitedVerse[] =>
  Option.match(named(parseBibleQuery(title)), {
    onNone: () => [],
    onSome: (head) => {
      let place = head.place;
      const out: CitedVerse[] = [];
      text.split(/[;,]/).forEach((raw, index) => {
        const read = segmentAt(place, raw.trim().replace(/[.:]$/, ''));
        if (Option.isSome(read)) {
          place = read.value.place;
          out.push(...read.value.verses);
        } else if (index === 0) out.push(...head.verses);
      });
      return out;
    },
  });

const isBlank = (node: Node): boolean => node._tag === 'Text' && node.text.trim().length === 0;

const textOf = (nodes: readonly Node[]): string =>
  nodes
    .map((node) => {
      if (node._tag === 'Text') return node.text;
      if ('children' in node) return textOf(node.children);
      return '';
    })
    .join('');

const citationsIn = (nodes: readonly Node[]): readonly CitedVerse[] =>
  nodes.flatMap((node) => {
    if (node._tag === 'ScriptureRef') return citedVerses(node.title, textOf(node.children));
    if ('children' in node) return citationsIn(node.children);
    return [];
  });

/** The citation a paragraph opens with, bold or bare: a verse heading. */
const headingOf = (nodes: readonly Node[]): Option.Option<readonly CitedVerse[]> =>
  Option.flatMap(
    Arr.findFirst(nodes, (node) => !isBlank(node)),
    (first): Option.Option<readonly CitedVerse[]> => {
      if (first._tag === 'ScriptureRef')
        return Option.some(citedVerses(first.title, textOf(first.children)));
      if (first._tag === 'Unknown' && first.tag === 'strong') return headingOf(first.children);
      return Option.none();
    },
  );

const isSectionTitle = (paragraph: VolumeParagraph): boolean =>
  Option.exists(Option.fromNullishOr(paragraph.element_type), (type) => /^h\d$/.test(type));

const keyOf = (cited: CitedVerse): string =>
  `${String(cited.bibleBook)}.${String(cited.bibleChapter)}.${String(Option.getOrElse(cited.bibleVerse, () => 0))}`;

const once = (verses: readonly CitedVerse[]): readonly CitedVerse[] =>
  Arr.dedupeWith(verses, (left, right) => keyOf(left) === keyOf(right));

/** Each paragraph's own citations, once each. */
export const citationVerses: VersesReader = (paragraphs) =>
  paragraphs.map((paragraph) => once(citationsIn(paragraph.nodes)));

/** A reader of one volume given in parts, in publication order: the heading a
 *  part ends under carries into the next, so reading a volume chapter by
 *  chapter gives what reading it whole gives. Each paragraph's verses are its
 *  own citations and the verses of the heading it stands under. */
const volumeReader = (): VersesReader => {
  let section: readonly CitedVerse[] = [];
  return (paragraphs) =>
    paragraphs.map((paragraph) => {
      if (isSectionTitle(paragraph)) {
        section = [];
        return [];
      }
      section = Option.getOrElse(headingOf(paragraph.nodes), () => section);
      return once([...section, ...citationsIn(paragraph.nodes)]);
    });
};

/** A whole volume's paragraphs read at once (`volumeReader`). */
export const volumeVerses: VersesReader = (paragraphs) => volumeReader()(paragraphs);

/** The reader for the book `code` names: its headings and citations for a
 *  volume laid out by verse headings, its citations alone for any other. */
export const readerFor = (code: string): VersesReader => {
  if (VERSE_HEADING_BOOKS.includes(code)) return volumeReader();
  return citationVerses;
};
