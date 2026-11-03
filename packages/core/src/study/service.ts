import { Context, Effect, Layer, Option, Schema } from 'effect';

import { getBibleBook } from '../bible/canon.js';
import { Reference, VerseReference, type BookNumber } from '../bible/model.js';
import {
  BibleDatabase,
  type BibleDatabaseError,
  type BibleDatabaseService,
  type ConcordanceHit,
  type CrossReference,
  type MarginNote,
  type StrongsEntry,
  type VerseWord,
} from '../bible-db/bible-database.js';
import { EGWCommentaryService, type EGWCommentaryServiceApi } from '../egw-commentary/service.js';
import type { CommentaryEntry } from '../egw-commentary/types.js';
import { EGW_SCOPE_AUTHORS } from '../writings/corpus-scope.js';
import {
  ConcordanceEntry,
  DEFAULT_CONCORDANCE_LIMIT,
  DEFAULT_PARALLEL_WRITINGS_LIMIT,
  StrongsLexiconEntry,
  StrongsNumber,
  StrongsStudy,
  StudyCommentaryEntry,
  StudyCrossReference,
  StudyMarginNote,
  StudyParallelWriting,
  StudyWord,
  VerseStudy,
} from './model.js';

const StudySourceName = Schema.Literals(['bible', 'writings']);
type StudySourceName = typeof StudySourceName.Type;

class StudyUnavailableError extends Schema.TaggedError<StudyUnavailableError>()(
  'StudyUnavailableError',
  {
    operation: Schema.NonEmptyString,
    source: StudySourceName,
    message: Schema.String,
  },
) {}

export class StudyCorpusDataError extends Schema.TaggedError<StudyCorpusDataError>()(
  'StudyCorpusDataError',
  {
    operation: Schema.NonEmptyString,
    source: StudySourceName,
    row: Schema.NonEmptyString,
    message: Schema.String,
  },
) {}

type StudyError = StudyUnavailableError | StudyCorpusDataError;

interface StudyVerseOptions {
  readonly parallelWritingsLimit?: number;
}

interface StudyStrongsOptions {
  readonly limit?: number;
}

interface StudyServiceApi {
  readonly verse: (
    reference: VerseReference,
    options?: StudyVerseOptions,
  ) => Effect.Effect<VerseStudy, StudyError>;
  readonly strongs: (
    number: StrongsNumber,
    options?: StudyStrongsOptions,
  ) => Effect.Effect<StrongsStudy, StudyError>;
}

const COMMENTARY_BOOK_CODES: ReadonlySet<string> = new Set([
  '1BC',
  '2BC',
  '3BC',
  '4BC',
  '5BC',
  '6BC',
  '7BC',
  '7ABC',
]);

const isCommentaryVolume = (entry: CommentaryEntry): boolean =>
  COMMENTARY_BOOK_CODES.has(entry.bookCode);

const isEgwScope = (entry: CommentaryEntry): boolean =>
  EGW_SCOPE_AUTHORS.includes(entry.bookAuthor);

const unavailable =
  (operation: string, source: StudySourceName) =>
  (cause: { readonly message: string }): StudyUnavailableError =>
    StudyUnavailableError.make({ operation, source, message: cause.message });

const bookName = (book: BookNumber): string =>
  Option.match(getBibleBook(book), {
    onNone: () => String(book),
    onSome: (found) => found.name,
  });

const verseLabel = (reference: VerseReference): string =>
  `${bookName(reference.book)} ${String(reference.chapter)}:${String(reference.verse)}`;

const crossRefLabel = (row: CrossReference): string => {
  const base = `${bookName(Reference.verse(row.book, row.chapter, 1).book)} ${String(row.chapter)}`;
  return Option.match(row.verse, {
    onNone: () => base,
    onSome: (verse) =>
      Option.match(row.verseEnd, {
        onNone: () => `${base}:${String(verse)}`,
        onSome: (end) => `${base}:${String(verse)}-${String(end)}`,
      }),
  });
};

const decodeStrongs = Schema.decodeOption(StrongsNumber);

const wordStrongs = (word: VerseWord): readonly StrongsNumber[] =>
  word.strongsNumbers.flatMap((raw) =>
    Option.match(decodeStrongs(raw), {
      onNone: (): readonly StrongsNumber[] => [],
      onSome: (number) => [number],
    }),
  );

