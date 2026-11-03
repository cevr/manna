import { Effect, Layer, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { Reference } from '../bible/model.js';
import {
  BibleDatabase,
  type ConcordanceHit,
  type CrossReference,
  type MarginNote,
  type StrongsEntry,
  type VerseWord,
} from '../bible-db/bible-database.js';
import { EGWCommentaryService } from '../egw-commentary/service.js';
import { EGWParagraphDatabase, type BibleRefRow, type BookRow } from '../egw-db/book-database.js';
import type { Paragraph } from '../egw/schemas.js';
import {
  DEFAULT_CONCORDANCE_LIMIT,
  DEFAULT_PARALLEL_WRITINGS_LIMIT,
  strongsNumber,
} from './model.js';
import { StudyService } from './service.js';

const wireNull = Option.getOrNull(Option.none<never>());

const DANIEL = 27;
const DAN_8_13 = Reference.verse(DANIEL, 8, 13);

const commentaryBook: BookRow = {
  book_id: 501,
  book_code: '5BC',
  book_title: 'EGW SDA Bible Commentary, vol. 5',
  book_author: 'Ellen Gould White',
  paragraph_count: 1,
  created_at: '2026-01-01',
};

const otherBook: BookRow = {
  book_id: 502,
  book_code: 'GC',
  book_title: 'The Great Controversy',
  book_author: 'Ellen Gould White',
  paragraph_count: 1,
  created_at: '2026-01-01',
};

const estateBook: BookRow = {
  book_id: 503,
  book_code: 'LDE',
  book_title: 'Last Day Events',
  book_author: 'Ellen G. White Estate',
  paragraph_count: 1,
  created_at: '2026-01-01',
};

const henry: BookRow = {
  book_id: 504,
  book_code: 'MHC',
  book_title: "Matthew Henry's Commentary",
  book_author: 'Matthew Henry',
  paragraph_count: 1,
  created_at: '2026-01-01',
};

const strongsBook: BookRow = {
  book_id: 505,
  book_code: 'SC',
  book_title: "Strong's Concordance",
  book_author: 'James Strong',
  paragraph_count: 1,
  created_at: '2026-01-01',
};

const paragraph = (
  bookCode: string,
  refcode: string,
  text: string,
): Paragraph & { bookCode: string } => ({
  bookCode,
  para_id: Option.some(refcode),
  id_prev: wireNull,
  id_next: wireNull,
  refcode_1: wireNull,
  refcode_2: wireNull,
  refcode_3: wireNull,
  refcode_4: wireNull,
  refcode_short: Option.some(refcode),
  refcode_long: wireNull,
  element_type: 'p',
  element_subtype: wireNull,
  nodes: [{ _tag: 'Text', text }],
  puborder: 1,
});

const bibleRef = (bookId: number, refcode: string, verse: number): BibleRefRow => ({
  para_book_id: bookId,
  para_ref_code: refcode,
  bible_book: DANIEL,
  bible_chapter: 8,
  bible_verse: verse,
});

const writings = EGWParagraphDatabase.Test({
  books: [commentaryBook, otherBook, estateBook, henry, strongsBook],
  paragraphs: [
    paragraph('5BC', '5BC 1116.1', 'The daily is the continual mediation of Christ.'),
    paragraph('GC', 'GC 324.1', 'The sanctuary in heaven is the great original.'),
    paragraph('LDE', 'LDE 250.1', 'The daily and the sanctuary, compiled.'),
    paragraph('MHC', 'MHC Dan 8.1', 'Henry on the vision of the evenings and mornings.'),
    paragraph('SC', 'SC H8548', 'tamid: continuance, continually.'),
  ],
  bibleRefs: [
    bibleRef(501, '5BC 1116.1', 13),
    bibleRef(502, 'GC 324.1', 13),
    bibleRef(503, 'LDE 250.1', 13),
    bibleRef(504, 'MHC Dan 8.1', 13),
    bibleRef(505, 'SC H8548', 13),
  ],
});

const manyWritings = EGWParagraphDatabase.Test({
  books: [
    ...Array.from({ length: 30 }, (_, index) => ({
      book_id: 600 + index,
      book_code: `EGW${String(index)}`,
      book_title: `EGW volume ${String(index)}`,
      book_author: 'Ellen Gould White',
      paragraph_count: 1,
      created_at: '2026-01-01',
    })),
    ...Array.from({ length: 10 }, (_, index) => ({
      book_id: 700 + index,
      book_code: `OTH${String(index)}`,
      book_title: `Secondary work ${String(index)}`,
      book_author: 'Matthew Henry',
      paragraph_count: 1,
      created_at: '2026-01-01',
    })),
  ],
  paragraphs: [
    ...Array.from({ length: 30 }, (_, index) =>
      paragraph(`EGW${String(index)}`, `EGW${String(index)} 1.1`, `EGW citation ${String(index)}`),
    ),
    ...Array.from({ length: 10 }, (_, index) =>
      paragraph(
        `OTH${String(index)}`,
        `OTH${String(index)} 1.1`,
        `Other citation ${String(index)}`,
      ),
    ),
  ],
  bibleRefs: [
    ...Array.from({ length: 30 }, (_, index) =>
      bibleRef(600 + index, `EGW${String(index)} 1.1`, 13),
    ),
    ...Array.from({ length: 10 }, (_, index) =>
      bibleRef(700 + index, `OTH${String(index)} 1.1`, 13),
    ),
  ],
});

const uncitableWritings = EGWParagraphDatabase.Test({
  books: [otherBook],
  paragraphs: [paragraph('GC', '', 'A paragraph the corpus stored with no refcode.')],
  bibleRefs: [bibleRef(502, '', 13)],
});

const sparseWritings = EGWParagraphDatabase.Test({
  books: [commentaryBook],
  paragraphs: [paragraph('5BC', '5BC 1116.1', 'Unrelated.')],
  bibleRefs: [bibleRef(501, '5BC 1116.1', 27)],
});

const words: readonly VerseWord[] = [
  { text: 'Then', strongsNumbers: [], italic: false },
  { text: 'I heard', strongsNumbers: ['H8085'], italic: false },
  { text: 'the daily', strongsNumbers: ['H8548'], italic: false },
  { text: 'sacrifice', strongsNumbers: [], italic: true },
];

const crossRefs: readonly CrossReference[] = [
  {
    book: 66,
    chapter: 12,
    verse: Option.some(6),
    verseEnd: Option.none(),
    source: 'openbible',
    previewText: Option.some('And the woman fled into the wilderness…'),
  },
  {
    book: 66,
    chapter: 13,
    verse: Option.none(),
    verseEnd: Option.none(),
    source: 'tske',
    previewText: Option.none(),
  },
];

const marginNotes: readonly MarginNote[] = [
  { index: 0, type: 'hebrew', phrase: 'the daily', text: 'Heb. the continual' },
  {
    index: 1,
    type: 'alternate',
    phrase: 'transgression of desolation',
    text: 'Or, making desolate',
  },
];

const tamid: StrongsEntry = {
  number: 'H8548',
  language: 'hebrew',
  lemma: 'תָּמִיד',
  transliteration: Option.some('tamiyd'),
  pronunciation: Option.some('taw-meed'),
  definition: 'continuance, continually, perpetual',
  kjvDefinition: Option.some('alway(-s), continual (employment, -ly), daily'),
};

const tamidHits: readonly ConcordanceHit[] = Array.from({ length: 60 }, (_, index) => ({
  book: 2,
  bookName: 'Exodus',
  chapter: 25,
  verse: index + 1,
  text: `Occurrence ${String(index + 1)} of the continual.`,
  word: 'continual',
}));

const bible = BibleDatabase.layerTest({
  verses: [
    {
      book: DANIEL,
      chapter: 8,
      verse: 13,
      versionCode: 'KJV',
      text: 'Then I heard one saint speaking…',
    },
  ],
  verseWords: [{ book: DANIEL, chapter: 8, verse: 13, words }],
  crossRefs: [{ book: DANIEL, chapter: 8, verse: 13, references: crossRefs }],
  marginNotes: [{ book: DANIEL, chapter: 8, verse: 13, notes: marginNotes }],
  strongsEntries: [tamid],
  concordanceHits: { H8548: tamidHits },
});

const malformedBible = BibleDatabase.layerTest({
  verses: [
    {
      book: DANIEL,
      chapter: 8,
      verse: 13,
      versionCode: 'KJV',
      text: 'Then I heard one saint speaking…',
    },
  ],
  verseWords: [{ book: DANIEL, chapter: 8, verse: 13, words }],
  crossRefs: [{ book: DANIEL, chapter: 8, verse: 13, references: crossRefs }],
  marginNotes: [
    {
      book: DANIEL,
      chapter: 8,
      verse: 13,
      notes: [
        {
          index: 0,
          type: 'not-a-margin-note-kind' as MarginNote['type'],
          phrase: 'the daily',
          text: 'Heb. the continual',
        },
      ],
    },
  ],
  strongsEntries: [tamid],
  concordanceHits: { H8548: tamidHits },
});

const study = (
  library: Layer.Layer<EGWParagraphDatabase>,
  bibleLayer: Layer.Layer<BibleDatabase> = bible,
) =>
  StudyService.Live.pipe(
    Layer.provide(bibleLayer),
    Layer.provide(EGWCommentaryService.Live.pipe(Layer.provide(library))),
  );

describe('StudyService.verse', () => {
  it.effect('carries all five sections for a verse that has all five', () =>
    Effect.gen(function* () {
      const bundle = yield* Effect.flatMap(StudyService, (service) => service.verse(DAN_8_13));

      expect(bundle.label).toBe('Daniel 8:13');
      expect(bundle.text).toEqual(Option.some('Then I heard one saint speaking…'));

      expect(bundle.words.map((word) => word.text)).toEqual([
        'Then',
        'I heard',
        'the daily',
        'sacrifice',
      ]);
      expect(bundle.words[2]?.strongs.map(String)).toEqual(['H8548']);
      expect(bundle.words[3]?.italic).toBe(true);

      expect(bundle.crossRefs.map((reference) => reference.label)).toEqual([
        'Revelation 12:6',
        'Revelation 13',
      ]);
      expect(bundle.crossRefs[0]?.source).toBe('openbible');

      expect(bundle.marginNotes.map((note) => note.text)).toEqual([
        'Heb. the continual',
        'Or, making desolate',
      ]);
      expect(bundle.marginNotes[0]?.kind).toBe('hebrew');

      expect(bundle.commentary.map((entry) => entry.bookCode)).toEqual(['5BC']);
      expect(bundle.commentary[0]?.content).toBe('The daily is the continual mediation of Christ.');

      expect(bundle.parallelWritings.map((entry) => entry.bookCode)).toEqual(['GC', 'LDE']);
      expect(bundle.parallelWritingsTotal).toBe(2);

      expect(bundle.commentary.length + bundle.parallelWritings.length).toBe(3);
    }).pipe(Effect.provide(study(writings))),
  );

  it.effect('keeps only EGW-scope rows in parallel writings', () =>
    Effect.gen(function* () {
      const bundle = yield* Effect.flatMap(StudyService, (service) => service.verse(DAN_8_13));

      const authors = new Set(bundle.parallelWritings.map((entry) => entry.bookCode));
      expect(authors.has('MHC')).toBe(false);
      expect(authors.has('SC')).toBe(false);
      expect(authors.has('GC')).toBe(true);
      expect(authors.has('LDE')).toBe(true);
      expect(bundle.parallelWritingsTotal).toBe(2);
    }).pipe(Effect.provide(study(writings))),
  );

  it.effect('yields an empty parallel-writings list on sparse refs, not an error', () =>
    Effect.gen(function* () {
      const bundle = yield* Effect.flatMap(StudyService, (service) => service.verse(DAN_8_13));

      expect(bundle.parallelWritings).toEqual([]);
      expect(bundle.parallelWritingsTotal).toBe(0);
      expect(bundle.commentary).toEqual([]);
      expect(bundle.marginNotes.length).toBe(2);
      expect(bundle.crossRefs.length).toBe(2);
      expect(bundle.words.length).toBe(4);
    }).pipe(Effect.provide(study(sparseWritings))),
  );

  it.effect('caps parallel writings at the default and reports the post-scope total', () =>
    Effect.gen(function* () {
      const bundle = yield* Effect.flatMap(StudyService, (service) => service.verse(DAN_8_13));

      expect(bundle.parallelWritings.length).toBe(DEFAULT_PARALLEL_WRITINGS_LIMIT);
      expect(bundle.parallelWritingsTotal).toBe(30);
      expect(bundle.parallelWritingsTotal).not.toBe(bundle.parallelWritings.length);
      expect(bundle.parallelWritingsTotal).not.toBe(40);
    }).pipe(Effect.provide(study(manyWritings))),
  );

  it.effect('caps parallel writings at a caller-stated limit', () =>
    Effect.gen(function* () {
      const bundle = yield* Effect.flatMap(StudyService, (service) =>
        service.verse(DAN_8_13, { parallelWritingsLimit: 4 }),
      );
      expect(bundle.parallelWritings.length).toBe(4);
      expect(bundle.parallelWritingsTotal).toBe(30);
    }).pipe(Effect.provide(study(manyWritings))),
  );

  it.effect('fails with a typed corpus-data error on a malformed row', () =>
    Effect.gen(function* () {
      const outcome = yield* Effect.flip(
        Effect.flatMap(StudyService, (service) => service.verse(DAN_8_13)),
      );

      expect(outcome._tag).toBe('StudyCorpusDataError');
      if (outcome._tag !== 'StudyCorpusDataError') return;
      expect(outcome.source).toBe('bible');
      expect(outcome.operation).toBe('verse.marginNotes');
      expect(outcome.row).toContain('note 0');
    }).pipe(Effect.provide(study(writings, malformedBible))),
  );

  it.effect('returns a citation-less row rather than failing the whole bundle', () =>
    Effect.gen(function* () {
      const bundle = yield* Effect.flatMap(StudyService, (service) => service.verse(DAN_8_13));

      expect(Option.isSome(bundle.text)).toBe(true);
      expect(bundle.words.length).toBeGreaterThan(0);
      expect(bundle.crossRefs.length).toBeGreaterThan(0);

      expect(bundle.parallelWritings.length).toBe(1);
      expect(bundle.parallelWritingsTotal).toBe(1);
      expect(Option.isNone(bundle.parallelWritings[0]?.refcode ?? Option.some('x'))).toBe(true);
    }).pipe(Effect.provide(study(uncitableWritings))),
  );

  it.effect('sparse refs stay a value, not a corpus-data failure', () =>
    Effect.gen(function* () {
      const bundle = yield* Effect.flatMap(StudyService, (service) => service.verse(DAN_8_13));
      expect(bundle.parallelWritings).toEqual([]);
      expect(bundle.parallelWritingsTotal).toBe(0);
    }).pipe(Effect.provide(study(sparseWritings))),
  );
});

describe('StudyService.strongs', () => {
  it.effect('respects the concordance limit and reports the uncapped total', () =>
    Effect.gen(function* () {
      const result = yield* Effect.flatMap(StudyService, (service) =>
        service.strongs(strongsNumber('H8548'), { limit: 5 }),
      );

      expect(result.occurrences.length).toBe(5);
      expect(result.limit).toBe(5);
      expect(result.total).toBe(60);
      expect(result.occurrences[0]?.label).toBe('Exodus 25:1');
      expect(result.occurrences[0]?.word).toBe('continual');
    }).pipe(Effect.provide(study(writings))),
  );

  it.effect('applies the default cap when the caller states none', () =>
    Effect.gen(function* () {
      const result = yield* Effect.flatMap(StudyService, (service) =>
        service.strongs(strongsNumber('H8548')),
      );
      expect(result.occurrences.length).toBe(DEFAULT_CONCORDANCE_LIMIT);
      expect(result.limit).toBe(DEFAULT_CONCORDANCE_LIMIT);
      expect(result.total).toBe(60);
    }).pipe(Effect.provide(study(writings))),
  );

  it.effect('carries the lexicon entry for the word-tap path', () =>
    Effect.gen(function* () {
      const result = yield* Effect.flatMap(StudyService, (service) =>
        service.strongs(strongsNumber('H8548'), { limit: 1 }),
      );
      const entry = Option.getOrThrow(result.entry);
      expect(entry.language).toBe('hebrew');
      expect(entry.lemma).toBe('תָּמִיד');
      expect(entry.transliteration).toEqual(Option.some('tamiyd'));
    }).pipe(Effect.provide(study(writings))),
  );

  it.effect('reports an absent lexicon entry as a value, with the concordance intact', () =>
    Effect.gen(function* () {
      const result = yield* Effect.flatMap(StudyService, (service) =>
        service.strongs(strongsNumber('H9999')),
      );
      expect(result.entry).toEqual(Option.none());
      expect(result.occurrences).toEqual([]);
      expect(result.total).toBe(0);
    }).pipe(Effect.provide(study(writings))),
  );
});
