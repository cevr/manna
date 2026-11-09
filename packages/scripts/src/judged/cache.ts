import { Database } from 'bun:sqlite';
import {
  Console,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  type PlatformError,
  Result,
  Schedule,
  Schema,
} from 'effect';

import { type Answer, MAX_AGE_DAYS, Store, type Verdict } from './store.js';

/** How often, and how many times, a run tries for the lock another run holds: 2 s in all. */
const LOCK_TRIES = { every: '25 millis', times: 80 } as const;

/** Another run holds the store's lock. */
class StoreLocked extends Schema.TaggedError<StoreLocked>()('StoreLocked', {
  lock: Schema.String,
}) {}

/** The store's lock file could not be opened or locked: its path and SQLite's words. */
class StoreLockFailed extends Schema.TaggedError<StoreLockFailed>()('StoreLockFailed', {
  lock: Schema.String,
  cause: Schema.String,
}) {}

/** Whether SQLite refused because another connection holds the lock. */
const isBusy = Schema.is(Schema.Struct({ code: Schema.Literal('SQLITE_BUSY') }));

/** Tries once for SQLite's write lock on `lock`: the open connection that holds it. */
const tryLock = (lock: string) =>
  Effect.gen(function* () {
    const db = yield* Effect.try({
      try: () => new Database(lock, { create: true }),
      catch: (cause) => StoreLockFailed.make({ lock, cause: String(cause) }),
    });
    const taken = Result.try(() => {
      db.exec('PRAGMA busy_timeout = 0');
      db.exec('PRAGMA journal_mode = MEMORY');
      db.exec('BEGIN IMMEDIATE');
    });
    if (Result.isSuccess(taken)) return db;
    db.close();
    if (isBusy(taken.failure)) return yield* StoreLocked.make({ lock });
    return yield* StoreLockFailed.make({ lock, cause: String(taken.failure) });
  });

/** Holds the store's lock `lock` for the scope, waiting for another run's; closing the connection lets it go. */
const locked = (lock: string) =>
  Effect.acquireRelease(
    tryLock(lock).pipe(
      Effect.retry({
        schedule: Schedule.spaced(LOCK_TRIES.every),
        times: LOCK_TRIES.times,
        while: (error) => error._tag === 'StoreLocked',
      }),
    ),
    (db) => Effect.sync(() => db.close()),
  );

/** The answers kept in `file`: none when it is missing, or when it does not decode (said on one line). */
export const readCache = Effect.fn('judged.readCache')(function* (file: string) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(file).pipe(Effect.option);
  const store = yield* Option.match(text, {
    onNone: () => Effect.succeed<Store>({ answers: {} }),
    onSome: (json) =>
      Schema.decodeEffect(Store)(json).pipe(
        Effect.catch(() =>
          Console.log(`[judged] store unread file=${file} reason=decode`).pipe(
            Effect.as<Store>({ answers: {} }),
          ),
        ),
      ),
  });
  return new Map(Object.entries(store.answers));
});

/** What a run keeps: its new answers, the kept keys it read, and its day (`store.ts`'s `dayOf`). */
interface Keeping {
  readonly fresh: ReadonlyMap<string, Verdict>;
  readonly read: ReadonlySet<string>;
  readonly day: number;
}

/**
 * The answers `kept` hold once a run keeps `keeping`: each answer of `fresh`
 * whose key `kept` lacks added, each key of `read` and `fresh` marked seen on
 * `day` unless a later run marked it seen on a later day, and every answer
 * last seen more than `MAX_AGE_DAYS` before it dropped. A key `kept` holds
 * keeps its answer: the first kept is the store's.
 */
const keptAfter = (kept: ReadonlyMap<string, Answer>, keeping: Keeping) => {
  const after = new Map(kept);
  for (const key of [...keeping.read, ...keeping.fresh.keys()])
    Option.map(Option.fromUndefinedOr(after.get(key)), (answer) =>
      after.set(key, { ...answer, seen: Math.max(answer.seen, keeping.day) }),
    );
  for (const [key, answer] of keeping.fresh)
    if (!kept.has(key)) after.set(key, { ...answer, seen: keeping.day });
  for (const [key, answer] of after)
    if (keeping.day - answer.seen > MAX_AGE_DAYS) after.delete(key);
  return after;
};

