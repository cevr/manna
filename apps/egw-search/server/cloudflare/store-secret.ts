/**
 * The sync Worker's secrets, from the account's Cloudflare Secrets Store.
 *
 * Each secret is bound by name: the stack adopts the account's one store
 * (`SecretsStore`, which Alchemy never deletes) and adds a
 * `secrets_store_secret` binding to the Worker, and holds no value. The owner
 * puts each value in the store once (`README.md`, Deploy). A Worker reads a
 * bound secret only inside an event (here a Workflow step), so the reader is
 * run there, never as the Worker or its Workflow is built.
 */
import * as Cloudflare from '@alchemy.run/cloudflare';
import { Effect, Option, Redacted, Schema } from 'effect';

/** The account's one Secrets Store, adopted. */
export const SecretsStore = Cloudflare.SecretsStore.Store('Secrets');

/** What a `secrets_store_secret` binding is in a running Worker's env. */
interface StoreSecretBinding {
  readonly get: () => Promise<string>;
}

/** A store secret the Worker could not read: it names the secret, never its value. */
export class StoreSecretUnread extends Schema.TaggedError<StoreSecretUnread>()(
  'StoreSecretUnread',
  { name: Schema.String },
) {
  override get message() {
    return `the Worker could not read the store secret ${this.name}`;
  }
}

/** The reader of the store secret `name` in a running Worker's env. */
const readerOf = (env: Record<string, StoreSecretBinding>, name: string) =>
  Effect.gen(function* () {
    const binding = Option.fromNullishOr(env[name]);
    if (Option.isNone(binding)) return yield* Effect.die(StoreSecretUnread.make({ name }));
    const value = yield* Effect.tryPromise({
      try: () => binding.value.get(),
      catch: () => StoreSecretUnread.make({ name }),
    }).pipe(Effect.orDie);
    return Redacted.make(value);
  });

/**
 * Bind the store's secret `name` to the Worker this runs in, under the same
 * name, and give its reader. The binding is made only while the stack plans
 * and deploys. A read that fails dies naming the secret, never its value.
 */
export const storeSecret = Effect.fn('storeSecret')(function* (name: string) {
  if (!globalThis.__ALCHEMY_RUNTIME__) {
    const store = yield* SecretsStore;
    const host = yield* Cloudflare.Worker;
    yield* host.bind`${name}`({
      bindings: [{ type: 'secrets_store_secret', name, secretName: name, storeId: store.storeId }],
    });
  }
  return yield* Effect.map(Cloudflare.WorkerEnvironment, (env) => readerOf(env, name));
});
