import { Schema } from 'effect';

const FolderStoreConfig = Schema.Struct({
  kind: Schema.tag('folder'),
  folder: Schema.String,
});
type FolderStoreConfig = typeof FolderStoreConfig.Type;

export const R2StoreConfig = Schema.Struct({
  kind: Schema.tag('r2'),
  bucket: Schema.String,
});
export type R2StoreConfig = typeof R2StoreConfig.Type;

export const StoreConfig = Schema.Union([FolderStoreConfig, R2StoreConfig]);
export type StoreConfig = typeof StoreConfig.Type;

export const defineStore = <const S extends StoreConfig>(store: S): S => store;
