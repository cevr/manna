/* oxlint-disable effect/noNullish -- `history.pushState` takes a title argument the platform ignores; `''` is its documented value, and `history.state` is `any`. */

import { Effect, Layer, Option, Schema, SubscriptionRef } from 'effect';

import { makeEntryKeys } from './entry-key.js';
import { Location, parseHref, relativeHref, type Entry } from './location.js';

interface BrowserOptions {
  readonly scrollRestoration?: ScrollRestoration;
}

const EntryState = Schema.Struct({ key: Schema.String });
const decodeEntryState = Schema.decodeUnknownOption(EntryState);

const here = (): string => relativeHref(parseHref(window.location.href));

const keyOf = (state: Option.Option<typeof EntryState.Type>, nextKey: Effect.Effect<string>) =>
  Option.match(state, { onNone: () => nextKey, onSome: (entry) => Effect.succeed(entry.key) });

export const layerBrowser = (options: BrowserOptions = {}): Layer.Layer<Location> =>
  Layer.effect(
    Location,
    Effect.gen(function* () {
      const nextKey = yield* makeEntryKeys;
      if (options.scrollRestoration !== undefined) {
        window.history.scrollRestoration = options.scrollRestoration;
      }
      const loaded = decodeEntryState(window.history.state);
      const key = yield* keyOf(loaded, nextKey);
      if (Option.isNone(loaded)) window.history.replaceState({ key }, '', window.location.href);
      const current = yield* SubscriptionRef.make<Entry>({ href: here(), key, navigation: 'load' });

      const context = yield* Effect.context<never>();
      const onPopState = (event: PopStateEvent): void => {
        const traversal = Effect.gen(function* () {
          const entryKey = yield* keyOf(decodeEntryState(event.state), nextKey);
          yield* SubscriptionRef.set<Entry>(current, {
            href: here(),
            key: entryKey,
            navigation: 'traverse',
          });
        });
        Effect.runSyncWith(context)(traversal);
      };
      yield* Effect.acquireRelease(
        Effect.sync(() => window.addEventListener('popstate', onPopState)),
        () => Effect.sync(() => window.removeEventListener('popstate', onPopState)),
      );

      return Location.of({
        current: SubscriptionRef.get(current),
        changes: SubscriptionRef.changes(current),
        push: Effect.fn('Location.browser.push')(function* (to: string) {
          const entryKey = yield* nextKey;
          window.history.pushState({ key: entryKey }, '', to);
          yield* SubscriptionRef.set<Entry>(current, {
            href: here(),
            key: entryKey,
            navigation: 'push',
          });
        }),
        replace: Effect.fn('Location.browser.replace')(function* (to: string) {
          const { key: entryKey } = yield* SubscriptionRef.get(current);
          window.history.replaceState({ key: entryKey }, '', to);
          yield* SubscriptionRef.set<Entry>(current, {
            href: here(),
            key: entryKey,
            navigation: 'replace',
          });
        }),
        back: Effect.sync(() => window.history.back()),
      });
    }),
  );
