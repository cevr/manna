/* oxlint-disable effect/noThrowStatement -- the stand-in is a browser's own storage getter, which throws `SecurityError` when the page may not touch its storage. */

/**
 * The settings module loads where the page may not touch its storage: a
 * browser that blocks site data, or a sandboxed frame, throws `SecurityError`
 * from the `localStorage` getter itself. The store then cannot open, and the
 * settings live in memory, as they do on the web's server.
 */

import { Effect } from 'effect';
import { expect, it } from 'effect-bun-test';

/** The settings module loaded afresh: its own copy, apart from any other test's import. */
const AFRESH = './store.ts?storage-denied';
const loadStoreAfresh = (): Promise<object> => import(AFRESH);

/** `localStorage` as a browser that denies the page its storage has it, for the scope's life. */
const storageDenied = Effect.acquireRelease(
  Effect.sync(() => {
    const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Access is denied for this document.', 'SecurityError');
      },
    });
    return before;
  }),
  (before) =>
    Effect.sync(() => {
      if (before) Object.defineProperty(globalThis, 'localStorage', before);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }),
);

it.scoped('the settings module loads in a browser whose storage access is denied', () =>
  Effect.gen(function* () {
    yield* storageDenied;
    const loaded = yield* Effect.promise(() =>
      loadStoreAfresh().then(
        (store) => ('settings' in store && 'loaded') || 'no settings',
        (error: unknown) => `threw ${String(error)}`,
      ),
    );
    expect(loaded).toBe('loaded');
  }),
);
