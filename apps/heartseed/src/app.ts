/**
 * The app's one runtime for the reader's screens: one `Dictation` over the
 * source this build hears, Say it over it, the soft tick, the garden, which
 * keeps each of Say it's kept recalls in the app's store on the device and
 * sounds the growth chime, and the voice routed between the system voice
 * and the natural voice (`src/natural/route.ts`), whose choice (Off, Her or
 * Him) and the natural voice's fuse live in the same store, the reader's
 * passages, kept there too, the collections taught (`TAUGHT`), and the
 * daily session over the garden, the passages and the taught collections'
 * verses, whose minutes live there too: its plan is made at the first show
 * of home or Today, each Minutes tap, each return to the foreground
 * (`src/foreground.ts`, whose one subscription also reads home's greeting
 * again) and each add or remove of a passage, and the
 * reader's appearance (System, Light or Dark), kept there too. Every screen that
 * hears the reader takes Dictation from here, so two services never share
 * the module's one channel; the first minute's hear phase and Today's Listen
 * on a new piece are the two that read aloud. A hold on the words of a
 * reading under way pauses it with one soft tick (`holdReading`), its release
 * reads on from the word held (`seekTo`), and its cancel resumes (`letGo`).
 *
 * The source is the module's replay of a scripted recital only in a
 * development build (`__DEV__`) on the simulator, which can never listen;
 * every other build hears the microphone. A device-info read that fails or
 * hangs counts as a device. The runtime is not kept alive: when the root
 * leaves, its scope closes, Dictation cancels a recital under way, the
 * voice stops a reading under way and the foreground's subscription ends.
 */

import { Clock, Duration, Effect, Layer, Option, Stream, SubscriptionRef } from 'effect';
import type * as KeyValueStore from 'effect/persistence/KeyValueStore';
import * as Atom from 'effect/reactivity/Atom';
import { One } from 'one';
import passage from 'virtual:heartseed-passage';

import {
  Appearance,
  layer as appearanceLayer,
  type Choice as AppearanceChoice,
} from './appearance';
import { layer as dictationLayer, type DictationSource } from './dictation';
import { recite } from './dictation/script';
import { microphoneSource, replaySource } from './dictation/source';
import { type Foreground, Returns, wakeLayer } from './foreground';
import { foregroundSource } from './foreground/source';
import { cueIn, Garden, layer as gardenLayer, type Chime, type GardenView } from './garden';
import { liveChime } from './garden/chime';
import { greetingAt } from './home';
import type { Cue } from './matcher';
import { sourceWords } from './matcher/words';
import { Haptics, layer as sayItLayer, SayIt, TODAY, type Grade, type Recital } from './sayit';
import { liveHaptics } from './sayit/live';
import { SIMULATOR_PLAN, sourceKind } from './sayit/source';
import type { Passage } from './passage';
import { layer as passagesLayer, Passages, type Range } from './passages';
import { TAUGHT, type Collection } from './promises';
import { collectionsOf, layer as taughtLayer, Taught } from './promises/taught';
import type { Item, Minutes, TextPiece } from './session';
import { layer as sessionLayer, Session } from './session/service';
import { store } from './store';
import { Voice, type VoiceSource, type VoiceView } from './voice';
import type { NaturalModule } from './natural/module';
import { naturalVoices, tapVoice } from './natural/route';
import { Natural } from './natural/service';
import { naturalModule } from './natural/source';
import { isActive } from './voice/reading';
import { voiceSource } from './voice/source';

const dev = typeof __DEV__ !== 'undefined' && __DEV__;

/** How long the device-info read may take before the app counts itself on a device. */
const DEVICE_INFO_WAIT = Duration.seconds(2);

/** Whether the app runs on the simulator, by One's device info. */
const onSimulator = Effect.tryPromise(() => One.Device.getInfo()).pipe(
  Effect.map((info) => info.isSimulator),
  Effect.timeout(DEVICE_INFO_WAIT),
  Effect.orElseSucceed(() => false),
);

/** The source this build hears. */
export const appSource: Layer.Layer<DictationSource> = Layer.unwrap(
  Effect.gen(function* () {
    const simulator = yield* onSimulator;
    const kind = sourceKind({ dev, simulator });
    yield* Effect.logInfo('sayit.source').pipe(Effect.annotateLogs({ kind }));
    if (kind === 'replay') return replaySource(recite(passage.text, SIMULATOR_PLAN));
    return microphoneSource;
  }),
);

