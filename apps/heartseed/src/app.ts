/**
 * The app's one runtime for the reader's screens: one `Dictation` over the
 * source this build hears, Say it over it, the soft tick, the garden, which
 * keeps each of Say it's kept recalls in the app's store on the device and
 * sounds the growth chime, and the voice over the source this platform
 * speaks with, whose off switch lives in the same store, and the daily
 * session over the garden, whose minutes live there too. Every screen that
 * hears the reader takes Dictation from here, so two services never share
 * the module's one channel; the first minute's hear phase is the one screen
 * that reads aloud.
 *
 * The source is the module's replay of a scripted recital only in a
 * development build (`__DEV__`) on the simulator, which can never listen;
 * every other build hears the microphone. A device-info read that fails or
 * hangs counts as a device. The runtime is not kept alive: when the root
 * leaves, its scope closes, Dictation cancels a recital under way and the
 * voice stops a reading under way.
 */

import { Duration, Effect, Layer, Option, Stream } from 'effect';
import type * as KeyValueStore from 'effect/persistence/KeyValueStore';
import * as Atom from 'effect/reactivity/Atom';
import { One } from 'one';
import passage from 'virtual:heartseed-passage';

import { layer as dictationLayer, type DictationSource } from './dictation';
import { recite } from './dictation/script';
import { microphoneSource, replaySource } from './dictation/source';
import { cueIn, Garden, layer as gardenLayer, type Chime, type GardenView } from './garden';
import { liveChime } from './garden/chime';
import type { Cue } from './matcher';
import { sourceWords } from './matcher/words';
import { layer as sayItLayer, SayIt, TODAY, type Grade, type Haptics, type Recital } from './sayit';
import { liveHaptics } from './sayit/live';
import { SIMULATOR_PLAN, sourceKind } from './sayit/source';
import type { Passage } from './passage';
import type { Item, Minutes, TextPiece } from './session';
import { layer as sessionLayer, Session } from './session/service';
import { store } from './store';
import { Voice, layer as voiceLayer, type VoiceSource } from './voice';
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

/** The verses the app holds text for, in the order the session offers them: the passage alone, its own group. */
const PIECES: readonly TextPiece[] = [
  {
    reference: passage.reference,
    text: passage.text,
    words: sourceWords(passage.text).length,
    group: passage.reference,
  },
];

/** The app's services over its parts: Say it, the one Dictation it runs over, the garden over `store` its recalls grow, which sounds `chime`, the session over the garden and `pieces` (the app's own, the passage alone, when none are given), its minutes in the same `store`, and the voice over `voice`, its switch in the same `store`. */
export const appLayer = (parts: {
  readonly source: Layer.Layer<DictationSource>;
  readonly haptics: Layer.Layer<Haptics>;
  readonly store: Layer.Layer<KeyValueStore.KeyValueStore>;
  readonly chime: Layer.Layer<Chime>;
  readonly voice: Layer.Layer<VoiceSource>;
  readonly pieces?: readonly TextPiece[];
}) =>
  sayItLayer(passage).pipe(
    Layer.provideMerge(sessionLayer(parts.pieces ?? PIECES).pipe(Layer.provide(parts.store))),
    Layer.provideMerge(dictationLayer.pipe(Layer.provide(parts.source))),
    Layer.provideMerge(gardenLayer.pipe(Layer.provide(Layer.merge(parts.store, parts.chime)))),
    Layer.provideMerge(voiceLayer.pipe(Layer.provide(Layer.merge(parts.store, parts.voice)))),
    Layer.provide(parts.haptics),
  );

export const runtime = Atom.runtime(
  appLayer({
    source: appSource,
    haptics: liveHaptics,
    store,
    chime: liveChime,
    voice: voiceSource,
    pieces: PIECES,
  }),
);

/** What a screen shows of Say it. */
export const sayItView = runtime.atom(Stream.unwrap(Effect.map(SayIt, (sayIt) => sayIt.changes)));

/** What the garden knows, of which Today shows the passage's plant. */
export const gardenView = runtime.atom(
  Stream.unwrap(Effect.map(Garden, (garden) => garden.changes)),
);

/** What the hear phase shows of the voice: its switch, and the reading under way or the last one's ending. */
export const voiceView = runtime.atom(Stream.unwrap(Effect.map(Voice, (voice) => voice.changes)));

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

/** A tap on Today's Voice switch: the voice turns off when on and on when off, stored by the voice's own write. */
export const toggleVoice = runtime.fn(
  () =>
    Effect.flatMap(Voice, (voice) =>
      Effect.flatMap(voice.view, (view) => voice.setEnabled(!view.enabled)),
    ),
  { concurrent: true },
);

/** The cue a piece of Today's is said under next: the ladder's in a read garden, none in an unread one, which claims no stage. */
const todayCue = (view: GardenView, reference: string): Cue => {
  if (view._tag === 'Unread') return TODAY.cue;
  return cueIn(view, reference);
};

/**
 * Today's Say it of `piece`: a kept recital under the cue the garden gives
 * the piece once every keep handed to it before the press has landed or
 * failed (a grade changed just before is said after), or the finish of the
 * one under way. In a run, `item` is the plan's item shown, held in the same
 * step as the recital starts, so it stays shown until its `Next`.
 */
export const pressToday = (piece: Passage, item: Option.Option<Item> = Option.none()) =>
  Effect.gen(function* () {
    const sayIt = yield* SayIt;
    const garden = yield* Garden;
    const session = yield* Session;
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

/** A tap on Today's Next: the held item is let go. */
export const next = runtime.fn(() => Effect.flatMap(Session, (session) => session.next), {
  concurrent: true,
});

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

/** The hear phase's Next while a reading is under way: the voice stops. */
export const hush = runtime.fn(() => Effect.flatMap(Voice, (voice) => voice.stop), {
  concurrent: true,
});
