/**
 * The router between the system voice and the natural voice, and the voice
 * the app builds over it. Each speak goes to the natural voice while
 * `Natural.reads` holds (the download ready and the fuse clear), else to the
 * system voice; a natural speak that fails before its first audio is read
 * again, the same utterance, by the system voice. Only the active voice's
 * events reach the listeners. A stop goes to both voices and returns after
 * both; a pause or a resume goes to the active voice alone.
 */

import { Context, Effect, Layer } from 'effect';
import type * as KeyValueStore from 'effect/persistence/KeyValueStore';

import {
  layer as voiceLayer,
  nextChoice,
  Voice,
  VoiceSource,
  type Speaking,
  type VoiceEvent,
} from '../voice';
import { lexicon } from './lexicon';
import type { NaturalModule } from './module';
import { layer as naturalLayer, Natural } from './service';
import { naturalVoiceSource } from './voice';

/** The voice that holds the reading now. */
type Active = 'system' | 'natural';

/** The routed source over the system source and the natural source, asking `Natural` which reads. */
const routed = (
  system: Layer.Layer<VoiceSource>,
  natural: Layer.Layer<VoiceSource, never, NaturalModule>,
): Layer.Layer<VoiceSource, never, Natural | NaturalModule> =>
  Layer.effect(
    VoiceSource,
    Effect.gen(function* () {
      const service = yield* Natural;
      const scope = yield* Effect.scope;
      const sys = Context.get(yield* Layer.buildWithScope(system, scope), VoiceSource);
      const nat = Context.get(yield* Layer.buildWithScope(natural, scope), VoiceSource);
      const listeners = new Set<(event: VoiceEvent) => void>();
      let active: Active = 'system';
      const hear = (from: Active) => (event: VoiceEvent) => {
        if (from !== active) return;
        for (const listener of listeners) listener(event);
      };
      /** The source the active voice is. */
      const holding = () => {
        if (active === 'natural') return nat;
        return sys;
      };
      yield* sys.subscribe(hear('system'));
      yield* nat.subscribe(hear('natural'));

      /** Speaks naturally; true once the first audio plays, false (logged) when it failed before. */
      const speakNaturally = (utterance: number, text: string, speaking: Speaking) =>
        nat.speak(utterance, text, speaking).pipe(
          Effect.as(true),
          Effect.catchTag('VoiceUnavailable', (error) =>
            Effect.logWarning('natural.fallback').pipe(
              Effect.annotateLogs({ utterance, reason: error.reason }),
              Effect.as(false),
            ),
          ),
        );

      return VoiceSource.of({
        voices: sys.voices,
        speak: (utterance, text, speaking) =>
          Effect.gen(function* () {
            if (yield* service.reads) {
              yield* sys.stop;
              active = 'natural';
              if (yield* speakNaturally(utterance, text, speaking)) return;
            } else {
              yield* nat.stop;
            }
            active = 'system';
            return yield* sys.speak(utterance, text, speaking);
          }),
        pause: Effect.suspend(() => holding().pause),
        resume: Effect.suspend(() => holding().resume),
        stop: Effect.andThen(sys.stop, nat.stop),
        subscribe: (listener) =>
          Effect.asVoid(
            Effect.acquireRelease(
              Effect.sync(() => listeners.add(listener)),
              () => Effect.sync(() => listeners.delete(listener)),
            ),
          ),
      });
    }),
  );

/**
 * The `Voice` and `Natural` services over the system voice and the platform's
 * module: the natural source, the router and the voice over it, then the
 * download begun with the stored choice.
 */
export const naturalVoices = (parts: {
  readonly system: Layer.Layer<VoiceSource>;
  readonly module: Layer.Layer<NaturalModule>;
  readonly dev: boolean;
}): Layer.Layer<Voice | Natural, never, KeyValueStore.KeyValueStore> => {
  const natural = naturalLayer(parts.dev).pipe(Layer.provide(parts.module));
  const source = Layer.unwrap(
    Effect.sync(() => routed(parts.system, naturalVoiceSource(lexicon))),
  ).pipe(Layer.provide(Layer.merge(natural, parts.module)));
  const voice = voiceLayer.pipe(Layer.provide(source));
  const begun = Layer.effectDiscard(
    Effect.gen(function* () {
      const view = yield* (yield* Voice).view;
      yield* (yield* Natural).begin(view.choice);
    }),
  );
  return begun.pipe(Layer.provideMerge(Layer.merge(voice, natural)));
};

/** A Voice tap: the natural voice hears the next choice first (the fuse and the line clear, the download may start), then the voice takes it. */
export const tapVoice: Effect.Effect<void, never, Voice | Natural> = Effect.gen(function* () {
  const voice = yield* Voice;
  const natural = yield* Natural;
  const next = nextChoice((yield* voice.view).choice);
  yield* natural.chosen(next);
  yield* voice.choose(next);
});
