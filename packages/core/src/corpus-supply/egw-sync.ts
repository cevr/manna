import { Array as Arr, Cause, Effect, Exit, Option, Predicate, Ref, Schema, Stream } from 'effect';

import { EGWApiClient } from '../egw/index.js';
import {
  EGWParagraphDatabase,
  type BookRow,
  type EGWParagraphDatabaseService,
} from '../egw-db/index.js';
import { publicationId } from '../writings/model.js';
import { CorpusSupply } from './service.js';
import { CorpusSupplyInput, Target } from './model.js';
import { egwBookRevision, isContentRevision } from './egw-revision.js';
import { isKnownUnavailable } from './unavailable.js';

export interface EgwSyncProgress {
  readonly completed: number;
  readonly total: number;
  readonly id: number;
  readonly code: string;
  readonly status: 'installed' | 'failed';
}

interface EgwSyncOptions {
  readonly lang: string;
  readonly concurrency: number;
  readonly refresh: boolean;
  readonly recheckLimit: number;
  readonly onProgress: (progress: EgwSyncProgress) => Effect.Effect<void>;
}

export interface EgwSyncFailure {
  readonly id: number;
  readonly code: string;
  readonly title: string;
  readonly error: string;
  readonly expected: boolean;
}

interface EgwSyncReport {
  readonly remote: number;
  readonly installedBefore: number;
  readonly rechecked: number;
  readonly recheckLeft: number;
  readonly attempted: number;
  readonly installed: number;
  readonly failed: number;
  readonly unexpectedFailures: number;
  readonly present: number;
  readonly missing: readonly {
    readonly id: number;
    readonly code: string;
    readonly title: string;
  }[];
  readonly localOnly: number;
  readonly failures: readonly EgwSyncFailure[];
}

class EgwSyncInputError extends Schema.TaggedError<EgwSyncInputError>()('EgwSyncInputError', {
  message: Schema.String,
}) {}

const hasContent = (book: Option.Option<BookRow>): boolean =>
  Option.exists(book, (value) => value.paragraph_count > 0);

const ownMessage = (cause: unknown): readonly string[] => {
  if (Predicate.isString(cause)) return [cause];
  if (Predicate.hasProperty(cause, 'message') && Predicate.isString(cause.message)) {
    if (cause.message.length > 0) return [cause.message];
  }
  if (Predicate.hasProperty(cause, '_tag') && Predicate.isString(cause._tag)) {
    return [cause._tag];
  }
  return [];
};

const CAUSE_DEPTH = 6;

const causeMessages = (cause: unknown, depth: number): readonly string[] => {
  if (depth === 0) return [];
  let inner: readonly string[] = [];
  if (Predicate.hasProperty(cause, 'cause')) inner = causeMessages(cause.cause, depth - 1);
  return [...ownMessage(cause), ...inner];
};

const messageFromCause = (cause: unknown): string => {
  const messages = Arr.dedupe(
    causeMessages(cause, CAUSE_DEPTH).filter((message) => message.length > 0),
  );
  if (messages.length === 0) return 'The download failed without a message.';
  return messages.join(': ');
};

const readBooks = (database: EGWParagraphDatabaseService) =>
  Stream.runCollect(database.getAllBooks).pipe(Effect.map((books) => [...books]));

export interface EgwSyncBook {
  readonly id: number;
  readonly code: string;
  readonly title: string;
  readonly revision: string;
}

export interface EgwSyncPlan {
  readonly remote: readonly EgwSyncBook[];
  readonly installedBefore: number;
  readonly pending: readonly EgwSyncBook[];
  readonly changed: readonly EgwSyncBook[];
  readonly verify: readonly EgwSyncBook[];
  readonly recheckLeft: number;
}

export interface EgwParagraphChangeCounts {
  readonly added: number;
  readonly removed: number;
  readonly edited: number;
}

export type EgwBookOutcome =
  | {
      readonly _tag: 'Installed';
      readonly book: EgwSyncBook;
      readonly changes: EgwParagraphChangeCounts;
    }
  | { readonly _tag: 'Failed'; readonly failure: EgwSyncFailure };

export const failureOf = (outcome: EgwBookOutcome): Option.Option<EgwSyncFailure> => {
  if (outcome._tag === 'Failed') return Option.some(outcome.failure);
  return Option.none();
};

export const planEgwSync = Effect.fn('EgwSync.plan')(function* (options: {
  readonly lang: string;
  readonly refresh: boolean;
  readonly recheckLimit: number;
}) {
  const client = yield* EGWApiClient;
  const database = yield* EGWParagraphDatabase;
  const [remoteCollection, localBefore, statuses] = yield* Effect.all([
    client.getBooks({ lang: options.lang }).pipe(Stream.runCollect),
    readBooks(database),
    database.getAllSyncStatus,
  ]);
  const remote = [...remoteCollection].map((book): EgwSyncBook => ({
    id: book.book_id,
    code: book.code,
    title: book.title,
    revision: egwBookRevision(book),
  }));
  const localBeforeById = new Map(localBefore.map((book) => [book.book_id, book]));
  const installed = (book: EgwSyncBook) =>
    hasContent(Option.fromNullishOr(localBeforeById.get(book.id)));
  if (options.refresh) {
    return {
      remote,
      installedBefore: remote.filter(installed).length,
      pending: remote,
      changed: [],
      verify: [],
      recheckLeft: 0,
    } satisfies EgwSyncPlan;
  }

  const recorded = new Map(
    statuses.flatMap((row) =>
      Option.toArray(
        Option.map(
          Option.filter(Option.fromNullishOr(row.revision), () => row.status === 'success'),
          (revision) => [row.book_id, revision] as const,
        ),
      ),
    ),
  );
  const recordedOf = (book: EgwSyncBook) => Option.fromNullishOr(recorded.get(book.id));
  const moved = remote.filter(
    (book) => installed(book) && !Option.contains(recordedOf(book), book.revision),
  );
  const hashMoved = (book: EgwSyncBook) => Option.exists(recordedOf(book), isContentRevision);
  const limit = Math.max(0, options.recheckLimit);
  const changed = moved.filter(hashMoved).slice(0, limit);
  const verify = moved.filter((book) => !hashMoved(book)).slice(0, limit - changed.length);
  return {
    remote,
    installedBefore: remote.filter(installed).length,
    pending: remote.filter((book) => !installed(book)),
    changed,
    verify,
    recheckLeft: moved.length - changed.length - verify.length,
  } satisfies EgwSyncPlan;
});

