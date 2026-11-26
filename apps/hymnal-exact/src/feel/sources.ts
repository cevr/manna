/* oxlint-disable effect/noNullish, effect/noTernary, effect/noAsyncFunction, effect/noRuntimeTypeof, effect/noUnsafeDictionaryType, effect/noUnknownParameters -- Exact's data module imports no effect (docs/exact.md): no module is a plain null, a source answers a Promise the host awaits and is handed the store and storage it does not read, and the module answers untyped JSON read field by field, as the pinch's sources take it. */

import { FEEL_ROWS, FEEL_SOUNDS } from './cues.ts';

/** The app's module as a source is handed it. */
interface Native {
  readonly available: boolean;
  later(request: Record<string, unknown>): Promise<Record<string, unknown>>;
}

/** The voice's load: how many sounds the module holds (none on the web). */
export interface FeelLoaded {
  readonly loaded: number;
}

/** One sound sent: its turn, its name, and whether a module was asked to play it. */
export interface FeelSent {
  readonly serial: number;
  readonly sound: string;
  readonly asked: boolean;
}

/** The request that plays `sound` `wait` ms from now (now when 0 or less), as `modules/apple/Feel.swift` takes it. */
export const playRequest = (sound: string, wait: number) => ({
  op: 'feel.play',
  name: sound,
  wait: Math.max(0, wait),
});

/**
 * The Feel's sources, as `app.ts` registers them: `feelRows()` answers the
 * table; `feelLoad()` asks the app's module to make the voice's sounds once,
 * at launch, as the current `FeelProvider` loads its voice; `feelSound(name,
 * wait)` asks it to play one and answers at once, never awaiting the play,
 * as the current `sound.ts` never awaits one in a gesture (a failed play is
 * dropped there, as here). The web's module holds no voice and answers no-op.
 */
export const feelSources = () => {
  let serial = 0;
  return {
    feelRows: () =>
      FEEL_ROWS.map((row) => ({ ...row, sounds: [...row.sounds], lengths: [...row.lengths] })),
    feelLoad: async (
      _args: readonly [],
      _store: unknown,
      _storage: unknown,
      native?: Native | null,
    ): Promise<FeelLoaded> => {
      if (native == null || !native.available) return { loaded: 0 };
      const got: Record<string, unknown> = await native
        .later({ op: 'feel.load', names: FEEL_SOUNDS.join(' ') })
        .catch(() => ({}));
      const loaded = got['loaded'];
      return { loaded: typeof loaded === 'number' ? loaded : 0 };
    },
    feelSound: async (
      [sound, wait]: readonly [string, number],
      _store: unknown,
      _storage: unknown,
      native?: Native | null,
    ): Promise<FeelSent> => {
      serial += 1;
      if (native == null || !native.available || !FEEL_SOUNDS.includes(sound))
        return { serial, sound, asked: false };
      void native.later(playRequest(sound, wait)).catch(() => ({}));
      return { serial, sound, asked: true };
    },
  };
};
