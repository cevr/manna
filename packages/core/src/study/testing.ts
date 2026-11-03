import { Layer, Option } from 'effect';

import { bookNumber, chapterNumber, verseNumber } from '../bible/model.js';
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
import { StudyService } from './service.js';

const wireNull = Option.getOrNull(Option.none<never>());

export const FIXTURE_BOOK = bookNumber(27);
export const FIXTURE_CHAPTER = chapterNumber(8);
export const FIXTURE_VERSE = verseNumber(13);
export const FIXTURE_LABEL = 'Daniel 8:13';
export const FIXTURE_TEXT = 'Then I heard one saint speaking…';

export const FIXTURE_CONCORDANCE_TOTAL = 9;

const commentaryBook: BookRow = {
  book_id: 501,
  book_code: '5BC',
  book_title: 'EGW SDA Bible Commentary, vol. 5',
  book_author: 'Ellen Gould White',
  paragraph_count: 1,
  created_at: '2026-01-01',
};

const greatControversy: BookRow = {
  book_id: 502,
  book_code: 'GC',
  book_title: 'The Great Controversy',
  book_author: 'Ellen Gould White',
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

const bibleRef = (bookId: number, refcode: string): BibleRefRow => ({
  para_book_id: bookId,
  para_ref_code: refcode,
  bible_book: FIXTURE_BOOK,
  bible_chapter: FIXTURE_CHAPTER,
  bible_verse: FIXTURE_VERSE,
});

const writingsDatabase = EGWParagraphDatabase.Test({
  books: [commentaryBook, greatControversy],
  paragraphs: [
    paragraph('5BC', '5BC 1116.1', 'The daily is the continual mediation of Christ.'),
    paragraph('GC', 'GC 324.1', 'The sanctuary in heaven is the great original.'),
  ],
  bibleRefs: [bibleRef(501, '5BC 1116.1'), bibleRef(502, 'GC 324.1')],
});

const untitledBook: BookRow = {
  ...greatControversy,
  book_title: '',
};

const malformedWritingsDatabase = EGWParagraphDatabase.Test({
  books: [untitledBook],
  paragraphs: [paragraph('GC', 'GC 324.1', 'A citation whose book has no title.')],
  bibleRefs: [bibleRef(502, 'GC 324.1')],
});

const words: readonly VerseWord[] = [
  { text: 'Then', strongsNumbers: [], italic: false },
  { text: 'the daily', strongsNumbers: ['H8548'], italic: false },
];

const crossRefs: readonly CrossReference[] = [
  {
    book: 66,
    chapter: 12,
    verse: Option.some(6),
    verseEnd: Option.none(),
    source: 'openbible',
    previewText: Option.none(),
  },
];

const marginNotes: readonly MarginNote[] = [
  { index: 0, type: 'hebrew', phrase: 'the daily', text: 'Heb. the continual' },
];

const tamid: StrongsEntry = {
  number: 'H8548',
  language: 'hebrew',
  lemma: 'תָּמִיד',
  transliteration: Option.some('tamiyd'),
  pronunciation: Option.none(),
  definition: 'continuance, continually, perpetual',
  kjvDefinition: Option.none(),
};

const tamidHits: readonly ConcordanceHit[] = Array.from(
  { length: FIXTURE_CONCORDANCE_TOTAL },
  (_, index) => ({
    book: 2,
    bookName: 'Exodus',
    chapter: 25,
    verse: index + 1,
    text: `Occurrence ${String(index + 1)}.`,
    word: 'continual',
  }),
);

const bibleDatabase = BibleDatabase.layerTest({
  verses: [
    {
      book: FIXTURE_BOOK,
      chapter: FIXTURE_CHAPTER,
      verse: FIXTURE_VERSE,
      versionCode: 'KJV',
      text: FIXTURE_TEXT,
    },
  ],
  verseWords: [{ book: FIXTURE_BOOK, chapter: FIXTURE_CHAPTER, verse: FIXTURE_VERSE, words }],
  crossRefs: [
    { book: FIXTURE_BOOK, chapter: FIXTURE_CHAPTER, verse: FIXTURE_VERSE, references: crossRefs },
  ],
  marginNotes: [
    { book: FIXTURE_BOOK, chapter: FIXTURE_CHAPTER, verse: FIXTURE_VERSE, notes: marginNotes },
  ],
  strongsEntries: [tamid],
  concordanceHits: { H8548: tamidHits },
});

export const studyFixtureLayer: Layer.Layer<StudyService> = StudyService.Live.pipe(
  Layer.provide(bibleDatabase),
  Layer.provide(EGWCommentaryService.Live.pipe(Layer.provide(writingsDatabase))),
);

export const malformedStudyFixtureLayer: Layer.Layer<StudyService> = StudyService.Live.pipe(
  Layer.provide(bibleDatabase),
  Layer.provide(EGWCommentaryService.Live.pipe(Layer.provide(malformedWritingsDatabase))),
);

export const FIXTURE_MALFORMED_ROW = 'GC 324.1';