const NO_CHANGES: EgwParagraphChangeCounts = { added: 0, removed: 0, edited: 0 };

export const latestParagraphChanges = Effect.fn('EgwSync.latestChanges')(function* (
  bookId: number,
) {
  const database = yield* EGWParagraphDatabase;
  const status = yield* database.getSyncStatus(bookId);
  const revision = Option.flatMap(status, (row) => Option.fromNullishOr(row.revision));
  if (Option.isNone(revision)) return [];
  return yield* database.paragraphChanges(bookId, revision.value);
});

const changesOf = Effect.fn('EgwSync.changesOf')(function* (bookId: number) {
  const rows = yield* latestParagraphChanges(bookId);
  if (rows.length === 0) return NO_CHANGES;
  const count = (kind: string) => rows.filter((row) => row.kind === kind).length;
  return { added: count('added'), removed: count('removed'), edited: count('edited') };
});

export const installEgwBook = Effect.fn('EgwSync.installBook')(function* (
  book: EgwSyncBook,
  options: { readonly refresh: boolean },
) {
  const database = yield* EGWParagraphDatabase;
  const supply = yield* CorpusSupply;
  const result = yield* Effect.exit(
    supply.ensure(
      CorpusSupplyInput.make({
        target: Target.writings([publicationId(book.id)]),
        refresh: options.refresh,
      }),
    ),
  );
  if (Exit.isSuccess(result)) {
    const changes = yield* changesOf(book.id);
    const installed: EgwBookOutcome = { _tag: 'Installed', book, changes };
    return installed;
  }
  if (Cause.hasInterrupts(result.cause)) return yield* Effect.failCause(result.cause);
  const message = messageFromCause(Cause.squash(result.cause));
  yield* database.setSyncStatus(book.id, book.code, 'failed', 0, message).pipe(Effect.ignore);
  const failed: EgwBookOutcome = {
    _tag: 'Failed',
    failure: {
      id: book.id,
      code: book.code,
      title: book.title,
      error: message,
      expected: isKnownUnavailable(book.id),
    },
  };
  return failed;
});

export const reportEgwSync = Effect.fn('EgwSync.report')(function* (
  plan: EgwSyncPlan,
  failures: readonly EgwSyncFailure[],
) {
  const database = yield* EGWParagraphDatabase;
  const localAfter = yield* readBooks(database);
  const localAfterById = new Map(localAfter.map((book) => [book.book_id, book]));
  const remoteIds = new Set(plan.remote.map((book) => book.id));
  const present = (book: EgwSyncBook) =>
    hasContent(Option.fromNullishOr(localAfterById.get(book.id)));
  const missing = plan.remote.filter((book) => !present(book) && !isKnownUnavailable(book.id));

  const attempted = plan.pending.length + plan.changed.length + plan.verify.length;
  return {
    remote: plan.remote.length,
    installedBefore: plan.installedBefore,
    rechecked: plan.changed.length + plan.verify.length,
    recheckLeft: plan.recheckLeft,
    attempted,
    installed: attempted - failures.length,
    failed: failures.length,
    unexpectedFailures: failures.filter((failure) => !failure.expected).length,
    present: plan.remote.filter(present).length,
    missing,
    localOnly: localAfter.filter((book) => !remoteIds.has(book.book_id)).length,
    failures,
  } satisfies EgwSyncReport;
});

export const syncEgwCorpus = Effect.fn('EgwSync.syncCorpus')(function* (options: EgwSyncOptions) {
  if (options.concurrency < 1) {
    return yield* EgwSyncInputError.make({ message: 'Concurrency must be at least 1.' });
  }

  const plan = yield* planEgwSync(options);
  const books = [...plan.pending, ...plan.changed, ...plan.verify];
  const completed = yield* Ref.make(0);
  const outcomes = yield* Effect.forEach(
    books,
    (book) =>
      Effect.gen(function* () {
        const outcome = yield* installEgwBook(book, options);
        const done = yield* Ref.updateAndGet(completed, (value) => value + 1);
        yield* options.onProgress({
          completed: done,
          total: books.length,
          id: book.id,
          code: book.code,
          status: Option.match(failureOf(outcome), {
            onNone: () => 'installed' as const,
            onSome: () => 'failed' as const,
          }),
        });
        return outcome;
      }),
    { concurrency: options.concurrency },
  );

  return yield* reportEgwSync(
    plan,
    outcomes.flatMap((outcome) => Option.toArray(failureOf(outcome))),
  );
});
