/* oxlint-disable effect/noInlineProvide -- each Workflow step is its own boundary: it runs in whatever isolate Cloudflare gives it, after any eviction, so it provides the layers it reads through itself rather than inheriting them from a run that may not be there. */
import { RuntimeContext } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import { Stage } from 'alchemy/Stage';
import * as D1Client from '@effect/sql-d1/D1Client';
import {
  Cause,
  Config,
  ConfigProvider,
  DateTime,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  Predicate,
  Redacted,
  Schema,
} from 'effect';
import { HttpServerResponse } from 'effect/http';
import { Digest } from 'effect/crypto';
import * as SqlClient from 'effect/sql/SqlClient';

import {
  CorpusSupply,
  type EgwBookOutcome,
  type EgwSyncBook,
  type EgwSyncFailure,
  type EgwSyncPlan,
  failureOf,
  latestParagraphChanges,
  installEgwBook,
  isKnownUnavailable,
  layerEgwWritingsAssetSource,
  planEgwSync,
  reportEgwSync,
} from '@manna/core/corpus-supply';
import { EGWApiClient, EGWAuth, EGWTokenStore } from '@manna/core/egw';
import { EGWParagraphDatabase, type ParagraphChangeRow } from '@manna/core/egw-db';

import {
  BOOK_VECTORS_PAGE,
  type BookVectorsFailed,
  bookVectorsPage,
  type BookVectorsScope,
  deleteVectorIds,
  removedVectorIds,
} from './book-vectors.ts';
import { D1Atomic } from './d1-atomic.ts';
import { Corpus, SyncReports, Vectors } from './resources.ts';
import { DOMAIN } from './site.ts';
import { reportKey, reportPage, reportPageKey } from './sync-pages.ts';
import { MAIL_LIMIT, SyncOutcome, syncMail } from './sync-mail.ts';
import {
  type ChangesByBook,
  changeCount,
  type RecheckedBook,
  syncReport,
  type SyncRun,
  updateChanges,
} from './sync-report.ts';
import { EMBEDDING_MODEL, workersAiDocuments } from './workers-ai.ts';

export const SYNC_WORKER_NAME = 'egw-sync';

export const SYNC_WORKFLOW_NAME = 'egw-corpus-sync';

export const SYNC_SCHEDULE = '0 9 * * SUN';

const SYNC_MAIL = { from: 'egw-sync@cvr.im', to: 'hello@cvr.im' } as const;

const SyncMailer = Cloudflare.Email.SendEmail('SyncMailer');

const MAIL_CAUSE_LIMIT = 4000;

const RECHECK_LIMIT = 250;

const RECHECK_MAX = 1500;

const CHANGES_KEPT = Duration.days(30);

const PRUNE_ROUND = 5000;

const REPORT_PAGE = `https://${DOMAIN}/sync/`;

const PAGE_QUOTES = 300;

const reportName = (at: string) => at.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

export const CorpusSyncInput = Schema.Struct({
  mode: Schema.optional(Schema.Literals(['plan', 'sync'])),
  reembed: Schema.optional(Schema.Array(Schema.Finite)),
  recheck: Schema.optional(Schema.Finite),
});
export type CorpusSyncInput = typeof CorpusSyncInput.Type;

const NOTHING_ASKED: CorpusSyncInput = {};

const CorpusSyncPayload = Schema.Union([CorpusSyncInput, Schema.fromJsonString(CorpusSyncInput)]);
export type CorpusSyncPayload = typeof CorpusSyncPayload.Encoded;

const decodeInput = Schema.decodeUnknownEffect(CorpusSyncPayload);

export const corpusSyncInput = (payload: Option.Option<CorpusSyncPayload>) =>
  Option.match(payload, {
    onNone: () => Effect.succeed(NOTHING_ASKED),
    onSome: decodeInput,
  });

class InstallFailed extends Schema.TaggedError<InstallFailed>()('InstallFailed', {
  id: Schema.Finite,
  code: Schema.String,
  title: Schema.String,
  error: Schema.String,
}) {}

