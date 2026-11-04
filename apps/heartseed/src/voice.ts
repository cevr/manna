/**
 * The voice: it reads one verse aloud through a `VoiceSource` (on iOS a
 * thin native module over AVSpeechSynthesizer), lights each source word as
 * the source reports its spoken range, and obeys an off switch kept in the
 * app's key-value store. The rules live in `voice/reading.ts`, a pure
 * reducer; this service runs it: each command changes the view at its call,
 * then makes the one source call the reducer asks for, and each event the
 * source sends applies at once, inside its listener, and calls nothing.
 */

import {
  Context,
  Effect,
  Fiber,
  Layer,
  Match,
  MutableRef,
  Option,
  PubSub,
  Schema,
  Semaphore,
  Stream,
} from 'effect';
import type { Scope } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import {
  initial,
  isActive,
  step,
  type Call,
  type Input,
  type Reading,
  type VoiceEvent,
  type VoiceView,
} from './voice/reading';

export type { VoiceEvent, VoiceView } from './voice/reading';

/** A voice the device offers, as AVSpeechSynthesisVoice reports it; quality 1 default, 2 enhanced, 3 premium. */
export interface VoiceInfo {
  readonly id: string;
  readonly language: string;
  readonly name: string;
  readonly quality: number;
  readonly novelty: boolean;
  readonly personal: boolean;
}

/** The source could not speak: no native module here, or the module refused. */
export class VoiceUnavailable extends Schema.TaggedError<VoiceUnavailable>()('VoiceUnavailable', {
  reason: Schema.String,
}) {}

/** The native speech synthesizer, as the service drives it. */
export class VoiceSource extends Context.Service<
  VoiceSource,
  {
    readonly voices: Effect.Effect<readonly VoiceInfo[]>;
    readonly speak: (
      utterance: number,
      text: string,
      voice: string,
    ) => Effect.Effect<void, VoiceUnavailable>;
    readonly pause: Effect.Effect<void>;
    readonly resume: Effect.Effect<void>;
    readonly stop: Effect.Effect<void>;
    readonly subscribe: (
      listener: (event: VoiceEvent) => void,
    ) => Effect.Effect<void, never, Scope.Scope>;
  }
>()('heartseed/voice/VoiceSource') {}

/** The voice the app reads with, and what a screen shows of it. */
export class Voice extends Context.Service<
  Voice,
  {
    readonly read: (verse: string) => Effect.Effect<void>;
    readonly pause: Effect.Effect<void>;
    readonly resume: Effect.Effect<void>;
    readonly stop: Effect.Effect<void>;
    readonly setEnabled: (on: boolean) => Effect.Effect<void>;
    readonly view: Effect.Effect<VoiceView>;
    readonly changes: Stream.Stream<VoiceView>;
  }
>()('heartseed/voice/Voice') {}

/** The store key of the off switch; its text is the JSON `true` or `false`. */
export const ENABLED_KEY = 'heartseed/voice/enabled';

/** The views a held subscriber of `changes` keeps: past it, its oldest view slides out, so it always reaches the latest. */
const WINDOW = 16;

const eligible = (voice: VoiceInfo) =>
  (voice.language === 'en' || voice.language.startsWith('en-')) &&
  !voice.novelty &&
  !voice.personal;

/** Whether `a` reads better than `b`: higher quality, then en-US, then the lower id. */
const better = (a: VoiceInfo, b: VoiceInfo) => {
  if (a.quality !== b.quality) return a.quality > b.quality;
  const usA = a.language === 'en-US';
  const usB = b.language === 'en-US';
  if (usA !== usB) return usA;
  return a.id < b.id;
};

/** The voice a reading asks for: an English voice that is neither novelty nor personal, the best by `better`; none when no voice is eligible. */
export const bestVoice = (voices: ReadonlyArray<VoiceInfo>): Option.Option<VoiceInfo> =>
  voices.filter(eligible).reduce<Option.Option<VoiceInfo>>(
    (best, voice) =>
      Option.match(best, {
        onNone: () => Option.some(voice),
        onSome: (held) => {
          if (better(voice, held)) return Option.some(voice);
          return best;
        },
      }),
    Option.none(),
  );