/**
 * Whether keeping `keeping` changes `kept`: a fresh answer, a read answer
 * last seen before its day, or an answer past its age. A run that changes
 * nothing writes nothing.
 */
export const changes = (kept: ReadonlyMap<string, Answer>, keeping: Keeping) =>
  keeping.fresh.size > 0 ||
  [...keeping.read].some((key) =>
    Option.exists(Option.fromUndefinedOr(kept.get(key)), (answer) => answer.seen < keeping.day),
  ) ||
  [...kept.values()].some((answer) => keeping.day - answer.seen > MAX_AGE_DAYS);

/**
 * Keeps `keeping` in the store at `file` (`keptAfter`), under its lock,
 * written whole through a temporary file beside it: an answer another run
 * kept meanwhile is read under the lock, and stays. Answers the store as
 * written, the answers to report by.
 */
const keepAnswers = Effect.fn('judged.keepAnswers')(function* (file: string, keeping: Keeping) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(path.dirname(file), { recursive: true });
  return yield* Effect.scoped(
    Effect.gen(function* () {
      yield* locked(path.join(path.dirname(file), `.${path.basename(file)}.lock`));
      const kept = keptAfter(yield* readCache(file), keeping);
      const json = yield* Schema.encodeEffect(Store)({ answers: Object.fromEntries(kept) });
      const partial = `${file}.${process.pid}.partial`;
      yield* Effect.gen(function* () {
        yield* fs.writeFileString(partial, json);
        yield* fs.rename(partial, file);
      }).pipe(Effect.ensuring(Effect.ignore(fs.remove(partial, { force: true }))));
      return kept;
    }),
  );
});

/**
 * Where a judged run reads and keeps what it learns: the answers of the store
 * every checkout shares, and the checkout's own files (its items memo, its
 * last run's findings).
 */
export class JudgedStore extends Context.Service<
  JudgedStore,
  {
    /** The answers kept in the store at `file` (`readCache`). */
    readonly read: (file: string) => Effect.Effect<Map<string, Answer>>;
    /** Keeps a run's answers in the store at `file`: the answers to report by. */
    readonly keep: (
      file: string,
      keeping: Keeping,
    ) => Effect.Effect<ReadonlyMap<string, Answer>, Effect.Error<ReturnType<typeof keepAnswers>>>;
    /** Writes a checkout file whole, through a temporary file renamed over it. */
    readonly write: (
      file: string,
      text: string,
    ) => Effect.Effect<void, PlatformError.PlatformError>;
  }
>()('judged/JudgedStore') {}

/** `readCache` over the file system the layer is built with. */
const reader = Effect.map(
  Effect.context<FileSystem.FileSystem>(),
  (context) => (file: string) => readCache(file).pipe(Effect.provideContext(context)),
);

/** The store as `bun run lint:judged` keeps it: answers kept under its lock, and the checkout's files written. */
export const judgedStoreLayer = Layer.effect(JudgedStore)(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const context = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
    return JudgedStore.of({
      read: yield* reader,
      keep: (file, keeping) => keepAnswers(file, keeping).pipe(Effect.provideContext(context)),
      write: (file, text) =>
        Effect.gen(function* () {
          yield* fs.makeDirectory(path.dirname(file), { recursive: true });
          const temporary = `${file}.${process.pid}.tmp`;
          yield* fs.writeFileString(temporary, text);
          yield* fs.rename(temporary, file);
        }),
    });
  }),
);

/**
 * The store as a reviewer reads it: its answers, and nothing written
 * anywhere. Keeping answers takes no lock and changes no file: the store
 * stays as it is, and a run reports by its answers as read.
 */
export const readOnlyStoreLayer = Layer.effect(JudgedStore)(
  Effect.gen(function* () {
    const read = yield* reader;
    return JudgedStore.of({ read, keep: (file) => read(file), write: () => Effect.void });
  }),
);