const studyWord = (word: VerseWord): StudyWord =>
  StudyWord.make({ text: word.text, strongs: wordStrongs(word), italic: word.italic });

const decodeRow =
  <A, I>(schema: Schema.Codec<A, I>, operation: string, source: StudySourceName) =>
  (input: I, row: string): Effect.Effect<A, StudyCorpusDataError> =>
    Schema.decodeEffect(schema)(input).pipe(
      Effect.mapError((issue) =>
        StudyCorpusDataError.make({ operation, source, row, message: issue.message }),
      ),
    );

const decodeCrossReference = decodeRow(StudyCrossReference, 'verse.crossRefs', 'bible');
const decodeMarginNote = decodeRow(StudyMarginNote, 'verse.marginNotes', 'bible');
const decodeCommentary = decodeRow(StudyCommentaryEntry, 'verse.commentary', 'writings');
const decodeParallel = decodeRow(StudyParallelWriting, 'verse.parallelWritings', 'writings');
const decodeConcordance = decodeRow(ConcordanceEntry, 'strongs.occurrences', 'bible');
const decodeLexicon = decodeRow(StrongsLexiconEntry, 'strongs.entry', 'bible');

const studyCrossReference = (
  row: CrossReference,
): Effect.Effect<StudyCrossReference, StudyCorpusDataError> => {
  const label = crossRefLabel(row);
  return decodeCrossReference(
    {
      book: row.book,
      chapter: row.chapter,
      verse: row.verse,
      verseEnd: row.verseEnd,
      label,
      source: row.source,
      preview: row.previewText,
    },
    label,
  );
};

const studyMarginNote = (note: MarginNote): Effect.Effect<StudyMarginNote, StudyCorpusDataError> =>
  decodeMarginNote(
    { index: note.index, kind: note.type, phrase: note.phrase, text: note.text },
    `note ${String(note.index)}`,
  );

const studyRefcode = (refcode: string): Option.Option<string> =>
  Option.filter(Option.some(refcode), (value) => value.length > 0);

const entryRowId = (entry: CommentaryEntry): string =>
  Option.match(studyRefcode(entry.refcode), {
    onNone: () => `${entry.bookCode} (no refcode)`,
    onSome: (refcode) => `${entry.bookCode} ${refcode}`,
  });

const studyCommentary = (
  entry: CommentaryEntry,
): Effect.Effect<StudyCommentaryEntry, StudyCorpusDataError> =>
  decodeCommentary(
    {
      refcode: studyRefcode(entry.refcode),
      bookCode: entry.bookCode,
      bookTitle: entry.bookTitle,
      content: entry.content,
    },
    entryRowId(entry),
  );

const studyParallel = (
  entry: CommentaryEntry,
): Effect.Effect<StudyParallelWriting, StudyCorpusDataError> =>
  decodeParallel(
    {
      refcode: studyRefcode(entry.refcode),
      bookCode: entry.bookCode,
      bookTitle: entry.bookTitle,
      content: entry.content,
    },
    entryRowId(entry),
  );

const concordanceEntry = (
  hit: ConcordanceHit,
): Effect.Effect<ConcordanceEntry, StudyCorpusDataError> => {
  const row = `${hit.bookName} ${String(hit.chapter)}:${String(hit.verse)}`;
  return decodeRow(
    VerseReference,
    'strongs.occurrences',
    'bible',
  )({ _tag: 'verse', book: hit.book, chapter: hit.chapter, verse: hit.verse }, row).pipe(
    Effect.flatMap((decoded) =>
      decodeConcordance(
        { reference: decoded, label: verseLabel(decoded), text: hit.text, word: hit.word },
        row,
      ),
    ),
  );
};

const lexiconEntry = (
  entry: StrongsEntry,
): Effect.Effect<StrongsLexiconEntry, StudyCorpusDataError> =>
  decodeLexicon(
    {
      number: entry.number,
      language: entry.language,
      lemma: entry.lemma,
      transliteration: entry.transliteration,
      pronunciation: entry.pronunciation,
      definition: entry.definition,
      kjvDefinition: entry.kjvDefinition,
    },
    entry.number,
  );

