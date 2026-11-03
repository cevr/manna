import { Schema } from 'effect';

import { PublicationId } from '../writings/model.js';
import { CorpusName } from './model.js';

export class CorpusSourceUnavailableError extends Schema.TaggedError<CorpusSourceUnavailableError>()(
  'CorpusSourceUnavailableError',
  {
    operation: Schema.NonEmptyString,
    cause: Schema.Unknown,
  },
) {}

export class CorpusContributionRejectedError extends Schema.TaggedError<CorpusContributionRejectedError>()(
  'CorpusContributionRejectedError',
  {
    publication: PublicationId,
    cause: Schema.Unknown,
  },
) {}

export class CorpusInstallationError extends Schema.TaggedError<CorpusInstallationError>()(
  'CorpusInstallationError',
  {
    publication: Schema.optional(PublicationId),
    corpus: Schema.optional(CorpusName),
    cause: Schema.Unknown,
  },
) {}

/** Expected refusal: the caller does not own the outgoing SQLite session or WAL. */
export class SqliteRefreshRefused extends Schema.TaggedError<SqliteRefreshRefused>()(
  'SqliteRefreshRefused',
  { destination: Schema.String, wal: Schema.String, message: Schema.String },
) {}

export class CorpusRecipeUnavailableError extends Schema.TaggedError<CorpusRecipeUnavailableError>()(
  'CorpusRecipeUnavailableError',
  {
    corpus: CorpusName,
  },
) {}

export type CorpusSupplyError =
  | CorpusSourceUnavailableError
  | CorpusContributionRejectedError
  | CorpusInstallationError
  | SqliteRefreshRefused
  | CorpusRecipeUnavailableError;
