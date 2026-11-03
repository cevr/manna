import { Database, constants } from 'bun:sqlite';
import { Effect, Option, Result, Schema } from 'effect';
import { type PlatformError, systemError } from 'effect/PlatformError';
// oxlint-disable-next-line effect/noNodeBuiltinImport -- ManifestLock's Bun adapter: resolves its folder outside any Effect
import { realpathSync } from 'node:fs';
// oxlint-disable-next-line effect/noNodeBuiltinImport -- ManifestLock's Bun adapter: names its file outside any Effect
import { basename, dirname, join } from 'node:path';
import type { ManifestLockService } from './manifest-lock.ts';

export const lockFile = (file: string): string => join(dirname(file), `.${basename(file)}.lock`);

const OPEN =
  constants.SQLITE_OPEN_READWRITE | constants.SQLITE_OPEN_CREATE | constants.SQLITE_OPEN_NOFOLLOW;

const isBusy = Schema.is(Schema.Struct({ code: Schema.Literal('SQLITE_BUSY') }));

const refused = (lock: string, cause: unknown): PlatformError =>
  systemError({
    _tag: 'Unknown',
    module: 'ManifestLock',
    method: 'take',
    pathOrDescriptor: lock,
    description: String(cause),
    cause,
  });

export const bunManifestLock: ManifestLockService = {
  take: (file) =>
    Effect.gen(function* () {
      const lock = lockFile(file);
      const db = yield* Effect.try({
        try: () => new Database(join(realpathSync(dirname(lock)), basename(lock)), OPEN),
        catch: (cause) => refused(lock, cause),
      });
      const taken = Result.try(() => {
        db.exec('PRAGMA busy_timeout = 0');
        db.exec('PRAGMA journal_mode = MEMORY');
        db.exec('BEGIN IMMEDIATE');
      });
      if (Result.isFailure(taken)) {
        db.close();
        if (isBusy(taken.failure)) return Option.none();
        return yield* refused(lock, taken.failure);
      }
      return Option.some(Effect.sync(() => db.close()));
    }),
};
