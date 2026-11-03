import { Effect, Option } from 'effect';

import type { SoundName } from './body';
import type { SoundPort } from './feel';
import { RECIPES, voiced } from './voice';

export interface VoiceNative {
  readonly load: (name: string, hash: string, wav: Uint8Array) => Promise<number>;
  readonly ready: (sounds: number, ms: number) => Promise<boolean>;
  readonly play: (id: number, name: string) => Promise<void>;
}

export interface Voice {
  readonly port: SoundPort;
  readonly load: Effect.Effect<void>;
}

export const silentVoice: Voice = { port: { play: () => {} }, load: Effect.void };

export const voiceOver = (native: VoiceNative, now: () => number): Voice => {
  const ids = new Map<SoundName, number>();
  const failed = { told: false };
  const loadOne = Effect.fn('Feel.loadSound')(function* (
    name: SoundName,
    recipe: (typeof RECIPES)[number][1],
  ) {
    const sound = voiced(name, recipe);
    const id = yield* Effect.tryPromise(() => native.load(sound.name, sound.hash, sound.wav)).pipe(
      Effect.tapError((error) =>
        Effect.logWarning(`[feel] voice.failed sound=${name} status=${String(error.cause)}`),
      ),
      Effect.orElseSucceed(() => 0),
    );
    if (id !== 0) ids.set(name, id);
  });
  const pass = { started: false };
  const load = Effect.gen(function* () {
    if (pass.started) return;
    pass.started = true;
    const start = now();
    for (const [name, recipe] of RECIPES) yield* loadOne(name, recipe);
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
