/**
 * Effect's `KeyValueStore` over one file of Exact's `storage.fs`, for a data
 * module whose services keep strings by key: Exact's data module has `fs`
 * and `sqlite`, and no key-value API at the pin.
 *
 * The file holds every entry as JSON: an array of `[key, value]` pairs in
 * the order the keys were first set, as UTF-8, each key once. JSON writes a
 * lone surrogate as an escape, so every string a `Map` holds reads back the
 * same. No file (`ENOENT`) is an empty store; a file this store did not
 * write fails every call, and is never written over.
 *
 * A layer is built per call. Its first operation reads the file, and the
 * entries it read are the call's from then on: each `set`, `remove` and
 * `clear` writes the whole file again with one `atomicWriteFile`, and only
 * once that write lands do the call's entries change, so a failed write
 * leaves the store as it was. A read that fails holds nothing, and the next
 * operation reads again. Every failure is a `KeyValueStoreError` naming
 * its method and key; nothing is thrown. Nothing is kept once the call
 * ends, so two calls that overlap are ordered by their caller.
 */

import { Effect, Layer, MutableRef, Option, Schema } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

/** The part of Exact's `Storage` the store uses. */
export interface FileStorage {
  readonly fs: {
    readonly readFile: (path: string) => PromiseLike<ArrayBuffer>;
    readonly atomicWriteFile: (path: string, data: Uint8Array) => PromiseLike<unknown>;
  };
}

type Entries = ReadonlyMap<string, string>;

const EMPTY: Entries = new Map();

/** The file's text: every entry as a `[key, value]` pair, each key once. */
const File = Schema.fromJsonString(
  Schema.Array(Schema.Tuple([Schema.String, Schema.String])).check(
    Schema.makeFilter((pairs) => {
      if (new Set(pairs.map(([key]) => key)).size === pairs.length) return true;
      return 'a key stored twice';
    }),
  ),
);

/** Why the file could not be read: the host's refusal (its `code`, `ENOENT` for no file), or bytes this store did not write. */
class Unread extends Schema.TaggedError<Unread>()('Unread', {
  code: Schema.String,
  cause: Schema.Unknown,
}) {}

/** The host's refusal of a read, as `Unread`, keeping its `code` when it has one. */
const unreadOf = (cause: unknown) =>
  Unread.make({
    code: Option.match(Schema.decodeUnknownOption(Schema.Struct({ code: Schema.String }))(cause), {
      onNone: () => 'unknown',
      onSome: ({ code }) => code,
    }),
    cause,
  });

const failure = (method: string, key: Option.Option<string>, cause: unknown) =>
  Option.match(key, {
    onNone: () => new KeyValueStore.KeyValueStoreError({ message: method, method, cause }),
    onSome: (k) =>
      new KeyValueStore.KeyValueStoreError({ message: `${method} ${k}`, method, key: k, cause }),
  });

/** The file's bytes as entries; `Unread` for bytes this store did not write. */
const entriesOf = (bytes: ArrayBuffer) =>
  Effect.try({
    try: () => new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    catch: (cause) => Unread.make({ code: 'text', cause }),
  }).pipe(
    Effect.flatMap((text) =>
      Schema.decodeEffect(File)(text).pipe(
        Effect.mapError((cause) => Unread.make({ code: 'text', cause })),
      ),
    ),
    Effect.map((pairs): Entries => new Map(pairs)),
  );

const bytesOf = (entries: Entries) =>
  Effect.map(Schema.encodeEffect(File)([...entries]), (text) => new TextEncoder().encode(text));

/** The store's calls over `path`, the entries read held for the layer's one call. */
const storeAt = (storage: FileStorage, path: string): KeyValueStore.KeyValueStore => {
  const held = MutableRef.make(Option.none<Entries>());

  const read = (method: string, key: Option.Option<string>) =>
    Effect.suspend(() =>
      Option.match(MutableRef.get(held), {
        onSome: (entries) => Effect.succeed(entries),
        onNone: () =>
          Effect.tryPromise({
            try: () => storage.fs.readFile(path),
            catch: unreadOf,
          }).pipe(
            Effect.flatMap(entriesOf),
            Effect.catchIf(
              (unread) => unread.code === 'ENOENT',
              () => Effect.succeed(EMPTY),
            ),
            Effect.mapError((unread) => failure(method, key, unread)),
            Effect.tap((entries) => Effect.sync(() => MutableRef.set(held, Option.some(entries)))),
          ),
      }),
    );

  const write = (
    method: string,
    key: Option.Option<string>,
    change: (entries: Entries) => Entries,
  ) =>
    Effect.flatMap(read(method, key), (entries) => {
      const next = change(entries);
      return bytesOf(next).pipe(
        Effect.mapError((cause) => failure(method, key, cause)),
        Effect.flatMap((bytes) =>
          Effect.tryPromise({
            try: () => storage.fs.atomicWriteFile(path, bytes),
            catch: (cause) => failure(method, key, cause),
          }),
        ),
        Effect.flatMap(() => Effect.sync(() => MutableRef.set(held, Option.some(next)))),
        Effect.asVoid,
      );
    });

  return KeyValueStore.makeStringOnly({
    get: (key) =>
      Effect.map(read('get', Option.some(key)), (entries) =>
        Option.getOrUndefined(Option.fromUndefinedOr(entries.get(key))),
      ),
    set: (key, value) =>
      write('set', Option.some(key), (entries) => new Map(entries).set(key, value)),
    remove: (key) =>
      write('remove', Option.some(key), (entries) => {
        const next = new Map(entries);
        next.delete(key);
        return next;
      }),
    clear: write('clear', Option.none(), () => EMPTY),
    size: Effect.map(read('size', Option.none()), (entries) => entries.size),
    keys: Effect.map(read('keys', Option.none()), (entries) => [...entries.keys()]),
  });
};

/** A `KeyValueStore` over the file at `path` of `storage`, for one call: read at its first operation, written whole at each change. */
export const layerFile = (
  storage: FileStorage,
  path: string,
): Layer.Layer<KeyValueStore.KeyValueStore> =>
  Layer.sync(KeyValueStore.KeyValueStore)(() => storeAt(storage, path));
