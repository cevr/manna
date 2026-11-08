/* oxlint-disable effect/noNullish -- React Native names no scheme as null, and a host's hook may answer undefined. */

/**
 * The reader's appearance: System, Light or Dark, System by default, kept
 * in the app's key-value store under `heartseed/appearance`. It is read
 * once, at the launch of the app's layer, and never asked: a reader who
 * never chooses follows the phone. A choice shows at once and is written
 * after, one write at a time, so the store ends at the last choice whatever
 * order the writes settle in; a refused write is logged and the choice
 * shown stays the one made, for this launch.
 */

import { Context, Effect, Layer, MutableRef, PubSub, Semaphore, Stream } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import type { Scheme } from './theme';

/** The store key of the reader's appearance; its text is `system`, `light` or `dark`. */
export const APPEARANCE_KEY = 'heartseed/appearance';

/** The reader's appearances, in the order About offers them. */
export const APPEARANCES = ['system', 'light', 'dark'] as const;

/** One of the reader's appearances. */
export type Choice = (typeof APPEARANCES)[number];

/** The views a held subscriber of `changes` keeps: past it, its oldest view slides out, so it always reaches the latest. */
const WINDOW = 16;

/** The appearance a stored text names: the text itself when it is exactly `system`, `light` or `dark`; System for a missing key and any other text. */
export const appearanceOf = (stored: string | undefined): Choice =>
  APPEARANCES.find((choice) => choice === stored) ?? 'system';

/** The scheme the screens show under `choice`: Light and Dark their own, System dark when the system names `dark` and light for anything else. */
export const schemeOf = (choice: Choice, system: string | null | undefined): Scheme => {
  if (choice !== 'system') return choice;
  if (system === 'dark') return 'dark';
  return 'light';
};

/** The reader's appearance, as About shows it and the root paints it. */
export class Appearance extends Context.Service<
  Appearance,
  {
    readonly view: Effect.Effect<Choice>;
    readonly changes: Stream.Stream<Choice>;
    readonly choose: (choice: Choice) => Effect.Effect<void>;
  }
>()('heartseed/appearance/Appearance') {}

/** The stored appearance (`appearanceOf`); a failed read is logged and reads as System. It writes nothing. */
const readChoice = (store: KeyValueStore.KeyValueStore) =>
  store.get(APPEARANCE_KEY).pipe(
    Effect.map(appearanceOf),
    Effect.catchTag('KeyValueStoreError', (error) =>
      Effect.logWarning('appearance.store.failed').pipe(
        Effect.annotateLogs({ method: 'get', key: APPEARANCE_KEY, cause: error.message }),
        Effect.as<Choice>('system'),
      ),
    ),
  );

/** Writes the appearance; a failed write is logged, and the view keeps the choice made. */
const writeChoice = (store: KeyValueStore.KeyValueStore, choice: Choice) =>
  store
    .set(APPEARANCE_KEY, choice)
    .pipe(
      Effect.catchTag('KeyValueStoreError', (error) =>
        Effect.logWarning('appearance.store.failed').pipe(
          Effect.annotateLogs({ method: 'set', key: APPEARANCE_KEY, cause: error.message }),
        ),
      ),
    );

export const layer: Layer.Layer<Appearance, never, KeyValueStore.KeyValueStore> = Layer.effect(
  Appearance,
  Effect.gen(function* () {
    const store = yield* KeyValueStore.KeyValueStore;
    const state = MutableRef.make<Choice>(yield* readChoice(store));
    const views = yield* PubSub.sliding<Choice>({ capacity: WINDOW, replay: 1 });
    const writes = yield* Semaphore.make(1);

    /** Shows `choice` at once: the sliding strategy drops a held subscriber's oldest view and never suspends. */
    const show = (choice: Choice) =>
      Effect.andThen(
        Effect.sync(() => MutableRef.set(state, choice)),
        PubSub.publish(views, choice),
      );
    yield* PubSub.publish(views, MutableRef.get(state));

    /** Writes the appearance shown now, one write at a time: the last write to start begins after every choice's show, so the store ends at the last choice. */
    const persist = writes.withPermit(
      Effect.suspend(() => writeChoice(store, MutableRef.get(state))),
    );

    return Appearance.of({
      view: Effect.sync(() => MutableRef.get(state)),
      changes: Stream.fromPubSub(views),
      choose: Effect.fn('Appearance.choose')(function* (choice: Choice) {
        yield* show(choice);
        yield* persist;
      }),
    });
  }),
);
