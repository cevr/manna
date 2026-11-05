/**
 * The app's store on the device: One's key-value store named `heartseed`
 * (SQLite on a phone, local storage on the web) under Effect's
 * KeyValueStore. It holds the settings (the voice's switch) and the
 * garden's recalls.
 *
 * It opens at its first call and keeps the handle for the layer's life; a
 * call made while it is not open tries the open first, so an open that
 * throws fails that one call and the next call tries again. Each build of
 * the layer opens anew, and the handle it opened is closed when its scope
 * closes (one SQLite connection per open, so the close is this layer's
 * alone). A failure is a failure: every call answers only
 * what One's store answered, and a call that throws (or whose open throws)
 * fails with `KeyValueStoreError`, logged with its method and key. Nothing
 * stands in for the device's store.
 */

import { Effect, Layer, MutableRef, Option } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import { One } from 'one';

type Database = ReturnType<typeof One.Database.openKeyValue>;

/** The name of the app's store on the device. */
const NAME = 'heartseed';

/** One store's calls over `held`, the handle opened at the first call that needs it. */
const storeOnDevice = (held: MutableRef.MutableRef<Option.Option<Database>>) => {
  /** The open handle, opening the store when it is not open; throws as the open throws, and holds nothing then. */
  const opened = (): Database =>
    Option.getOrElse(MutableRef.get(held), () => {
      const db = One.Database.openKeyValue({ name: NAME });
      MutableRef.set(held, Option.some(db));
      return db;
    });

  /** One call on the store, opening it first when needed, its failure typed and logged with the method, the key (none for a call on the whole store) and whether the store was open. */
  const call = <A>(method: string, key: Option.Option<string>, run: (open: Database) => A) =>
    Effect.try({
      try: () => run(opened()),
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
        Effect.logWarning('store.failed').pipe(
          Effect.annotateLogs({
            method,
            key: Option.getOrElse(key, () => '*'),
            open: Option.isSome(MutableRef.get(held)),
            cause: String(error.cause),
          }),
        ),
      ),
    );

  return KeyValueStore.makeStringOnly({
    get: (key) =>
      call('get', Option.some(key), (open) =>
        Option.getOrUndefined(Option.fromNullishOr(open.getItem(key))),
      ),
    set: (key, value) => call('set', Option.some(key), (open) => open.setItem(key, value)),
    remove: (key) => call('remove', Option.some(key), (open) => open.removeItem(key)),
    clear: call('clear', Option.none(), (open) => open.clear()),
    size: call('size', Option.none(), (open) => open.getAllKeys().length),
    keys: call('keys', Option.none(), (open) => open.getAllKeys()),
  });
};

/** Closes the handle this layer opened, if it opened one, and holds nothing after; a close that throws is logged, never raised. */
const release = (held: MutableRef.MutableRef<Option.Option<Database>>) =>
  Option.match(MutableRef.get(held), {
    onNone: () => Effect.void,
    onSome: (db) =>
      Effect.try({
        try: () => db.close(),
        catch: (cause) =>
          new KeyValueStore.KeyValueStoreError({ message: 'close', method: 'close', cause }),
      }).pipe(
        Effect.ensuring(Effect.sync(() => MutableRef.set(held, Option.none()))),
        Effect.catch((error) =>
          Effect.logWarning('store.close.failed').pipe(
            Effect.annotateLogs({ cause: String(error.cause) }),
          ),
        ),
      ),
  });

/** The app's KeyValueStore: One's store named `heartseed`, opened at its first call, retried at each call while it is not open, and closed when the layer's scope closes. */
export const store: Layer.Layer<KeyValueStore.KeyValueStore> = Layer.effect(
  KeyValueStore.KeyValueStore,
  Effect.gen(function* () {
    const held = MutableRef.make(Option.none<Database>());
    yield* Effect.addFinalizer(() => release(held));
    return storeOnDevice(held);
  }),
);
