/**
 * The app's one runtime for the reader's screens: one `Dictation` over the
 * source this build hears, Say it over it, the soft tick, the garden, which
 * keeps each of Say it's kept recalls in the app's store on the device and
 * sounds the growth chime, and the voice over the source this platform
 * speaks with, whose off switch lives in the same store. Every screen that
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

import { Duration, Effect, Layer, Stream } from 'effect';
import type * as KeyValueStore from 'effect/persistence/KeyValueStore';
import * as Atom from 'effect/reactivity/Atom';
import { One } from 'one';
import passage from 'virtual:heartseed-passage';

import { layer as dictationLayer, type DictationSource } from './dictation';
import { recite } from './dictation/script';
import { microphoneSource, replaySource } from './dictation/source';
import { Garden, layer as gardenLayer, type Chime } from './garden';
import { liveChime } from './garden/chime';
import { layer as sayItLayer, SayIt, type Grade, type Haptics, type Recital } from './sayit';
import { liveHaptics } from './sayit/live';
import { SIMULATOR_PLAN, sourceKind } from './sayit/source';
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

/** The app's services over its parts: Say it, the one Dictation it runs over, the garden over `store` its recalls grow, which sounds `chime`, and the voice over `voice`, its switch in the same `store`. */
export const appLayer = (parts: {
  readonly source: Layer.Layer<DictationSource>;
  readonly haptics: Layer.Layer<Haptics>;
  readonly store: Layer.Layer<KeyValueStore.KeyValueStore>;
  readonly chime: Layer.Layer<Chime>;
  readonly voice: Layer.Layer<VoiceSource>;
}) =>
  sayItLayer(passage).pipe(
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

/** A press of Today's button. Each command runs to its end, so a second tap never cuts off the first one's recall. */
export const press = runtime.fn(() => Effect.flatMap(SayIt, (sayIt) => sayIt.press), {
  concurrent: true,
});

/** A press of the first minute's Say it: a recital under its cue, kept or not. */
export const sayAs = runtime.fn(
  (how: Recital) => Effect.flatMap(SayIt, (sayIt) => sayIt.recite(how)),
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
