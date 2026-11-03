import { Mac } from 'effect/crypto';

import { Config, Context, Effect, FileSystem, Layer, Option, Path, Redacted } from 'effect';
import { HttpClient } from 'effect/http';
import type { R2StoreConfig, StoreConfig } from '../core/store.ts';
import { type FilmModuleInvalid, StoreCredentialsMissing } from './errors.ts';
import { libraryModule } from './film-repo.ts';
import { type MediaStoreService, expandHome, folderStore } from './media-store.ts';
import { type R2Access, r2Store } from './r2-store.ts';

export const R2_ENV = {
  accountId: 'FILM_STORE_ACCOUNT_ID',
  accessKeyId: 'FILM_STORE_ACCESS_KEY_ID',
  secretAccessKey: 'FILM_STORE_SECRET_ACCESS_KEY',
} as const;

export type StoreUnavailable = FilmModuleInvalid | StoreCredentialsMissing;

interface PrivateStoreService {
  readonly store: Effect.Effect<MediaStoreService, StoreUnavailable>;
}

interface R2Env {
  readonly accountId: Option.Option<Redacted.Redacted<string>>;
  readonly accessKeyId: Option.Option<Redacted.Redacted<string>>;
  readonly secretAccessKey: Option.Option<Redacted.Redacted<string>>;
}

const readEnv = (name: string) => Config.option(Config.Redacted(name)).pipe(Effect.orDie);

const r2Access = (
  config: R2StoreConfig,
  env: R2Env,
): Effect.Effect<R2Access, StoreCredentialsMissing> => {
  const { accountId, accessKeyId, secretAccessKey } = env;
  if (Option.isSome(accountId) && Option.isSome(accessKeyId) && Option.isSome(secretAccessKey))
    return Effect.succeed({
      accountId: accountId.value,
      credentials: {
        accessKeyId: Redacted.value(accessKeyId.value),
        secretAccessKey: secretAccessKey.value,
      },
    });
  const fields: ReadonlyArray<keyof R2Env> = ['accountId', 'accessKeyId', 'secretAccessKey'];
  const missing = fields.flatMap((field) => {
    if (Option.isSome(env[field])) return [];
    return [R2_ENV[field]];
  });
  return Effect.fail(StoreCredentialsMissing.make({ bucket: config.bucket, missing }));
};

export class PrivateStore extends Context.Service<PrivateStore, PrivateStoreService>()(
  '@manna/film/tools/PrivateStore',
) {
  static readonly layer = (dir: string) =>
    Layer.effect(
      PrivateStore,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const crypto = yield* Mac.Mac;
        const http = yield* HttpClient.HttpClient;
        const home = yield* Config.String('HOME').pipe(Config.withDefault('~'));
        const env: R2Env = {
          accountId: yield* readEnv(R2_ENV.accountId),
          accessKeyId: yield* readEnv(R2_ENV.accessKeyId),
          secretAccessKey: yield* readEnv(R2_ENV.secretAccessKey),
        };
        const of = Effect.fnUntraced(function* (declared: StoreConfig) {
          switch (declared.kind) {
            case 'folder':
              return folderStore(fs, path, expandHome(declared.folder, home));
            case 'r2':
              return r2Store({ fs, path, crypto, http }, declared, yield* r2Access(declared, env));
          }
        });
        const resolve = Effect.gen(function* () {
          const { store } = yield* libraryModule(path.join(dir, 'library.ts'));
          const resolved = yield* of(store);
          yield* Effect.logDebug(`store.resolved kind=${store.kind} where=${resolved.where}`);
          return resolved;
        });
        return PrivateStore.of({ store: yield* Effect.cached(resolve) });
      }),
    );
}
