/**
 * The current app's offline cache (`apps/hymnal/src/offline/cache.ts`), as
 * the port's store model test runs it: only what the test calls is
 * declared, the media and the transport the cache runs over and the
 * service it answers, in `effect`'s types. The source imports `~/remote`,
 * which only the current app's own type check resolves; the test loads the
 * source itself, and `store.model.test.ts` assigns each export it reads to
 * its declaration here.
 */

import type { Context, Effect, Layer, Option, Stream } from 'effect';

export type Code = 'network' | 'storage' | 'invalid';
export interface OfflineError {
  readonly _tag: 'OfflineError';
  readonly code: Code;
}
export declare const OfflineError: {
  readonly make: (fields: { readonly code: Code }) => OfflineError;
};

export interface Identity {
  readonly number: number;
  readonly offset: number;
}
export type Entry = Identity & { readonly bytes: number; readonly total: number } & {
  readonly etag: string;
  readonly complete: boolean;
};
export interface Range {
  readonly at: number;
  readonly total: number;
  readonly etag: string;
  readonly bytes: Uint8Array;
}
export type Snapshot = {
  readonly saved: number;
  readonly printed: number;
  readonly bytes: number;
} & {
  readonly active: number;
  readonly queued: number;
  readonly partialBytes: number;
  readonly failed: number;
} & { readonly paused: boolean; readonly storage: boolean; readonly indexing: boolean };

type Call<A> = Effect.Effect<A, OfflineError>;
export interface MediaApi {
  readonly list: Call<readonly Entry[]>;
  readonly size: (id: Identity) => Call<number>;
  readonly append: (id: Identity, at: number, bytes: Uint8Array) => Call<void>;
  readonly save: (entry: Entry) => Call<void>;
  readonly remove: (id: Identity) => Call<void>;
  readonly removeOld: Call<void>;
  readonly protect: Call<void>;
  readonly local: (entry: Entry) => Call<string>;
}
export interface HttpApi {
  readonly range: (id: Identity, at: number, end: number) => Call<Range>;
}
export interface OfflineApi {
  readonly enqueue: (id: Identity) => Effect.Effect<void>;
  readonly shown: (number: number) => Effect.Effect<void>;
  readonly downloadAll: Effect.Effect<void>;
  readonly cancel: Effect.Effect<void>;
  readonly deleteAll: Call<void>;
  readonly invalidate: (id: Identity) => Call<void>;
  readonly local: (id: Identity) => Effect.Effect<Option.Option<string>>;
  readonly snapshot: Effect.Effect<Snapshot>;
  readonly changes: Stream.Stream<Snapshot>;
}

export declare const Media: Context.Service<'hymnal/offline/Media', MediaApi>;
export declare const Http: Context.Service<'hymnal/offline/Http', HttpApi>;
export declare const Offline: Context.Service<'hymnal/offline/Offline', OfflineApi>;
export declare const offlineLayer: Layer.Layer<
  'hymnal/offline/Offline',
  never,
  'hymnal/offline/Media' | 'hymnal/offline/Http'
>;
export declare const identityKey: (id: Identity) => string;
