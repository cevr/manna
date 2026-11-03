/**
 * The app's settings store: One's key-value store (SQLite on a phone, local
 * storage on the web) under Effect's KeyValueStore. Each failed call is
 * logged with its method and key; where the store cannot open at all, the
 * settings live in memory for the session.
 */

import { Effect, Layer, Option } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import { One } from 'one';

type Database = ReturnType<typeof One.Database.openKeyValue>;

/** One store call, its failure typed and logged with the method and the key it read or wrote (none for a call on the whole store). */
const call = <A>(method: string, key: Option.Option<string>, run: () => A) =>
  Effect.try({
    try: run,
    catch: (cause) =>
      Option.match(key, {
        onNone: () => new KeyValueStore.KeyValueStoreError({ message: method, method, cause }),
        onSome: (k) =>
          new KeyValueStore.KeyValueStoreError({
            message: `${method} ${k}`,
            method,
            key: k,
            cause,
          }),
      }),
  }).pipe(
    Effect.tapError((error) =>
      Effect.logWarning('settings.store.failed').pipe(
        Effect.annotateLogs({
          method,
          key: Option.getOrElse(key, () => '*'),
          cause: String(error.cause),
        }),
      ),
    ),
  );

const storeOn = (db: Database) =>
  KeyValueStore.makeStringOnly({
    get: (key) =>
      call('get', Option.some(key), () =>
        Option.getOrUndefined(Option.fromNullishOr(db.getItem(key))),
      ),
    set: (key, value) => call('set', Option.some(key), () => db.setItem(key, value)),
    remove: (key) => call('remove', Option.some(key), () => db.removeItem(key)),
    clear: call('clear', Option.none(), () => db.clear()),
    size: call('size', Option.none(), () => db.getAllKeys().length),
    keys: call('keys', Option.none(), () => db.getAllKeys()),
  });

/** The app's KeyValueStore: One's store named `heartseed`, or memory where it cannot open. */
export const store: Layer.Layer<KeyValueStore.KeyValueStore> = Layer.unwrap(
  Effect.match(
    call('open', Option.none(), () => One.Database.openKeyValue({ name: 'heartseed' })),
    {
      onFailure: () => KeyValueStore.layerMemory,
      onSuccess: (db) => Layer.succeed(KeyValueStore.KeyValueStore, storeOn(db)),
    },
  ),
);
