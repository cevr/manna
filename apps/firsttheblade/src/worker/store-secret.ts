/**
 * The Worker's secrets, from the account's Cloudflare Secrets Store.
 *
 * Each secret is bound by name: the stack adopts the account's one store
 * (`SecretsStore`, which Alchemy never deletes) and adds a
 * `secrets_store_secret` binding to the Worker, and holds no value. The owner
 * puts each value in the store once (`README.md`, the email list's secrets).
 * A Worker reads a bound secret only inside an event (a request, a queue
 * batch, a Durable Object call), so the reader needs the event's
 * `RuntimeContext`, and `memoSuccess` keeps what it read for the isolate's
 * life.
 */
import { RuntimeContext } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import { Cause, Deferred, Effect, Exit, Option, Redacted, Ref, Schema } from 'effect';

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

type Held<A, E> = Option.Option<Deferred.Deferred<A, E>>;

/**
 * A reader of `read` that reads nothing until its first call, keeps a
 * success, keeps no failure (the next call reads again), and shares one read
 * among the callers that arrive while it is in flight. A caller whose shared
 * read was interrupted with its leader reads again.
 */
export const memoSuccess = <A, E, R>(read: Effect.Effect<A, E, R>) =>
  Effect.map(Ref.make<Held<A, E>>(Option.none()), (state) => {
    const get: Effect.Effect<A, E, R> = Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const fresh = yield* Deferred.make<A, E>();
        const [current, leader] = yield* Ref.modify(
          state,
          (held): readonly [readonly [Deferred.Deferred<A, E>, boolean], Held<A, E>] =>
            Option.match(held, {
              onSome: (inFlight) => [[inFlight, false], held],
              onNone: () => [[fresh, true], Option.some(fresh)],
            }),
        );
        if (leader) {
          const exit = yield* Effect.exit(restore(read));
          if (Exit.isFailure(exit)) yield* Ref.set(state, Option.none());
          yield* Deferred.done(current, exit);
          return yield* exit;
        }
        const exit = yield* Effect.exit(restore(Deferred.await(current)));
        if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)) {
          return yield* restore(Effect.suspend(() => get));
        }
        return yield* exit;
      }),
    );
    return get;
  });

/** The reader of the store secret `name` in a running Worker's env. */
const readerOf = (env: Record<string, StoreSecretBinding>, name: string) =>
  Effect.gen(function* () {
    yield* RuntimeContext;
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
