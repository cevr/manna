import { Database } from 'bun:sqlite';
import { Console, Effect, FileSystem, Option, Path, Result, Schedule, Schema } from 'effect';

import { type Answer, MAX_AGE_DAYS, Store, type Verdict } from './store.js';

const LOCK_TRIES = { every: '25 millis', times: 80 } as const;

class StoreLocked extends Schema.TaggedError<StoreLocked>()('StoreLocked', {
  lock: Schema.String,
}) {}

class StoreLockFailed extends Schema.TaggedError<StoreLockFailed>()('StoreLockFailed', {
  lock: Schema.String,
  cause: Schema.String,
}) {}

const isBusy = Schema.is(Schema.Struct({ code: Schema.Literal('SQLITE_BUSY') }));

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

interface Keeping {
  readonly fresh: ReadonlyMap<string, Verdict>;
  readonly read: ReadonlySet<string>;
  readonly day: number;
}

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

export const changes = (kept: ReadonlyMap<string, Answer>, keeping: Keeping) =>
  keeping.fresh.size > 0 ||
  [...keeping.read].some((key) =>
    Option.exists(Option.fromUndefinedOr(kept.get(key)), (answer) => answer.seen < keeping.day),
  ) ||
  [...kept.values()].some((answer) => keeping.day - answer.seen > MAX_AGE_DAYS);

export const keepAnswers = Effect.fn('judged.keepAnswers')(function* (
  file: string,
  keeping: Keeping,
) {
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