/** The stored switch: off only for the text `false`; a missing key, any other text or a failed read is on. */
const readEnabled = (store: KeyValueStore.KeyValueStore) =>
  store.get(ENABLED_KEY).pipe(
    Effect.map((raw) => raw !== 'false'),
    Effect.catchTag('KeyValueStoreError', (error) =>
      Effect.logWarning('voice.store.failed').pipe(
        Effect.annotateLogs({ method: 'get', key: ENABLED_KEY, cause: error.message }),
        Effect.as(true),
      ),
    ),
  );

/** Writes the switch; a failed write is logged, and the view follows the call regardless. */
const writeEnabled = (store: KeyValueStore.KeyValueStore, on: boolean) =>
  store
    .set(ENABLED_KEY, String(on))
    .pipe(
      Effect.catchTag('KeyValueStoreError', (error) =>
        Effect.logWarning('voice.store.failed').pipe(
          Effect.annotateLogs({ method: 'set', key: ENABLED_KEY, cause: error.message }),
        ),
      ),
    );

export const layer: Layer.Layer<Voice, never, VoiceSource | KeyValueStore.KeyValueStore> =
  Layer.effect(
    Voice,
    Effect.gen(function* () {
      const source = yield* VoiceSource;
      const store = yield* KeyValueStore.KeyValueStore;
      const enabled = yield* readEnabled(store);
      const voice = Option.match(bestVoice(yield* source.voices), {
        onNone: () => '',
        onSome: (chosen) => chosen.id,
      });
      const state = MutableRef.make<Reading>(initial(enabled));
      const views = yield* PubSub.sliding<VoiceView>({ capacity: WINDOW, replay: 1 });
      const writes = yield* Semaphore.make(1);
      const runSync = Effect.runSyncWith(yield* Effect.context<never>());

      /** Publishes a view at once: the sliding strategy drops a held subscriber's oldest view and never suspends. */
      const publish = (view: VoiceView) => {
        runSync(PubSub.publish(views, view));
      };
      publish(state.current.view);

      /** Applies one input at once, publishes a changed view, and answers the call it asks for. */
      const dispatch = (input: Input): Option.Option<Call> => {
        const before = MutableRef.get(state);
        const next = step(before, input);
        MutableRef.set(state, next.reading);
        if (next.reading.view !== before.view) publish(next.reading.view);
        return next.call;
      };

      /** A speak whose failure ends its own reading, if that reading is still the current one. */
      const speak = (utterance: number, text: string) =>
        source
          .speak(utterance, text, voice)
          .pipe(
            Effect.catchTag('VoiceUnavailable', (error) =>
              Effect.logWarning('voice.speak.failed').pipe(
                Effect.annotateLogs({ utterance, reason: error.reason }),
                Effect.andThen(Effect.sync(() => dispatch({ _tag: 'Failed', utterance }))),
              ),
            ),
          );

      const perform: (call: Call) => Effect.Effect<void> = Match.type<Call>().pipe(
        Match.tagsExhaustive({
          Speak: ({ utterance, text }) => speak(utterance, text),
          Pause: () => source.pause,
          Resume: () => source.resume,
          Stop: () => source.stop,
        }),
      );

      const run = (input: Input) =>
        Effect.suspend(() =>
          Option.match(dispatch(input), { onNone: () => Effect.void, onSome: perform }),
        );

      /**
       * Writes the switch the view holds now, one write at a time: the last
       * write to start begins after every call's view change, so the store
       * ends at the last call's switch whatever order the source's stops
       * and the store's writes settle in.
       */
      const persist = writes.withPermit(
        Effect.suspend(() => writeEnabled(store, MutableRef.get(state).view.enabled)),
      );

      yield* source.subscribe((event) => {
        dispatch({ _tag: 'Event', event });
      });
      yield* Effect.addFinalizer(() =>
        Effect.suspend(() => {
          if (isActive(MutableRef.get(state).view)) return source.stop;
          return Effect.void;
        }),
      );

      return Voice.of({
        read: Effect.fn('Voice.read')(function* (verse: string) {
          yield* run({ _tag: 'Read', verse });
        }),
        pause: run({ _tag: 'Pause' }),
        resume: run({ _tag: 'Resume' }),
        stop: run({ _tag: 'Stop' }),
        setEnabled: Effect.fn('Voice.setEnabled')(function* (on: boolean) {
          const call = yield* Effect.forkChild(run({ _tag: 'SetEnabled', on }), {
            startImmediately: true,
          });
          yield* persist;
          yield* Fiber.join(call);
        }),
        view: Effect.sync(() => MutableRef.get(state).view),
        changes: Stream.fromPubSub(views),
      });
    }),
  );
