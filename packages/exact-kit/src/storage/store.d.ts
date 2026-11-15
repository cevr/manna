import type { Layer } from 'effect';
import type { KeyValueStore } from 'effect/persistence/KeyValueStore';

/** The two calls of Exact's `storage.fs` the store makes (`store.ts`). */
export interface FileStorage {
  readonly fs: {
    readonly readFile: (path: string) => PromiseLike<ArrayBuffer>;
    readonly atomicWriteFile: (path: string, data: Uint8Array) => PromiseLike<unknown>;
  };
}

/** Effect's `KeyValueStore` over one file of `storage`, built for one call (`store.ts`). */
export declare const layerFile: (storage: FileStorage, path: string) => Layer.Layer<KeyValueStore>;
