import { Effect, Layer, Option, type Schema } from 'effect';
import { KeyValueStore } from 'effect/persistence';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';

export type StoreRuntime = Atom.AtomRuntime<KeyValueStore.KeyValueStore>;

export const storeOver = (storage: () => Storage): StoreRuntime =>
  Atom.runtime(
    Layer.unwrap(
      Effect.match(Effect.try(storage), {
        onFailure: () => KeyValueStore.layerMemory,
        onSuccess: (kept) => KeyValueStore.layerStorage(() => kept),
      }),
    ),
  );

export interface KeptJson<A> {
  readonly get: () => A;
  readonly set: (value: A) => void;
}

export const keptJson = <S extends Schema.ConstraintCodec<unknown, unknown>>(
  store: StoreRuntime,
  key: string,
  schema: S,
  defaultValue: () => S['Type'],
): KeptJson<S['Type']> => {
  const kept = Atom.kvs({ runtime: store, key, schema, defaultValue, mode: 'sync' });
  const registry = AtomRegistry.make();
  registry.mount(kept);
  return {
    get: () => registry.get(kept),
    set: (value) => registry.set(kept, value),
  };
};

export const keptText = (
  store: StoreRuntime,
  key: string,
): Atom.Writable<Option.Option<string>, string> => {
  const read = store.atom(KeyValueStore.KeyValueStore.use((kv) => kv.get(key)));
  const write = store.fn((text: string) =>
    KeyValueStore.KeyValueStore.use((kv) => kv.set(key, text)),
  );
  const kept = Atom.writable(
    (get) => {
      get.mount(write);
      return Option.flatMap(AsyncResult.value(get(read)), Option.fromUndefinedOr);
    },
    (ctx, text: string) => {
      ctx.set(write, text);
      ctx.setSelf(Option.some(text));
    },
  );
  return Atom.withServerValue(kept, () => Option.none<string>());
};