/** The app's own pieces, before the reader's passages: the promise alone, its own group. */
const PIECES: readonly TextPiece[] = [
  {
    reference: passage.reference,
    text: passage.text,
    words: sourceWords(passage.text).length,
    group: passage.reference,
  },
];

/** The app's services over its parts: Say it, the one Dictation it runs over, the garden over `store` its recalls grow, which sounds `chime`, the reader's passages in the same `store`, the collections of `promises` taught (none when left out), the session over the garden, `pieces` (the app's own, the promise alone, when none are given), then the passages' verses, then the taught collections' verses, its minutes in the same `store`, woken at each return to the foreground `foreground` reports (the host's own when none is given), the voice routed between the system voice `voice` and the natural voice over `natural` (the platform's module when none is given: on the web and in the tests the one that refuses, so the system voice reads), its choice and the natural voice's fuse in the same `store`, the development base read only when `dev`, and the reader's appearance, read first, in the same `store`. */
export const appLayer = (parts: {
  readonly source: Layer.Layer<DictationSource>;
  readonly haptics: Layer.Layer<Haptics>;
  readonly store: Layer.Layer<KeyValueStore.KeyValueStore>;
  readonly chime: Layer.Layer<Chime>;
  readonly voice: Layer.Layer<VoiceSource>;
  readonly natural?: Layer.Layer<NaturalModule>;
  readonly dev?: boolean;
  readonly pieces?: readonly TextPiece[];
  readonly foreground?: Layer.Layer<Foreground>;
  readonly promises?: readonly string[];
}) =>
  Layer.merge(
    sayItLayer(passage),
    wakeLayer.pipe(Layer.provide(parts.foreground ?? foregroundSource)),
  ).pipe(
    Layer.provideMerge(
      sessionLayer(parts.pieces ?? PIECES, collectionsOf(parts.promises ?? [])).pipe(
        Layer.provide(parts.store),
      ),
    ),
    Layer.provideMerge(taughtLayer(parts.promises ?? [])),
    Layer.provideMerge(dictationLayer.pipe(Layer.provide(parts.source))),
    Layer.provideMerge(gardenLayer.pipe(Layer.provide(Layer.merge(parts.store, parts.chime)))),
    Layer.provideMerge(passagesLayer.pipe(Layer.provide(parts.store))),
    Layer.provideMerge(
      naturalVoices({
        system: parts.voice,
        module: parts.natural ?? naturalModule,
        dev: parts.dev ?? false,
      }).pipe(Layer.provide(parts.store)),
    ),
    Layer.provideMerge(appearanceLayer.pipe(Layer.provide(parts.store))),
    Layer.provideMerge(parts.haptics),
  );

export const runtime = Atom.runtime(
  appLayer({
    source: appSource,
    haptics: liveHaptics,
    store,
    chime: liveChime,
    voice: voiceSource,
    natural: naturalModule,
    dev,
    pieces: PIECES,
    promises: TAUGHT,
  }),
);

/** The collections the app's layer teaches, for the field's taught rows. */
export const taughtView = runtime.atom(Effect.map(Taught, (taught) => taught.collections));

/** What a screen shows of Say it. */
export const sayItView = runtime.atom(Stream.unwrap(Effect.map(SayIt, (sayIt) => sayIt.changes)));

/** What the garden knows, of which Today shows the passage's plant. */
export const gardenView = runtime.atom(
  Stream.unwrap(Effect.map(Garden, (garden) => garden.changes)),
);

/** What the hear phase and Today show of the voice: its choice, and the reading under way or the last one's ending. */
export const voiceView = runtime.atom(Stream.unwrap(Effect.map(Voice, (voice) => voice.changes)));

/** The reader's appearance, read once at the layer's launch: what the root paints and About's radios check. */
export const appearanceView = runtime.atom(
  Stream.unwrap(Effect.map(Appearance, (appearance) => appearance.changes)),
);

/** A tap on one of About's appearance radios: it shows at once, then is stored by the appearance's own write. */
export const chooseAppearance = runtime.fn(
  (choice: AppearanceChoice) =>
    Effect.flatMap(Appearance, (appearance) => appearance.choose(choice)),
  { concurrent: true },
);

