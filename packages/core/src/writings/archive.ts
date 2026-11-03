import { Effect, Schema, Stream } from 'effect';

import { ChapterReference, VerseReference } from '../bible/model.js';
import { Paragraph, Publication } from './model.js';

export class ArchivedParagraph extends Schema.Class<ArchivedParagraph>(
  'Writings/ArchivedParagraph',
)({
  refcode: Schema.NonEmptyString,
  paragraph: Paragraph,
  isHeading: Schema.Boolean,
}) {}

export class ArchivedBibleReference extends Schema.Class<ArchivedBibleReference>(
  'Writings/ArchivedBibleReference',
)({
  paragraphRefcode: Schema.NonEmptyString,
  scripture: Schema.Union([ChapterReference, VerseReference]),
}) {}

export class ArchiveChapter extends Schema.Class<ArchiveChapter>('Writings/ArchiveChapter')({
  paragraphs: Schema.Array(ArchivedParagraph),
  bibleReferences: Schema.Array(ArchivedBibleReference),
}) {}

export class PublicationArchive extends Schema.Class<PublicationArchive>(
  'Writings/PublicationArchive',
)({
  publication: Publication,
  paragraphs: Schema.Array(ArchivedParagraph),
  bibleReferences: Schema.Array(ArchivedBibleReference),
}) {}

export interface PublicationStream<E> {
  readonly publication: Publication;
  readonly chapters: Stream.Stream<ArchiveChapter, E>;
}

export const collectPublication = <E>(
  stream: PublicationStream<E>,
): Effect.Effect<PublicationArchive, E> =>
  Effect.map(Stream.runCollect(stream.chapters), (chapters) =>
    PublicationArchive.make({
      publication: stream.publication,
      paragraphs: chapters.flatMap((chapter) => chapter.paragraphs),
      bibleReferences: chapters.flatMap((chapter) => chapter.bibleReferences),
    }),
  );