class CorpusSyncIncomplete extends Schema.TaggedError<CorpusSyncIncomplete>()(
  'CorpusSyncIncomplete',
  {
    message: Schema.String,
  },
) {}

const RETRIES = { limit: 3, delay: '1 minute', backoff: 'exponential' } as const;

const props = Effect.gen(function* () {
  const stage = yield* Effect.serviceOption(Stage);
  const base = {
    main: import.meta.url,
    workersDev: false,
    observability: { enabled: true },
    limits: { cpuMs: 300_000 },
  };
  if (!Option.contains(stage, 'prod')) return base;
  return {
    ...base,
    name: SYNC_WORKER_NAME,
    env: {
      CORPUS_SYNC: 'write',
      SYNC_REPORTS: 'publish',
      SYNC_MAIL_FROM: SYNC_MAIL.from,
      SYNC_MAIL_TO: SYNC_MAIL.to,
    },
  };
});

const workflowProps = Effect.map(Effect.serviceOption(Stage), (stage) => {
  const schedules = [SYNC_SCHEDULE];
  if (!Option.contains(stage, 'prod')) return { schedules };
  return { workflowName: SYNC_WORKFLOW_NAME, schedules };
});

export default class Sync extends Cloudflare.Worker<Sync>()(
  'Sync',
  props,
  Effect.gen(function* () {
    const corpus = yield* Cloudflare.D1.QueryDatabase(yield* Corpus);
    const vectors = yield* Cloudflare.Vectorize.SearchIndex(yield* Vectors);
    const ai = yield* Cloudflare.Workers.AI();
    const mailer = yield* Cloudflare.Email.Send(SyncMailer);
    const reports = yield* Cloudflare.R2.WriteBucket(yield* SyncReports);
    const embed = workersAiDocuments((inputs) =>
      ai.run(EMBEDDING_MODEL, inputs).pipe(Effect.provide(RuntimeContext.phantom)),
    );

    yield* Cloudflare.Workflow(
      'CorpusSync',
      yield* workflowProps,
      Effect.gen(function* () {
        const clientId = yield* Config.Redacted('EGW_CLIENT_ID');
        const clientSecret = yield* Config.Redacted('EGW_CLIENT_SECRET');

        const corpusLayer = Layer.unwrap(
          Effect.map(corpus.raw, (db) =>
            EGWParagraphDatabase.layerExisting.pipe(
              Layer.provide(D1Atomic),
              Layer.provideMerge(D1Client.layer({ db })),
            ),
          ),
        );
        const library = EGWApiClient.Live.pipe(
          Layer.provide(
            EGWAuth.Live.pipe(
              Layer.provide(EGWTokenStore.layerMemory()),
              Layer.provide(
                ConfigProvider.layer(
                  ConfigProvider.fromUnknown({
                    EGW_CLIENT_ID: Redacted.value(clientId),
                    EGW_CLIENT_SECRET: Redacted.value(clientSecret),
                  }),
                ),
              ),
            ),
          ),
        );
        const planLayer = Layer.mergeAll(library, corpusLayer).pipe(Layer.orDie);
        const installLayer = CorpusSupply.layer.pipe(
          Layer.provide(
            layerEgwWritingsAssetSource.pipe(
              Layer.provide(library),
              Layer.provide(Digest.layerWebCrypto),
            ),
          ),
          Layer.provideMerge(corpusLayer),
          Layer.orDie,
        );
        const readLayer = corpusLayer.pipe(Layer.orDie);

        const install = (book: EgwSyncBook) =>
          Cloudflare.Workflows.task(
            `install ${String(book.id)}`,
            installEgwBook(book, { refresh: false }).pipe(
              Effect.provide(installLayer),
              Effect.flatMap((outcome) =>
                Option.match(
                  Option.filter(failureOf(outcome), (failure) => !failure.expected),
                  {
                    onNone: () => Effect.succeed(outcome),
                    onSome: (failure) =>
                      Effect.fail(
                        InstallFailed.make({
                          id: failure.id,
                          code: failure.code,
                          title: failure.title,
                          error: failure.error,
                        }),
                      ),
                  },
                ),
              ),
            ),
            { retries: RETRIES, timeout: '15 minutes' },
          ).pipe(
            Effect.catchTag('InstallFailed', (failed) => {
              const outcome: EgwBookOutcome = {
                _tag: 'Failed',
                failure: {
                  id: failed.id,
                  code: failed.code,
                  title: failed.title,
                  error: failed.error,
                  expected: isKnownUnavailable(failed.id),
                },
              };
              return Effect.succeed(outcome);
            }),
          );

        const vectorsOf = Effect.fn('CorpusSync.vectors')(function* (
          bookId: number,
          scope: BookVectorsScope,
        ) {
          let after = 0;
          let upserted = 0;
          let name = 'vectors';
          if (scope === 'changed') name = 'changed vectors';
          while (true) {
            const page = yield* Cloudflare.Workflows.task(
              `${name} ${String(bookId)} ${String(after)}`,
              Effect.gen(function* () {
                const index = yield* vectors.raw;
                return yield* bookVectorsPage({ bookId, after, scope }, embed, index);
              }).pipe(Effect.provide(readLayer)),
              { retries: RETRIES, timeout: '10 minutes' },
            );
            upserted += page.upserted;
            after = page.after;
            if (page.read < BOOK_VECTORS_PAGE) return upserted;
          }
        });

        const unindex = (bookId: number) =>
          Cloudflare.Workflows.task(
            `unindex ${String(bookId)}`,
            Effect.gen(function* () {
              const ids = yield* removedVectorIds(bookId);
              return yield* deleteVectorIds(bookId, ids, yield* vectors.raw);
            }).pipe(Effect.provide(readLayer)),
            { retries: RETRIES },
          );

        const planStep = (recheckLimit: number) =>
          Cloudflare.Workflows.task(
            'plan',
            planEgwSync({ lang: 'en', refresh: false, recheckLimit }).pipe(
              Effect.provide(planLayer),
            ),
            { retries: RETRIES },
          );
        const optimized = Effect.flatMap(SqlClient.SqlClient, (sql) => sql`PRAGMA optimize`).pipe(
          Effect.asVoid,
          Effect.provide(readLayer),
          Effect.orDie,
        );
        const optimizeStep = Cloudflare.Workflows.task('optimize', optimized);

        const pruneSteps = Effect.fn('CorpusSync.prune')(function* () {
          const cutoff = yield* Cloudflare.Workflows.task(
            'prune cutoff',
            DateTime.now.pipe(
              Effect.map((now) => DateTime.formatIso(DateTime.subtractDuration(now, CHANGES_KEPT))),
            ),
          );
          let pruned = 0;
          let round = 0;
          while (true) {
            const gone = yield* Cloudflare.Workflows.task(
              `prune changes ${String(round)}`,
              Effect.flatMap(EGWParagraphDatabase, (database) =>
                database.pruneParagraphChanges(cutoff, PRUNE_ROUND),
              ).pipe(Effect.provide(readLayer)),
              { retries: RETRIES },
            );
            pruned += gone;
            round += 1;
            if (gone < PRUNE_ROUND) return pruned;
          }
        });
        const pruneStep = Effect.gen(function* () {
          const pruned = yield* Effect.exit(pruneSteps());
          if (Exit.isFailure(pruned)) {
            yield* Effect.logError('egw_sync_prune_failed', Cause.pretty(pruned.cause));
            return;
          }
          yield* Effect.log('egw_sync_pruned', `rows=${String(pruned.value)}`);
        });
        const reportStep = (plan: EgwSyncPlan, failures: readonly EgwSyncFailure[]) =>
          Cloudflare.Workflows.task(
            'report',
            reportEgwSync(plan, failures).pipe(Effect.provide(readLayer), Effect.orDie),
          );

        const mailStep = Effect.fn('CorpusSync.mail')(function* (outcome: SyncOutcome) {
          const env = yield* Cloudflare.WorkerEnvironment;
          const from: unknown = env['SYNC_MAIL_FROM'];
          const to: unknown = env['SYNC_MAIL_TO'];
          if (!Predicate.isString(from) || !Predicate.isString(to)) return;
          const message = syncMail(outcome);
          const sent = yield* Effect.exit(
            Cloudflare.Workflows.task(
              'mail',
              mailer.send({ from, to, ...message }).pipe(Effect.as({ subject: message.subject })),
              { retries: RETRIES },
            ),
          );
          if (Exit.isFailure(sent)) {
            yield* Effect.logError('egw_sync_mail_failed', Cause.pretty(sent.cause));
          }
        });

        const publishStep = (run: SyncRun) =>
          Cloudflare.Workflows.task(
            'publish report',
            Effect.gen(function* () {
              const changedIn = (books: readonly RecheckedBook[]) =>
                books.filter(({ changes }) => changeCount(changes) > 0);
              const read = (
                books: readonly RecheckedBook[],
                keep: (row: ParagraphChangeRow) => boolean,
              ) =>
                Effect.forEach(changedIn(books), ({ book }) =>
                  Effect.map(
                    latestParagraphChanges(book.id),
                    (rows) => [book.id, rows.filter(keep)] as const,
                  ),
                );
              const changes: ChangesByBook = new Map([
                ...(yield* read(run.updated, () => true)),
                ...(yield* read(run.verified, (row) => row.kind !== 'added')),
              ]);
              const at = DateTime.formatIso(yield* DateTime.now);
              const name = reportName(at);
              yield* reports.put(reportKey(name), syncReport(run, changes, at), {
                httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
              });
              const pageForm = {
                quoteLimit: Option.some(PAGE_QUOTES),
                markdownHref: `${name}.md`,
              };
              yield* reports.put(
                reportPageKey(name),
                reportPage(name, syncReport(run, changes, at, pageForm)),
                { httpMetadata: { contentType: 'text/html; charset=utf-8' } },
              );
              const all = updateChanges(run, changes);
              return {
                url: `${REPORT_PAGE}${name}`,
                excerpt: all.slice(0, MAIL_LIMIT),
                total: all.length,
              };
            }).pipe(Effect.provide(readLayer)),
            { retries: RETRIES },
          );

        const reportOf = Effect.fn('CorpusSync.reportOf')(function* (run: SyncRun) {
          const env = yield* Cloudflare.WorkerEnvironment;
          const nothing = { excerpt: [], updateChanges: 0, report: Option.none<string>() };
          if (env['SYNC_REPORTS'] !== 'publish') return nothing;
          const published = yield* Effect.exit(publishStep(run));
          if (Exit.isFailure(published)) {
            yield* Effect.logError('egw_sync_report_failed', Cause.pretty(published.cause));
            return nothing;
          }
          const { url, excerpt, total } = published.value;
          return { excerpt, updateChanges: total, report: Option.some(url) };
        });

        const runOnce = Effect.fn('CorpusSync.runOnce')(function* (input: CorpusSyncInput) {
          const env = yield* Cloudflare.WorkerEnvironment;
          const writes = env['CORPUS_SYNC'] === 'write' && input.mode !== 'plan';

          const plan = yield* planStep(
            Math.min(RECHECK_MAX, Math.max(0, input.recheck ?? RECHECK_LIMIT)),
          );
          yield* Effect.log(
            'egw_sync_plan',
            `writes=${String(writes)} remote=${String(plan.remote.length)}` +
              ` installed=${String(plan.installedBefore)} pending=${String(plan.pending.length)}` +
              ` changed=${String(plan.changed.length)} verify=${String(plan.verify.length)}` +
              ` recheck_left=${String(plan.recheckLeft)}`,
          );
          if (!writes) {
            return SyncOutcome.Planned({
              remote: plan.remote.length,
              installedBefore: plan.installedBefore,
              pending: plan.pending,
              changed: plan.changed,
              verify: plan.verify.length,
              recheckLeft: plan.recheckLeft,
            });
          }

          const failures: EgwSyncFailure[] = [];
          const added: EgwSyncBook[] = [];
          const vectorFailures: { readonly id: number; readonly reason: string }[] = [];
          const keepVectorFailure = (failed: BookVectorsFailed) =>
            Effect.sync(() => {
              vectorFailures.push({ id: failed.bookId, reason: failed.reason });
              return 0;
            });
          const addVectors = (bookId: number, scope: BookVectorsScope) =>
            vectorsOf(bookId, scope).pipe(Effect.catchTag('BookVectorsFailed', keepVectorFailure));
          for (const book of plan.pending) {
            const outcome = yield* install(book);
            if (outcome._tag === 'Failed') {
              failures.push(outcome.failure);
              continue;
            }
            added.push(book);
            yield* addVectors(book.id, 'book');
          }
          const recheck = Effect.fn('CorpusSync.recheck')(function* (
            books: readonly EgwSyncBook[],
          ) {
            const done: RecheckedBook[] = [];
            for (const book of books) {
              const outcome = yield* install(book);
              if (outcome._tag === 'Failed') {
                failures.push(outcome.failure);
                continue;
              }
              done.push({ book, changes: outcome.changes });
              if (outcome.changes.added + outcome.changes.edited > 0) {
                yield* addVectors(book.id, 'changed');
              }
              if (outcome.changes.removed > 0) {
                yield* unindex(book.id).pipe(
                  Effect.catchTag('BookVectorsFailed', keepVectorFailure),
                );
              }
            }
            return done;
          });
          const updated = yield* recheck(plan.changed);
          const verified = yield* recheck(plan.verify);
          for (const id of input.reembed ?? []) yield* addVectors(id, 'book');

          yield* pruneStep;
          yield* optimizeStep;
          const report = yield* reportStep(plan, failures);
          yield* Effect.log(
            'egw_sync_done',
            `installed=${String(report.installed)} failed=${String(report.failed)}` +
              ` unexpected=${String(report.unexpectedFailures)}` +
              ` updated=${String(updated.length)} verified=${String(verified.length)}` +
              ` vector_failures=${String(vectorFailures.length)}`,
          );
          const run: SyncRun = {
            counts: report,
            added,
            updated,
            verified,
            recheckLeft: plan.recheckLeft,
            vectorFailures,
          };
          return SyncOutcome.Synced({ run, ...(yield* reportOf(run)) });
        });

        return Effect.fn('CorpusSync.run')(function* (payload: CorpusSyncInput) {
          const exit = yield* Effect.exit(
            Effect.flatMap(corpusSyncInput(Option.fromNullishOr(payload)), runOnce),
          );
          if (Exit.isFailure(exit)) {
            const reason = Cause.pretty(exit.cause).slice(0, MAIL_CAUSE_LIMIT);
            yield* mailStep(SyncOutcome.Stopped({ reason }));
            return yield* Effect.failCause(exit.cause);
          }
          const outcome = exit.value;
          yield* mailStep(outcome);
          if (outcome._tag === 'Planned') {
            return {
              mode: 'plan' as const,
              remote: outcome.remote,
              installedBefore: outcome.installedBefore,
              pending: outcome.pending.map((book) => book.code),
              changed: outcome.changed.map((book) => book.code),
              verify: outcome.verify,
              recheckLeft: outcome.recheckLeft,
            };
          }
          const { counts: report, vectorFailures } = outcome.run;
          if (report.unexpectedFailures > 0 || vectorFailures.length > 0) {
            return yield* CorpusSyncIncomplete.make({
              message:
                `unexpected install failures: ${report.failures
                  .filter((failure) => !failure.expected)
                  .map((failure) => `${failure.code} (${failure.error})`)
                  .join(', ')}; ` +
                `vector failures: ${vectorFailures.map((failed) => `${String(failed.id)} (${failed.reason})`).join(', ')}`,
            });
          }
          return {
            mode: 'sync' as const,
            report,
            published: Option.getOrUndefined(outcome.report),
          };
        });
      }),
    );

    return { fetch: Effect.succeed(HttpServerResponse.text('Not Found', { status: 404 })) };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Cloudflare.D1.QueryDatabaseBinding,
        Cloudflare.Vectorize.SearchIndexBinding,
        Cloudflare.Workers.AIBinding,
        Cloudflare.Email.SendBinding,
        Cloudflare.R2.WriteBucketBinding,
      ),
    ),
  ),
) {}
