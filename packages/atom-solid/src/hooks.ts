/* oxlint-disable effect/noAs -- the `mode` option selects the setter's return type at the type level; the implementation sees `mode` only as a runtime value and cannot prove which branch it is in. */
/* oxlint-disable effect/noChainedTypeAssertions -- reaching the registry-private `ensureNode`, exactly as upstream @effect/atom-solid and @effect/atom-react do. */
/* oxlint-disable effect/noThrowStatement -- Solid 2 signals async failure by throwing from a memo, and a rejected promise is produced by throwing; both are the framework's contract. */
/* oxlint-disable effect/noNewPromise -- `useAtomSuspense` must hand Solid a real pending promise, and a served atom's server render waits on one. */
/* oxlint-disable effect/noNullish -- `undefined` is Solid's own uninitialised-signal value and the registry's own optional-option encoding. */
/* oxlint-disable effect/noUnknownParameters -- a served atom's encoded value is its own schema's, opaque to this binding (`Atom.serializable` types it so), and any atom's value may be an `AsyncResult` still reading. */

import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import type * as Exit from 'effect/Exit';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import * as Schema from 'effect/Schema';
import type { Accessor } from 'solid-js';
import { isServer } from '@solidjs/web';
import { createMemo, createRenderEffect, createSignal, isHydrating, untrack } from 'solid-js';

import { useRegistry } from './registry-context.js';

interface RegistryInternals {
  readonly ensureNode: <A>(atom: Atom.Atom<A>) => { readonly setValue: (value: A) => void };
}

const seedInitialValue = <A>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<A>,
  value: A,
): void => {
  (registry as unknown as RegistryInternals).ensureNode(atom).setValue(value);
};

export const useAtomValue = <A>(atom: () => Atom.Atom<A>): Accessor<A> => {
  const registry = useRegistry();
  const source = untrack(atom);
  if (Atom.isSerializable(source)) return createServedAccessor(registry, atom, source);
  return serverAware(registry, atom, source, () => createLiveAccessor(registry, atom));
};

const constImmediate = { immediate: true };

const constOwnedWrite = { ownedWrite: true };

interface Bridge<A> {
  readonly publish: (value: A) => void;
  readonly accessor: Accessor<A>;
}

const createBridge = <A>(): Bridge<A> => {
  let current: A | undefined;
  let seeded = false;
  const [version, setVersion] = createSignal(0, constOwnedWrite);
  return {
    publish: (value) => {
      current = value;
      if (seeded && !isServer) setVersion((n) => n + 1);
      seeded = true;
    },
    accessor: () => {
      version();
      return current as A;
    },
  };
};

function createLiveAccessor<A>(
  registry: AtomRegistry.AtomRegistry,
  atom: () => Atom.Atom<A>,
): Accessor<A> {
  const bridge = createBridge<A>();
  createRenderEffect(atom, (current) =>
    registry.subscribe(current, bridge.publish, constImmediate),
  );
  return bridge.accessor;
}

const serverAware = <A>(
  registry: AtomRegistry.AtomRegistry,
  atom: () => Atom.Atom<A>,
  source: Atom.Atom<A>,
  live: () => Accessor<A>,
): Accessor<A> => {
  if (!(Atom.ServerValueTypeId in source)) return live();
  if (!isServer && !isHydrating()) return live();
  const loadingValue = Atom.getServerValue(source, registry);
  if (isServer) {
    createRenderEffect(atom, noop);
    return createMemo(() => loadingValue, { ssrSource: 'client', loadingValue });
  }
  const read = live();
  return createMemo(() => read(), { ssrSource: 'client', loadingValue });
};

const UNSERVED: unique symbol = Symbol('@manna/atom-solid/unserved');

const isReading = (value: unknown): boolean =>
  AsyncResult.isAsyncResult(value) && (AsyncResult.isInitial(value) || value.waiting);

const settledOn = <A>(registry: AtomRegistry.AtomRegistry, atom: Atom.Atom<A>): Promise<A> =>
  new Promise((done) => {
    let settled = false;
    let stop: (() => void) | undefined;
    const take = (value: A): void => {
      if (settled || isReading(value)) return;
      settled = true;
      stop?.();
      done(value);
    };
    stop = registry.subscribe(atom, take, constImmediate);
    if (settled) stop();
  });

const lastDecoded = <A>(decode: (encoded: unknown) => A): ((encoded: unknown) => A) => {
  let last: { readonly encoded: unknown; readonly value: A } | undefined;
  return (encoded) => {
    if (last === undefined || last.encoded !== encoded) last = { encoded, value: decode(encoded) };
    return last.value;
  };
};

const noop = (): void => {};