/** What Today shows of the session: the minutes chosen, and the plan once it is made. */
export const sessionView = runtime.atom(
  Stream.unwrap(Effect.map(Session, (session) => session.changes)),
);

/** Today shown: the session's plan is made, once in the launch, when the garden is read. */
export const beginSession = runtime.fn(() => Effect.flatMap(Session, (session) => session.begin), {
  concurrent: true,
});

/** A Minutes tap: the choice shows at once, the plan is made again, and the choice is stored. */
export const chooseMinutes = runtime.fn(
  (minutes: Minutes) => Effect.flatMap(Session, (session) => session.choose(minutes)),
  { concurrent: true },
);

/** A tap on the Voice pill (`tapVoice`): the natural voice hears the next choice in the cycle Off, Her, Him first (its fuse and line clear, and its download may start), then the voice takes it, stored by the voice's own write; the view changes at the call, so two quick taps cycle twice. */
export const cycleVoice = runtime.fn(() => tapVoice, { concurrent: true });

/** What the natural voice's status line under the Voice pill shows: its download, its fuse and whether the crash line is owed, under the choice. */
export const naturalView = runtime.atom(
  Stream.unwrap(Effect.map(Natural, (natural) => natural.changes)),
);

/** The status line's `Try again`: the natural voice's failed download or load runs again. */
export const retryNatural = runtime.fn(() => Effect.flatMap(Natural, (natural) => natural.retry), {
  concurrent: true,
});

/** The cue a piece of Today's is said under next: the ladder's in a read garden, none in an unread one, which claims no stage. */
const todayCue = (view: GardenView, reference: string): Cue => {
  if (view._tag === 'Unread') return TODAY.cue;
  return cueIn(view, reference);
};

/**
 * Today's Say it of `piece`: a kept recital under the cue the garden gives
 * the piece once every keep handed to it before the press has landed or
 * failed (a grade changed just before is said after), or the finish of the
 * one under way. A reading of Listen's under way stops first, so the voice
 * never reads into the microphone. In a run, `item` is the plan's item
 * shown, held in the same step as the recital starts, so it stays shown
 * until its `Next`.
 */
export const pressToday = (piece: Passage, item: Option.Option<Item> = Option.none()) =>
  Effect.gen(function* () {
    const sayIt = yield* SayIt;
    const garden = yield* Garden;
    const session = yield* Session;
    const voice = yield* Voice;
    yield* voice.stop;
    const view = yield* garden.settled;
    if (Option.isSome(item)) yield* session.hold(item.value);
    yield* sayIt.recite({ cue: todayCue(view, piece.reference), keep: TODAY.keep }, piece);
  });

/** A press of Today's button on `piece`, the run's `item` when one is shown. Each command runs to its end, so a second tap never cuts off the first one's recall. */
export const press = runtime.fn(
  (shown: { readonly piece: Passage; readonly item: Option.Option<Item> }) =>
    pressToday(shown.piece, shown.item),
  { concurrent: true },
);

/** An add of `range` to the reader's passages, answered as the passages answer it; once `Added`, a plan made in this launch is made again over the passages now. */
export const addPassage = (range: Range) =>
  Effect.gen(function* () {
    const passages = yield* Passages;
    const session = yield* Session;
    const answer = yield* passages.add(range);
    if (answer === 'Added') yield* session.remake;
    return answer;
  });

/** A remove of the first passage equal to `range`, answered as the passages answer it; once `Removed`, a plan made in this launch is made again without its verses, its plants kept. */
export const removePassage = (range: Range) =>
  Effect.gen(function* () {
    const passages = yield* Passages;
    const session = yield* Session;
    const answer = yield* passages.remove(range);
    if (answer === 'Removed') yield* session.remake;
    return answer;
  });

/** What the field shows of the reader's passages: the list held, or `Unread`, which offers no add and no remove. */
export const passagesView = runtime.atom(
  Stream.unwrap(Effect.map(Passages, (passages) => passages.changes)),
);

/** The chooser's Plant: an add of the range (`addPassage`), answered as the passages answer it. The chooser lets one run at a time, so each answer is its own tap's. */
export const plantPassage = runtime.fn((range: Range) => addPassage(range), { concurrent: true });