const makeVerse =
  (bible: BibleDatabaseService, commentary: EGWCommentaryServiceApi) =>
  (
    reference: VerseReference,
    options?: StudyVerseOptions,
  ): Effect.Effect<VerseStudy, StudyError> => {
    const parallelLimit = options?.parallelWritingsLimit ?? DEFAULT_PARALLEL_WRITINGS_LIMIT;
    const fromBible = <A>(
      operation: string,
      effect: Effect.Effect<A, BibleDatabaseError>,
    ): Effect.Effect<A, StudyError> =>
      effect.pipe(Effect.mapError(unavailable(operation, 'bible')));

    return Effect.gen(function* () {
      const [verse, words, crossRefs, marginNotes, refs] = yield* Effect.all(
        [
          fromBible(
            'verse.text',
            bible.getVerse(reference.book, reference.chapter, reference.verse),
          ),
          fromBible(
            'verse.words',
            bible.getVerseWords(reference.book, reference.chapter, reference.verse),
          ),
          fromBible(
            'verse.crossRefs',
            bible.getCrossRefs(reference.book, reference.chapter, reference.verse),
          ),
          fromBible(
            'verse.marginNotes',
            bible.getMarginNotes(reference.book, reference.chapter, reference.verse),
          ),
          commentary
            .getCommentary(reference)
            .pipe(Effect.mapError(unavailable('verse.commentary', 'writings'))),
        ],
        { concurrency: 'unbounded' },
      );

      const commentaryEntries = refs.entries.filter(isCommentaryVolume);
      const parallelEntries = refs.entries
        .filter((entry) => !isCommentaryVolume(entry))
        .filter(isEgwScope);

      const [crossReferences, notes, commentaryDecoded, parallelDecoded] = yield* Effect.all([
        Effect.forEach(crossRefs, studyCrossReference),
        Effect.forEach(marginNotes, studyMarginNote),
        Effect.forEach(commentaryEntries, studyCommentary),
        Effect.forEach(parallelEntries.slice(0, parallelLimit), studyParallel),
      ]);

      return VerseStudy.make({
        reference,
        label: verseLabel(reference),
        text: Option.map(verse, (found) => found.text),
        words: words.map(studyWord),
        crossRefs: crossReferences,
        marginNotes: notes,
        commentary: commentaryDecoded,
        parallelWritings: parallelDecoded,
        parallelWritingsTotal: parallelEntries.length,
      });
    });
  };

const makeStrongs =
  (bible: BibleDatabaseService) =>
  (
    number: StrongsNumber,
    options?: StudyStrongsOptions,
  ): Effect.Effect<StrongsStudy, StudyError> => {
    const limit = options?.limit ?? DEFAULT_CONCORDANCE_LIMIT;
    return Effect.gen(function* () {
      const [entry, hits, total] = yield* Effect.all(
        [
          bible.getStrongsEntry(number),
          bible.getVersesWithStrongs(number, limit),
          bible.getStrongsCount(number),
        ],
        { concurrency: 'unbounded' },
      ).pipe(Effect.mapError(unavailable('strongs', 'bible')));

      const [decodedEntry, occurrences] = yield* Effect.all([
        Option.match(entry, {
          onNone: () => Effect.succeedNone,
          onSome: (found) => Effect.asSome(lexiconEntry(found)),
        }),
        Effect.forEach(hits, concordanceEntry),
      ]);

      return StrongsStudy.make({ number, entry: decodedEntry, occurrences, total, limit });
    });
  };

export class StudyService extends Context.Service<StudyService, StudyServiceApi>()(
  '@manna/core/study/StudyService',
) {
  static Live: Layer.Layer<StudyService, never, BibleDatabase | EGWCommentaryService> =
    Layer.effect(
      StudyService,
      Effect.gen(function* () {
        const bible = yield* BibleDatabase;
        const commentary = yield* EGWCommentaryService;
        return StudyService.of({
          verse: Effect.fn('StudyService.verse')(makeVerse(bible, commentary)),
          strongs: Effect.fn('StudyService.strongs')(makeStrongs(bible)),
        });
      }),
    );
}