function createServedAccessor<A>(
  registry: AtomRegistry.AtomRegistry,
  atom: () => Atom.Atom<A>,
  source: Atom.Atom<A> & Atom.Serializable<Schema.ConstraintCodec<A, unknown>>,
): Accessor<A> {
  const codec = source[Atom.SerializableTypeId];
  const readJson = Schema.decodeUnknownSync(Schema.Json);
  const decoded = lastDecoded<A>((encoded) => codec.decode(readJson(encoded)));
  if (isServer) {
    const carrier = createMemo(
      () => settledOn(registry, atom()).then((value): unknown => codec.encode(value)),
      { ssrSource: 'server' },
    );
    createRenderEffect(atom, noop);
    return () => {
      const now = registry.get(untrack(atom));
      if (isReading(now)) return decoded(carrier());
      return now;
    };
  }
  const bridge = createBridge<A>();
  let adopting = true;
  let live = false;
  const carrier = createMemo((): unknown => UNSERVED, { ssrSource: 'server' });
  createRenderEffect(
    () => [atom(), carrier()] as const,
    ([current, served]) => {
      if (adopting && served !== UNSERVED) seedInitialValue(registry, current, decoded(served));
      adopting = false;
      const stop = registry.subscribe(current, bridge.publish, constImmediate);
      live = true;
      return stop;
    },
  );
  return () => {
    if (live) return bridge.accessor();
    return decoded(carrier());
  };
}

function mountAtom<A>(registry: AtomRegistry.AtomRegistry, atom: () => Atom.Atom<A>): void {
  createRenderEffect(atom, (current) => {
    if (isServer && Atom.ServerValueTypeId in current) return undefined;
    return registry.mount(current);
  });
}

type AtomSetter<R, W, Mode extends SetterMode> = 'promiseExit' extends Mode
  ? (
      value: W,
    ) => Promise<Exit.Exit<AsyncResult.AsyncResult.Success<R>, AsyncResult.AsyncResult.Failure<R>>>
  : (value: W) => void;

type SetterMode = 'value' | 'promiseExit';

interface SetterOptions<R, Mode extends SetterMode> {
  readonly mode?:
    | ([R] extends [AsyncResult.AsyncResult<unknown, unknown>] ? Mode : 'value')
    | undefined;
}

const untrackedMemo = <A>(atom: () => A): (() => A) => {
  const memo = createMemo(atom);
  return () => untrack(memo);
};

function setAtom<R, W, Mode extends SetterMode>(
  registry: AtomRegistry.AtomRegistry,
  atom: () => Atom.Writable<R, W>,
  options?: SetterOptions<R, Mode>,
): AtomSetter<R, W, Mode> {
  const memo = untrackedMemo(atom);
  if (options?.mode === 'promiseExit') {
    const write = (
      value: W,
    ): Promise<
      Exit.Exit<AsyncResult.AsyncResult.Success<R>, AsyncResult.AsyncResult.Failure<R>>
    > => {
      registry.set(memo(), value);
      return Effect.runPromiseExit(
        AtomRegistry.getResult(registry, asAsyncResultAtom(memo()), { suspendOnWaiting: true }),
      );
    };
    return write as AtomSetter<R, W, Mode>;
  }
  const write = (value: W): void => {
    registry.set(memo(), value);
  };
  return write as AtomSetter<R, W, Mode>;
}

const asAsyncResultAtom = <R>(
  atom: Atom.Atom<R>,
): Atom.Atom<
  AsyncResult.AsyncResult<AsyncResult.AsyncResult.Success<R>, AsyncResult.AsyncResult.Failure<R>>
> =>
  atom as Atom.Atom<
    AsyncResult.AsyncResult<AsyncResult.AsyncResult.Success<R>, AsyncResult.AsyncResult.Failure<R>>
  >;

export const useAtomSet = <R, W, Mode extends SetterMode = never>(
  atom: () => Atom.Writable<R, W>,
  options?: SetterOptions<R, Mode>,
): AtomSetter<R, W, Mode> => {
  const registry = useRegistry();
  mountAtom(registry, atom);
  return setAtom(registry, atom, options);
};

export const useAtomRefresh = <A>(atom: () => Atom.Atom<A>): (() => void) => {
  const registry = useRegistry();
  mountAtom(registry, atom);
  const memo = untrackedMemo(atom);
  return () => registry.refresh(memo());
};

const constUnresolvedPromise = new Promise<never>(() => {});

export const useAtomSuspense = <A, E>(
  atom: () => Atom.Atom<AsyncResult.AsyncResult<A, E>>,
): Accessor<A> => {
  const result = useAtomValue(atom);
  return createMemo(() => {
    const current = result();
    if (AsyncResult.isInitial(current)) return constUnresolvedPromise;
    if (AsyncResult.isSuccess(current)) return current.value;
    throw Cause.squash(current.cause);
  });
};