/** The field's confirmed Remove: a remove of the range (`removePassage`), answered as the passages answer it. The field lets one run at a time, so each answer is its own tap's. */
export const uprootPassage = runtime.fn((range: Range) => removePassage(range), {
  concurrent: true,
});

/** A tap on Today's Next: the held item is let go. */
export const next = runtime.fn(() => Effect.flatMap(Session, (session) => session.next), {
  concurrent: true,
});

/** A tap on a known promise of When I need…: its verses become the visit Today shows ahead of the plan, each said as a review; the hold stays. */
export const visitPromise = runtime.fn(
  (tap: { readonly collection: Pick<Collection, 'id' | 'title'>; readonly promise: Range }) =>
    Effect.flatMap(Session, (session) => session.visit(tap.collection, tap.promise)),
  { concurrent: true },
);

/** Start here, a tap on a verse of the home: the verse `startOf` starts becomes the visit Today shows ahead of the plan; the hold stays. */
export const startHere = runtime.fn(
  (verse: string) => Effect.flatMap(Session, (session) => session.start(verse)),
  { concurrent: true },
);

/** The home's greeting by the runtime's clock, read when a screen first shows it, again at each later show once none showed it in between, and again at each return to the foreground while one shows it (`Returns`); never in between. */
export const greetingNow = runtime.atom(
  Stream.unwrap(
    Effect.map(Returns, (returns) =>
      Stream.mapEffect(SubscriptionRef.changes(returns), () =>
        Effect.map(Clock.currentTimeMillis, greetingAt),
      ),
    ),
  ),
);

/** A press of the first minute's Say it: a recital of the passage under its cue, kept or not. */
export const sayAs = runtime.fn(
  (how: Recital) => Effect.flatMap(SayIt, (sayIt) => sayIt.recite(how, passage)),
  { concurrent: true },
);

export const peek = runtime.fn(
  (index: number) => Effect.flatMap(SayIt, (sayIt) => sayIt.peek(index)),
  { concurrent: true },
);

export const choose = runtime.fn(
  (grade: Grade) => Effect.flatMap(SayIt, (sayIt) => sayIt.choose(grade)),
  { concurrent: true },
);

/** The hear phase's Listen: the voice reads the passage, unless a reading is under way already (a second tap before the frame that hides Listen reads nothing). */
export const listen = runtime.fn(
  () =>
    Effect.flatMap(Voice, (voice) =>
      Effect.flatMap(voice.view, (view) => {
        if (isActive(view)) return Effect.void;
        return voice.read(passage.text);
      }),
    ),
  { concurrent: true },
);

/** Today's Listen on a new piece: the voice reads `text`, the piece's own, unless a reading is under way already (a second tap before the frame that hides Listen reads nothing). A making of the plan and the field leave the reading alone; Say it, Voice off, its own end and the runtime's close end it. */
export const listenTo = runtime.fn(
  (text: string) =>
    Effect.flatMap(Voice, (voice) =>
      Effect.flatMap(voice.view, (view) => {
        if (isActive(view)) return Effect.void;
        return voice.read(text);
      }),
    ),
  { concurrent: true },
);

/** A seek of the reading view: while a reading is under way, the voice reads its verse on from word `word` (0-based) as a new utterance, the words before it lit; at any other time nothing happens (`Voice.seek`). */
export const seekTo = runtime.fn(
  (word: number) => Effect.flatMap(Voice, (voice) => voice.seek(word)),
  { concurrent: true },
);

/** The start of a hold on the reading view: the voice pauses and one soft tick is felt (`Haptics.tick`). */
export const holdReading = runtime.fn(
  () =>
    Effect.gen(function* () {
      const voice = yield* Voice;
      const haptics = yield* Haptics;
      yield* voice.pause;
      yield* haptics.tick;
    }),
  { concurrent: true },
);

/** A hold on the reading view canceled: the voice plays on from where it paused. */
export const letGo = runtime.fn(() => Effect.flatMap(Voice, (voice) => voice.resume), {
  concurrent: true,
});

/** Whether the voice's view holds a reading under way (reading or paused), for Today, which offers Listen only when none is. */
export const readingAloud = (view: VoiceView): boolean => isActive(view);

/** The hear phase's Next while a reading is under way: the voice stops. */
export const hush = runtime.fn(() => Effect.flatMap(Voice, (voice) => voice.stop), {
  concurrent: true,
});
