import { Schema, SchemaGetter } from 'effect';

import { BookNumber, ChapterNumber, VerseNumber, VerseReference } from '../bible/model.js';

const StrongsNumberText = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[HG][1-9][0-9]*$/)),
  Schema.brand('Study/StrongsNumber'),
);

export const StrongsNumber = Schema.String.pipe(
  Schema.decodeTo(StrongsNumberText, {
    decode: SchemaGetter.toUpperCase(),
    encode: SchemaGetter.passthrough(),
  }),
);
export type StrongsNumber = typeof StrongsNumber.Type;

export const strongsNumber = Schema.decodeSync(StrongsNumber);

export const StudyLimit = Schema.Int.check(Schema.isGreaterThan(0));

const StrongsLanguage = Schema.Literals(['hebrew', 'greek']);
type StrongsLanguage = typeof StrongsLanguage.Type;

export class StrongsLexiconEntry extends Schema.Class<StrongsLexiconEntry>(
  'Study/StrongsLexiconEntry',
)({
  number: StrongsNumber,
  language: StrongsLanguage,
  lemma: Schema.String,
  transliteration: Schema.Option(Schema.String),
  pronunciation: Schema.Option(Schema.String),
  definition: Schema.String,
  kjvDefinition: Schema.Option(Schema.String),
}) {}

export class ConcordanceEntry extends Schema.Class<ConcordanceEntry>('Study/ConcordanceEntry')({
  reference: VerseReference,
  label: Schema.NonEmptyString,
  text: Schema.String,
  word: Schema.String,
}) {}

export class StrongsStudy extends Schema.Class<StrongsStudy>('Study/StrongsStudy')({
  number: StrongsNumber,
  entry: Schema.Option(StrongsLexiconEntry),
  occurrences: Schema.Array(ConcordanceEntry),
  total: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  limit: StudyLimit,
}) {}

export class StudyWord extends Schema.Class<StudyWord>('Study/Word')({
  text: Schema.String,
  strongs: Schema.Array(StrongsNumber),
  italic: Schema.Boolean,
}) {}

const CrossReferenceSource = Schema.Literals(['openbible', 'tske']);
type CrossReferenceSource = typeof CrossReferenceSource.Type;

export class StudyCrossReference extends Schema.Class<StudyCrossReference>('Study/CrossReference')({
  book: BookNumber,
  chapter: ChapterNumber,
  verse: Schema.Option(VerseNumber),
  verseEnd: Schema.Option(VerseNumber),
  label: Schema.NonEmptyString,
  source: CrossReferenceSource,
  preview: Schema.Option(Schema.String),
}) {}

const MarginNoteKind = Schema.Literals(['hebrew', 'greek', 'alternate', 'name', 'other']);

export class StudyMarginNote extends Schema.Class<StudyMarginNote>('Study/MarginNote')({
  index: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  kind: MarginNoteKind,
  phrase: Schema.String,
  text: Schema.String,
}) {}

const StudyRefcode = Schema.Option(Schema.NonEmptyString);

export class StudyCommentaryEntry extends Schema.Class<StudyCommentaryEntry>(
  'Study/CommentaryEntry',
)({
  refcode: StudyRefcode,
  bookCode: Schema.NonEmptyString,
  bookTitle: Schema.NonEmptyString,
  content: Schema.String,
}) {}

export class StudyParallelWriting extends Schema.Class<StudyParallelWriting>(
  'Study/ParallelWriting',
)({
  refcode: StudyRefcode,
  bookCode: Schema.NonEmptyString,
  bookTitle: Schema.NonEmptyString,
  content: Schema.String,
}) {}

export class VerseStudy extends Schema.Class<VerseStudy>('Study/VerseStudy')({
  reference: VerseReference,
  label: Schema.NonEmptyString,
  text: Schema.Option(Schema.String),
  words: Schema.Array(StudyWord),
  crossRefs: Schema.Array(StudyCrossReference),
  marginNotes: Schema.Array(StudyMarginNote),
  commentary: Schema.Array(StudyCommentaryEntry),
  parallelWritings: Schema.Array(StudyParallelWriting),
  parallelWritingsTotal: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
}) {}

export const VerseStudyJson = VerseStudy;
export type VerseStudyJson = typeof VerseStudyJson.Encoded;

export const StrongsStudyJson = StrongsStudy;
export type StrongsStudyJson = typeof StrongsStudyJson.Encoded;

export const DEFAULT_CONCORDANCE_LIMIT = 50;

export const DEFAULT_PARALLEL_WRITINGS_LIMIT = 25;
