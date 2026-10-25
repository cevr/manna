/**
 * The sound port over the voice's native side (`native/feel/Voice.swift`,
 * iOS System Sound Services). One background pass renders each sound
 * (`voice.ts`), hands its WAV to the native side, and keeps the id it
 * answers; a cue then plays a sound by its id, fire and forget. A sound
 * cued before the pass has loaded it plays nothing (the cue's haptic still
 * plays), and a sound the native side refused stays silent.
 *
 * A failed play is logged once, never awaited in a gesture.
 */

import { Effect, Option } from 'effect';

import type { SoundName } from './body';
import type { SoundPort } from './feel';
import { RECIPES, voiced } from './voice';

/** The voice's native module, as One's native source declares it (`Voice.d.swift.ts`). */
export interface VoiceNative {
  readonly load: (name: string, hash: string, wav: Uint8Array) => Promise<number>;
  readonly ready: (sounds: number, ms: number) => Promise<boolean>;
  readonly play: (id: number, name: string) => Promise<void>;
}

export interface Voice {
  readonly port: SoundPort;
  /** The background pass, once: renders and loads every sound, then logs `[feel] ready`. */
  readonly load: Effect.Effect<void>;
}

/** A voice that holds no sound: the web's and Android's. */
export const silentVoice: Voice = { port: { play: () => {} }, load: Effect.void };

/** The voice over `native`, its pass timed by `now` (milliseconds). */
export const voiceOver = (native: VoiceNative, now: () => number): Voice => {
  const ids = new Map<SoundName, number>();
  const failed = { told: false };
  const loadOne = Effect.fn('Feel.loadSound')(function* (
    name: SoundName,
    clicks: (typeof RECIPES)[number][1],
  ) {
    const sound = voiced(name, clicks);
    const id = yield* Effect.tryPromise(() => native.load(sound.name, sound.hash, sound.wav)).pipe(
      Effect.tapError((error) =>
        Effect.logWarning(`[feel] voice.failed sound=${name} status=${String(error.cause)}`),
      ),
      Effect.orElseSucceed(() => 0),
    );
    if (id !== 0) ids.set(name, id);
  });
  // The pass runs once for the voice's life, however often it is asked for.
  const pass = { started: false };
  const load = Effect.gen(function* () {
    if (pass.started) return;
    pass.started = true;
    const start = now();
    for (const [name, clicks] of RECIPES) yield* loadOne(name, clicks);
    yield* Effect.tryPromise(() => native.ready(ids.size, Math.round(now() - start))).pipe(
      Effect.tapError((error) => Effect.logWarning(`[feel] ready.failed ${String(error.cause)}`)),
      Effect.ignore,
    );
  });
  const failOnce = (name: SoundName, cause: unknown) => {
    if (failed.told) return;
    failed.told = true;
    Effect.runFork(Effect.logWarning(`[feel] play.failed sound=${name} error=${String(cause)}`));
  };
  const play = (name: SoundName) =>
    Option.match(Option.fromNullishOr(ids.get(name)), {
      onNone: () => {},
      onSome: (id) => void native.play(id, name).catch((cause: unknown) => failOnce(name, cause)),
    });
  return { port: { play }, load };
};
