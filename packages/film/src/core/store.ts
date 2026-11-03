import { Schema } from 'effect';

/** A store that is a folder (`~/` is the home folder): each key a file at that path under it. */
const FolderStoreConfig = Schema.Struct({
  kind: Schema.tag('folder'),
  folder: Schema.String,
});
type FolderStoreConfig = typeof FolderStoreConfig.Type;

/**
 * A private Cloudflare R2 bucket, reached over its S3 API. The account and
 * the bucket-scoped key come from the environment (`FILM_STORE_*`), never
 * from here: this file is public. The bucket is the one the app's
 * `film-store` stack makes, in the account's default jurisdiction.
 */
export const R2StoreConfig = Schema.Struct({
  kind: Schema.tag('r2'),
  bucket: Schema.String,
});
export type R2StoreConfig = typeof R2StoreConfig.Type;

/** Where the private media is kept off the repo: a folder, or a private R2 bucket. */
export const StoreConfig = Schema.Union([FolderStoreConfig, R2StoreConfig]);
export type StoreConfig = typeof StoreConfig.Type;

/** Declare the store: the identity, typed, so an app gets its checks at the declaration. */
export const defineStore = <const S extends StoreConfig>(store: S): S => store;
