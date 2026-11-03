import { Context, Effect, Layer, Option, Schema } from 'effect';

import type { VerseReference } from '../bible/model.js';
import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import { nodesToText } from '../egw/ast.js';
import type * as EGWSchemas from '../egw/schemas.js';
import type { CommentaryEntry, CommentaryResult } from './types.js';

class CommentaryError extends Schema.TaggedError<CommentaryError>()('CommentaryError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

type CommentaryServiceError = CommentaryError;

function paragraphToEntry(
  para: EGWSchemas.Paragraph,
  bookCode: string,
  bookTitle: string,
  bookAuthor: string,
): CommentaryEntry {
  return {
    refcode: Option.getOrElse(para.refcode_short, () => para.refcode_long ?? ''),
    bookCode,
    bookTitle,
    bookAuthor,
    content: nodesToText(para.nodes),
    puborder: para.puborder,
  };
}

export interface EGWCommentaryServiceApi {
  readonly getCommentary: (
    verse: VerseReference,
  ) => Effect.Effect<CommentaryResult, CommentaryServiceError>;
}

export class EGWCommentaryService extends Context.Service<
  EGWCommentaryService,
  EGWCommentaryServiceApi
>()('@manna/core/egw-commentary/service/EGWCommentaryService') {
  static Live: Layer.Layer<EGWCommentaryService, never, EGWParagraphDatabase> = Layer.effect(
    EGWCommentaryService,
    Effect.gen(function* () {
      const db = yield* EGWParagraphDatabase;

      const getCommentary = (
        verse: VerseReference,
      ): Effect.Effect<CommentaryResult, CommentaryServiceError> =>
        db.getParagraphsByBibleRef(verse.book, verse.chapter, verse.verse).pipe(
          Effect.map((paragraphs) => ({
            verse,
            entries: paragraphs.map((para) =>
              paragraphToEntry(para, para.bookCode, para.bookTitle, para.bookAuthor),
            ),
          })),
          Effect.mapError((e) =>
            CommentaryError.make({
              message: 'Failed to get commentary',
              cause: e,
            }),
          ),
        );

      return EGWCommentaryService.of({
        getCommentary,
      });
    }),
  );

  static Default = EGWCommentaryService.Live;

  static Test = (
    config: {
      entries?: readonly CommentaryEntry[];
    } = {},
  ): Layer.Layer<EGWCommentaryService> =>
    Layer.succeed(
      EGWCommentaryService,
      EGWCommentaryService.of({
        getCommentary: (verse) =>
          Effect.succeed({
            verse,
            entries: config.entries ?? [],
          }),
      }),
    );
}
