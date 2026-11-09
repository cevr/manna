/**
 * The voice: it reads one verse aloud through a `VoiceSource` (on iOS a
 * thin native module over AVSpeechSynthesizer), lights each source word as
 * the source reports its spoken range, and keeps the reader's choice (Off,
 * Her or Him) in the app's key-value store. A seek speaks the verse from a
 * chosen word as a new utterance, whose ranges light the verse's words past
 * that word's start. The rules live in `voice/reading.ts`, a pure
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
  Scheduler,
  Schema,
  Semaphore,
  Stream,
} from 'effect';
import type { Scope } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import {
  CHOICES,
  initial,
  isActive,
  step,
  type Call,
  type Choice,
  type Input,
  type Reading,
  type VoiceEvent,
  type VoiceView,
} from './voice/reading';

export type { VoiceEvent, VoiceView } from './voice/reading';
export { CHOICES, nextChoice, type Choice } from './voice/reading';

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
    /** While a reading is under way, speaks its verse from word `word` (0-based) as a new utterance, the words before it lit; any other seek does nothing. */
    readonly seek: (word: number) => Effect.Effect<void>;
    readonly pause: Effect.Effect<void>;
    readonly resume: Effect.Effect<void>;
    readonly stop: Effect.Effect<void>;
    readonly choose: (choice: Choice) => Effect.Effect<void>;
    readonly view: Effect.Effect<VoiceView>;
    readonly changes: Stream.Stream<VoiceView>;
  }
>()('heartseed/voice/Voice') {}

/** The store key of the old two-state switch, its text `true` or `false`; read at launch when the choice is not stored, never written. */
export const ENABLED_KEY = 'heartseed/voice/enabled';

/** The store key of the reader's choice; its text is `off`, `her` or `him`. */
export const CHOICE_KEY = 'heartseed/voice/choice';

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

const isChoice = (raw: string): raw is Choice => CHOICES.some((choice) => choice === raw);

/** One key's text, or none when the read failed; the failure is logged. */
const readKey = (store: KeyValueStore.KeyValueStore, key: string) =>
  store.get(key).pipe(
    Effect.map(Option.fromUndefinedOr),
    Effect.catchTag('KeyValueStoreError', (error) =>
      Effect.logWarning('voice.store.failed').pipe(
        Effect.annotateLogs({ method: 'get', key, cause: error.message }),
        Effect.as(Option.none<string>()),
      ),
    ),
  );

/**
 * The stored choice: the choice key's text when it is exactly a choice;
 * otherwise the old switch, Off only for its text `false`, and Her for a
 * missing key, any other text or a failed read. It writes nothing.
 */
const readChoice = (store: KeyValueStore.KeyValueStore) =>
  Effect.gen(function* () {
    const stored = Option.filter(yield* readKey(store, CHOICE_KEY), isChoice);
    if (Option.isSome(stored)) return stored.value;
    const old = yield* readKey(store, ENABLED_KEY);
    if (Option.contains(old, 'false')) return 'off' as const;
    return 'her' as const;
  });

/** Writes the choice; a failed write is logged, and the view follows the call regardless. */
const writeChoice = (store: KeyValueStore.KeyValueStore, choice: Choice) =>
  store
    .set(CHOICE_KEY, choice)
    .pipe(
      Effect.catchTag('KeyValueStoreError', (error) =>
        Effect.logWarning('voice.store.failed').pipe(
          Effect.annotateLogs({ method: 'set', key: CHOICE_KEY, cause: error.message }),
        ),
      ),
    );

export const layer: Layer.Layer<Voice, never, VoiceSource | KeyValueStore.KeyValueStore> =
  Layer.effect(
    Voice,
    Effect.gen(function* () {
      const source = yield* VoiceSource;
      const store = yield* KeyValueStore.KeyValueStore;
      const choice = yield* readChoice(store);
      const voice = Option.match(bestVoice(yield* source.voices), {
        onNone: () => '',
        onSome: (chosen) => chosen.id,
      });
      const state = MutableRef.make<Reading>(initial(choice));
      const views = yield* PubSub.sliding<VoiceView>({ capacity: WINDOW, replay: 1 });
      const writes = yield* Semaphore.make(1);
      const context = yield* Effect.context<never>();
      yield* PubSub.publish(views, state.current.view);

      /**
       * Applies one input, publishes a changed view, and answers the call it
       * asks for. The publish never suspends: the sliding strategy drops a
       * held subscriber's oldest view. It runs as one step: its fiber never
       * yields to the scheduler between the state write and the publish, so
       * a native event's listener, which runs at such a yield, never
       * publishes its newer view before this older one.
       */
      const dispatch = (input: Input): Effect.Effect<Option.Option<Call>> =>
        Effect.gen(function* () {
          const before = MutableRef.get(state);
          const next = step(before, input);
          MutableRef.set(state, next.reading);
          if (next.reading.view !== before.view) yield* PubSub.publish(views, next.reading.view);
          return next.call;
        }).pipe(Effect.provideService(Scheduler.PreventSchedulerYield, true));

      /** A speak whose failure ends its own reading, if that reading is still the current one. */
      const speak = (utterance: number, text: string) =>
        source
          .speak(utterance, text, voice)
          .pipe(
            Effect.catchTag('VoiceUnavailable', (error) =>
              Effect.logWarning('voice.speak.failed').pipe(
                Effect.annotateLogs({ utterance, reason: error.reason }),
                Effect.andThen(Effect.asVoid(dispatch({ _tag: 'Failed', utterance }))),
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
        Effect.flatMap(
          dispatch(input),
          Option.match({ onNone: () => Effect.void, onSome: perform }),
        );

      /**
       * Writes the choice the view holds now, one write at a time: the last
       * write to start begins after every call's view change, so the store
       * ends at the last call's choice whatever order the source's stops
       * and the store's writes settle in.
       */
      const persist = writes.withPermit(
        Effect.suspend(() => writeChoice(store, MutableRef.get(state).view.choice)),
      );

      yield* source.subscribe((event) => {
        // oxlint-disable-next-line no-restricted-properties -- a native listener: the view publishes before the event returns
        Effect.runSyncWith(context)(dispatch({ _tag: 'Event', event }));
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
        seek: Effect.fn('Voice.seek')(function* (word: number) {
          yield* run({ _tag: 'Seek', word });
        }),
        pause: run({ _tag: 'Pause' }),
        resume: run({ _tag: 'Resume' }),
        stop: run({ _tag: 'Stop' }),
        choose: Effect.fn('Voice.choose')(function* (choice: Choice) {
          const call = yield* Effect.forkChild(run({ _tag: 'Choose', choice }), {
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
